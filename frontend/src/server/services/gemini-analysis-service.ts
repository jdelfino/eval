/**
 * Gemini Analysis Service
 *
 * Provides AI-powered analysis of student code submissions using Google's Gemini API.
 * Generates walkthrough scripts that help instructors discuss submissions during lectures.
 */

import {
  AnalysisInput,
  WalkthroughScript,
  AnalysisIssue,
  GeminiAnalysisResponseV2,
  IssueSeverity,
} from '@/server/types/analysis';

// Configuration constants
// Note: gemini-2.0-flash and gemini-2.0-flash-lite have limit=0 on free tier
// Trying gemini-2.5-flash-lite
const GEMINI_MODEL = 'gemini-2.5-flash-lite';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1/models';
const REQUEST_TIMEOUT_MS = 30000;
const MIN_CODE_LENGTH = 20;
const STARTER_CODE_DIFF_THRESHOLD = 0.1; // 10% - submissions with <10% diff from starter are filtered
const MAX_SUBMISSIONS_TO_ANALYZE = 30;
const FILTER_WARNING_THRESHOLD = 0.3; // 30% - warn if this many submissions are filtered

/**
 * Calculate simple diff ratio between two strings
 * Returns a value between 0 (identical) and 1 (completely different)
 */
function calculateDiffRatio(str1: string, str2: string): number {
  if (!str1 && !str2) return 0;
  if (!str1 || !str2) return 1;

  // Normalize whitespace for comparison
  const norm1 = str1.replace(/\s+/g, ' ').trim();
  const norm2 = str2.replace(/\s+/g, ' ').trim();

  if (norm1 === norm2) return 0;

  // Simple character-based diff ratio (Levenshtein-like but simpler)
  const maxLen = Math.max(norm1.length, norm2.length);
  if (maxLen === 0) return 0;

  let differences = 0;
  const minLen = Math.min(norm1.length, norm2.length);

  for (let i = 0; i < minLen; i++) {
    if (norm1[i] !== norm2[i]) differences++;
  }
  differences += Math.abs(norm1.length - norm2.length);

  return differences / maxLen;
}

/**
 * Generate anonymous student label (A, B, C, ..., Z, AA, AB, ...)
 */
function generateStudentLabel(index: number): string {
  let label = '';
  let n = index;
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return `Student ${label}`;
}

/**
 * Filter submissions that are empty, too small, or match starter code
 */
interface FilterResult {
  filtered: Array<{ studentId: string; code: string; label: string }>;
  filteredOutCount: number;
  warning?: string;
}

function filterSubmissions(
  submissions: Array<{ studentId: string; code: string }>,
  starterCode: string
): FilterResult {
  const normalizedStarter = starterCode.trim();
  let filteredOutCount = 0;

  const filtered: Array<{ studentId: string; code: string; label: string }> = [];

  for (const submission of submissions) {
    const code = submission.code.trim();

    // Filter empty or tiny submissions
    if (code.length < MIN_CODE_LENGTH) {
      filteredOutCount++;
      continue;
    }

    // Filter submissions that closely match starter code
    if (normalizedStarter) {
      const diffRatio = calculateDiffRatio(code, normalizedStarter);
      if (diffRatio < STARTER_CODE_DIFF_THRESHOLD) {
        filteredOutCount++;
        continue;
      }
    }

    filtered.push({
      studentId: submission.studentId,
      code,
      label: generateStudentLabel(filtered.length),
    });
  }

  // Generate warning if many submissions were filtered
  let warning: string | undefined;
  const totalCount = submissions.length;
  if (totalCount > 0 && filteredOutCount / totalCount >= FILTER_WARNING_THRESHOLD) {
    const percentage = Math.round((filteredOutCount / totalCount) * 100);
    warning = `Note: ${percentage}% of submissions were empty or unchanged from starter code - many students may need help getting started`;
  }

  return { filtered, filteredOutCount, warning };
}

/**
 * Build the prompt for Gemini analysis (v2 issue-based format)
 */
function buildPrompt(
  problemTitle: string,
  problemDescription: string,
  submissions: Array<{ label: string; code: string }>
): string {
  const submissionsText = submissions
    .map((s) => `[${s.label.replace('Student ', '')}]: \`\`\`python\n${s.code}\n\`\`\``)
    .join('\n\n');

  return `You are an experienced CS instructor analyzing student code submissions for a live classroom walkthrough.

## Problem
${problemTitle}
${problemDescription || '(No description provided)'}

## Student Submissions
${submissionsText}

## Task
Identify distinct bugs, misconceptions, or patterns across all submissions. Group students by issue. A student can appear in multiple issues. Order issues by frequency (most common first).

Also classify each student as either finished (code appears complete and correct) or in-progress (still working, has bugs, or incomplete).

## Output (JSON only, no markdown code blocks)
{
  "issues": [
    {
      "title": "Short issue title",
      "explanation": "One sentence explaining the issue",
      "studentLabels": ["A", "C"],
      "severity": "error|misconception|style|good-pattern"
    }
  ],
  "finishedStudentLabels": ["B", "D"],
  "overallNote": "Optional one-sentence note about the class overall"
}

## Guidelines
- Be CONCISE - instructor reads this live during lecture
- Maximum 10 issues
- Title: short (3-8 words)
- Explanation: one sentence, actionable
- severity must be one of: error, misconception, style, good-pattern
- studentLabels: just the letters (A, B, C, etc.)
- finishedStudentLabels: letters of students whose code is complete and correct
- Only include issues that are pedagogically interesting`;
}

/**
 * Parse Gemini response into structured format (v2 issue-based)
 */
function parseGeminiResponse(
  responseText: string,
  labelToStudentId: Map<string, string>
): GeminiAnalysisResponseV2 {
  // Try to extract JSON from the response (handle markdown code blocks)
  let jsonText = responseText.trim();
  const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonMatch) {
    jsonText = jsonMatch[1].trim();
  }

  const parsed = JSON.parse(jsonText);

  if (!Array.isArray(parsed.issues)) {
    throw new Error('Invalid response: issues must be an array');
  }

  const validSeverities: IssueSeverity[] = ['error', 'misconception', 'style', 'good-pattern'];

  const issues = parsed.issues.map((issue: { title?: string; explanation?: string; studentLabels?: string[]; severity?: string }) => {
    const studentLabels = Array.isArray(issue.studentLabels) ? issue.studentLabels : [];

    // Validate all student labels exist
    for (const label of studentLabels) {
      const upper = label.toUpperCase();
      if (!labelToStudentId.has(upper)) {
        throw new Error(`Unknown student label in response: ${label}`);
      }
    }

    const severity = validSeverities.includes(issue.severity as IssueSeverity)
      ? (issue.severity as IssueSeverity)
      : 'error';

    return {
      title: issue.title || '',
      explanation: issue.explanation || '',
      studentLabels: studentLabels.map((l: string) => l.toUpperCase()),
      severity,
    };
  });

  const finishedStudentLabels = Array.isArray(parsed.finishedStudentLabels)
    ? parsed.finishedStudentLabels.map((l: string) => l.toUpperCase())
    : [];

  return {
    issues,
    finishedStudentLabels,
    overallNote: parsed.overallNote || undefined,
  };
}

/**
 * GeminiAnalysisService - Manages interaction with Gemini API for code analysis
 */
export class GeminiAnalysisService {
  private apiKey: string;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.GEMINI_API_KEY || '';
  }

  /**
   * Check if the service is configured with an API key
   */
  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  /**
   * Analyze student submissions and generate a walkthrough script
   */
  async analyzeSubmissions(input: AnalysisInput): Promise<WalkthroughScript> {
    if (!this.isConfigured()) {
      throw new Error('Gemini API key not configured. Set GEMINI_API_KEY environment variable.');
    }

    const totalSubmissions = input.submissions.length;

    // Handle edge case: no submissions
    if (totalSubmissions === 0) {
      return {
        sessionId: input.sessionId,
        issues: [],
        finishedStudentIds: [],
        summary: {
          totalSubmissions: 0,
          filteredOut: 0,
          analyzedSubmissions: 0,
          completionEstimate: { finished: 0, inProgress: 0, notStarted: 0 },
          warning: 'No submissions to analyze',
        },
        generatedAt: new Date(),
      };
    }

    // Pre-filter submissions
    const { filtered, filteredOutCount, warning } = filterSubmissions(
      input.submissions,
      input.starterCode
    );

    // Handle edge case: all submissions filtered
    if (filtered.length === 0) {
      return {
        sessionId: input.sessionId,
        issues: [],
        finishedStudentIds: [],
        summary: {
          totalSubmissions,
          filteredOut: filteredOutCount,
          analyzedSubmissions: 0,
          completionEstimate: { finished: 0, inProgress: 0, notStarted: filteredOutCount },
          warning: "Most students haven't modified the starter code yet",
        },
        generatedAt: new Date(),
      };
    }

    // Sample if too many submissions
    let toAnalyze = filtered;
    if (filtered.length > MAX_SUBMISSIONS_TO_ANALYZE) {
      // Take most recent (assuming they're in order)
      toAnalyze = filtered.slice(-MAX_SUBMISSIONS_TO_ANALYZE);
    }

    // Build label to studentId mapping for response parsing
    const labelToStudentId = new Map<string, string>();
    for (const sub of toAnalyze) {
      const letter = sub.label.replace('Student ', '');
      labelToStudentId.set(letter, sub.studentId);
    }

    // Build prompt and call Gemini
    const prompt = buildPrompt(
      input.problemTitle,
      input.problemDescription,
      toAnalyze.map((s) => ({ label: s.label, code: s.code }))
    );

    // Log prompt size for debugging
    console.warn(`[Gemini] Analyzing ${toAnalyze.length} submissions, prompt length: ${prompt.length} chars (~${Math.ceil(prompt.length / 4)} tokens)`);

    const responseText = await this.callGeminiAPI(prompt);

    // Parse response
    const parsedResponse = parseGeminiResponse(responseText, labelToStudentId);

    // Build AnalysisIssue[] from parsed response
    const issues: AnalysisIssue[] = parsedResponse.issues.filter(
      (issue) => issue.studentLabels.length > 0
    ).map((issue) => {
      const studentIds = issue.studentLabels
        .map((label) => labelToStudentId.get(label))
        .filter((id): id is string => id !== undefined);

      const firstLabel = issue.studentLabels[0];
      const firstStudentId = labelToStudentId.get(firstLabel) || '';

      return {
        title: issue.title,
        explanation: issue.explanation,
        count: studentIds.length,
        studentIds,
        representativeStudentLabel: firstLabel ? `Student ${firstLabel}` : '',
        representativeStudentId: firstStudentId,
        severity: issue.severity,
      };
    });

    // Compute completionEstimate and finishedStudentIds
    const finishedStudentIds = parsedResponse.finishedStudentLabels
      .map((label) => labelToStudentId.get(label))
      .filter((id): id is string => id !== undefined);
    const finishedCount = finishedStudentIds.length;
    const inProgressCount = toAnalyze.length - finishedCount;
    const notStartedCount = filteredOutCount;

    return {
      sessionId: input.sessionId,
      issues,
      finishedStudentIds,
      summary: {
        totalSubmissions,
        filteredOut: filteredOutCount,
        analyzedSubmissions: toAnalyze.length,
        completionEstimate: {
          finished: finishedCount,
          inProgress: inProgressCount,
          notStarted: notStartedCount,
        },
        warning,
      },
      overallNote: parsedResponse.overallNote,
      generatedAt: new Date(),
    };
  }

  /**
   * Call Gemini API with the given prompt
   */
  private async callGeminiAPI(prompt: string): Promise<string> {
    const url = `${GEMINI_API_URL}/${GEMINI_MODEL}:generateContent`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': this.apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: prompt }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 2048,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(`[Gemini] API error ${response.status}:`, errorBody);

        if (response.status === 429) {
          throw new Error('Rate limit exceeded. Please try again later.');
        }

        if (response.status === 503) {
          throw new Error('AI model is temporarily overloaded. Please try again in a few moments.');
        }

        if (response.status === 401 || response.status === 403) {
          throw new Error('Invalid Gemini API key. Please check your configuration.');
        }

        throw new Error(`Gemini API error (${response.status}). Please try again later.`);
      }

      const data = await response.json();

      // Extract text from Gemini response
      const candidates = data.candidates;
      if (!candidates || candidates.length === 0) {
        throw new Error('No response generated by Gemini');
      }

      const content = candidates[0].content;
      if (!content || !content.parts || content.parts.length === 0) {
        throw new Error('Empty response from Gemini');
      }

      return content.parts[0].text || '';
    } catch (error) {
      clearTimeout(timeout);

      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Analysis timed out. Try with fewer students.');
        }
        throw error;
      }

      throw new Error('Unknown error calling Gemini API');
    }
  }
}

// Export singleton instance for convenience
let defaultService: GeminiAnalysisService | null = null;

export function getGeminiService(): GeminiAnalysisService {
  if (!defaultService) {
    defaultService = new GeminiAnalysisService();
  }
  return defaultService;
}

// Export for testing
export { filterSubmissions, buildPrompt, parseGeminiResponse, calculateDiffRatio };
