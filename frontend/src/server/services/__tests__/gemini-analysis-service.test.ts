/**
 * Tests for GeminiAnalysisService
 *
 * Tests the pre-filtering logic, prompt building, response parsing,
 * and error handling. Mocks the Gemini API for unit testing.
 */

import {
  GeminiAnalysisService,
  filterSubmissions,
  buildPrompt,
  parseGeminiResponse,
  calculateDiffRatio,
} from '../gemini-analysis-service';
import { AnalysisInput } from '@/server/types/analysis';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('GeminiAnalysisService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('calculateDiffRatio', () => {
    it('returns 0 for identical strings', () => {
      expect(calculateDiffRatio('hello', 'hello')).toBe(0);
    });

    it('returns 0 for identical strings with different whitespace', () => {
      expect(calculateDiffRatio('hello  world', 'hello world')).toBe(0);
    });

    it('returns 1 for completely different strings', () => {
      const ratio = calculateDiffRatio('abc', 'xyz');
      expect(ratio).toBeGreaterThan(0.5);
    });

    it('returns 0 for empty strings', () => {
      expect(calculateDiffRatio('', '')).toBe(0);
    });

    it('returns 1 when one string is empty', () => {
      expect(calculateDiffRatio('hello', '')).toBe(1);
      expect(calculateDiffRatio('', 'hello')).toBe(1);
    });
  });

  describe('filterSubmissions', () => {
    const starterCode = 'print("Hello, World!")';

    it('filters out empty submissions', () => {
      const submissions = [
        { studentId: 's1', code: '' },
        { studentId: 's2', code: 'print("This is long enough code")' },
        { studentId: 's3', code: '   ' },
      ];

      const result = filterSubmissions(submissions, starterCode);

      expect(result.filtered).toHaveLength(1);
      expect(result.filtered[0].studentId).toBe('s2');
      expect(result.filteredOutCount).toBe(2);
    });

    it('filters out tiny submissions', () => {
      const submissions = [
        { studentId: 's1', code: 'x = 1' },
        { studentId: 's2', code: 'print("This is long enough code")' },
      ];

      const result = filterSubmissions(submissions, starterCode);

      expect(result.filtered).toHaveLength(1);
      expect(result.filtered[0].studentId).toBe('s2');
      expect(result.filteredOutCount).toBe(1);
    });

    it('filters submissions matching starter code', () => {
      const submissions = [
        { studentId: 's1', code: 'print("Hello, World!")' },
        { studentId: 's2', code: 'print("Different code here!")' },
      ];

      const result = filterSubmissions(submissions, starterCode);

      expect(result.filtered).toHaveLength(1);
      expect(result.filtered[0].studentId).toBe('s2');
      expect(result.filteredOutCount).toBe(1);
    });

    it('generates warning when many submissions are filtered', () => {
      const submissions = [
        { studentId: 's1', code: '' },
        { studentId: 's2', code: '' },
        { studentId: 's3', code: '' },
        { studentId: 's4', code: 'print("Long enough code here")' },
      ];

      const result = filterSubmissions(submissions, starterCode);

      expect(result.warning).toContain('75%');
      expect(result.warning).toContain('empty or unchanged');
    });

    it('assigns sequential labels to filtered submissions', () => {
      const submissions = [
        { studentId: 's1', code: 'print("Code A is here now")' },
        { studentId: 's2', code: 'print("Code B is here now")' },
        { studentId: 's3', code: 'print("Code C is here now")' },
      ];

      const result = filterSubmissions(submissions, '');

      expect(result.filtered[0].label).toBe('Student A');
      expect(result.filtered[1].label).toBe('Student B');
      expect(result.filtered[2].label).toBe('Student C');
    });
  });

  describe('buildPrompt', () => {
    it('builds prompt mentioning issues and patterns', () => {
      const submissions = [
        { label: 'Student A', code: 'print("A")' },
        { label: 'Student B', code: 'print("B")' },
      ];

      const prompt = buildPrompt('Test Problem', 'Solve this', submissions);

      expect(prompt).toContain('Test Problem');
      expect(prompt).toContain('Solve this');
      expect(prompt).toContain('[A]:');
      expect(prompt).toContain('print("A")');
      expect(prompt).toContain('[B]:');
      expect(prompt).toContain('print("B")');
      expect(prompt).toContain('JSON only');
      // v2: should mention issues/patterns and finished classification
      expect(prompt).toContain('issues');
      expect(prompt).toContain('patterns');
      expect(prompt).toContain('finishedStudentLabels');
      expect(prompt).toContain('severity');
    });

    it('handles missing description', () => {
      const prompt = buildPrompt('Test', '', [{ label: 'Student A', code: 'x' }]);
      expect(prompt).toContain('(No description provided)');
    });
  });

  describe('parseGeminiResponse', () => {
    const labelToStudentId = new Map([
      ['A', 'student-1'],
      ['B', 'student-2'],
      ['C', 'student-3'],
    ]);

    it('parses valid v2 JSON response', () => {
      const response = JSON.stringify({
        issues: [
          {
            title: 'Missing null check',
            explanation: 'Students forgot to handle None input',
            studentLabels: ['A', 'C'],
            severity: 'error',
          },
          {
            title: 'Clean variable naming',
            explanation: 'Good use of descriptive names',
            studentLabels: ['B'],
            severity: 'good-pattern',
          },
        ],
        finishedStudentLabels: ['B'],
        overallNote: 'Most students are progressing well',
      });

      const result = parseGeminiResponse(response, labelToStudentId);

      expect(result.issues).toHaveLength(2);
      expect(result.issues[0].title).toBe('Missing null check');
      expect(result.issues[0].explanation).toBe('Students forgot to handle None input');
      expect(result.issues[0].studentLabels).toEqual(['A', 'C']);
      expect(result.issues[0].severity).toBe('error');
      expect(result.issues[1].severity).toBe('good-pattern');
      expect(result.finishedStudentLabels).toEqual(['B']);
      expect(result.overallNote).toBe('Most students are progressing well');
    });

    it('handles JSON wrapped in markdown code blocks', () => {
      const response = '```json\n{"issues": [], "finishedStudentLabels": []}\n```';

      const result = parseGeminiResponse(response, labelToStudentId);

      expect(result.issues).toHaveLength(0);
      expect(result.finishedStudentLabels).toEqual([]);
    });

    it('throws error for unknown student label', () => {
      const response = JSON.stringify({
        issues: [
          { title: 'Bug', explanation: 'x', studentLabels: ['Z'], severity: 'error' },
        ],
        finishedStudentLabels: [],
      });

      expect(() => parseGeminiResponse(response, labelToStudentId)).toThrow('Unknown student label');
    });

    it('defaults invalid severity to error', () => {
      const response = JSON.stringify({
        issues: [
          { title: 'Bug', explanation: 'x', studentLabels: ['A'], severity: 'invalid' },
        ],
        finishedStudentLabels: [],
      });

      const result = parseGeminiResponse(response, labelToStudentId);

      expect(result.issues[0].severity).toBe('error');
    });

    it('handles missing finishedStudentLabels gracefully', () => {
      const response = JSON.stringify({
        issues: [],
      });

      const result = parseGeminiResponse(response, labelToStudentId);

      expect(result.finishedStudentLabels).toEqual([]);
      expect(result.overallNote).toBeUndefined();
    });

    it('normalizes student labels to uppercase', () => {
      const response = JSON.stringify({
        issues: [
          { title: 'Bug', explanation: 'x', studentLabels: ['a', 'b'], severity: 'error' },
        ],
        finishedStudentLabels: ['b'],
      });

      const result = parseGeminiResponse(response, labelToStudentId);

      expect(result.issues[0].studentLabels).toEqual(['A', 'B']);
      expect(result.finishedStudentLabels).toEqual(['B']);
    });
  });

  describe('GeminiAnalysisService', () => {
    describe('isConfigured', () => {
      it('returns false when no API key', () => {
        const service = new GeminiAnalysisService('');
        expect(service.isConfigured()).toBe(false);
      });

      it('returns true when API key provided', () => {
        const service = new GeminiAnalysisService('test-key');
        expect(service.isConfigured()).toBe(true);
      });
    });

    describe('analyzeSubmissions', () => {
      const service = new GeminiAnalysisService('test-api-key');

      const baseInput: AnalysisInput = {
        sessionId: 'session-1',
        problemTitle: 'Test Problem',
        problemDescription: 'Test description',
        starterCode: '',
        submissions: [],
      };

      it('returns empty script for no submissions', async () => {
        const result = await service.analyzeSubmissions(baseInput);

        expect(result.issues).toHaveLength(0);
        expect(result.summary.totalSubmissions).toBe(0);
        expect(result.summary.completionEstimate).toEqual({ finished: 0, inProgress: 0, notStarted: 0 });
        expect(result.summary.warning).toBe('No submissions to analyze');
      });

      it('returns empty script when all submissions filtered', async () => {
        const input: AnalysisInput = {
          ...baseInput,
          submissions: [{ studentId: 's1', code: '' }],
        };

        const result = await service.analyzeSubmissions(input);

        expect(result.issues).toHaveLength(0);
        expect(result.summary.filteredOut).toBe(1);
        expect(result.summary.completionEstimate).toEqual({ finished: 0, inProgress: 0, notStarted: 1 });
        expect(result.summary.warning).toContain("haven't modified");
      });

      it('calls Gemini API and returns parsed issues and completionEstimate', async () => {
        const mockResponse = {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      issues: [
                        {
                          title: 'Missing edge case',
                          explanation: 'Does not handle empty input',
                          studentLabels: ['A'],
                          severity: 'error',
                        },
                      ],
                      finishedStudentLabels: ['B'],
                      overallNote: 'Good progress overall',
                    }),
                  },
                ],
              },
            },
          ],
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const input: AnalysisInput = {
          ...baseInput,
          submissions: [
            { studentId: 'student-1', code: 'print("Long enough code here")' },
            { studentId: 'student-2', code: 'print("Another long enough code")' },
          ],
        };

        const result = await service.analyzeSubmissions(input);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        expect(result.issues).toHaveLength(1);
        expect(result.issues[0].title).toBe('Missing edge case');
        expect(result.issues[0].studentIds).toEqual(['student-1']);
        expect(result.issues[0].count).toBe(1);
        expect(result.issues[0].representativeStudentLabel).toBe('Student A');
        expect(result.issues[0].representativeStudentId).toBe('student-1');
        expect(result.issues[0].severity).toBe('error');
        expect(result.summary.completionEstimate).toEqual({ finished: 1, inProgress: 1, notStarted: 0 });
        expect(result.overallNote).toBe('Good progress overall');
      });

      it('passes API key in x-goog-api-key header, not in URL', async () => {
        const mockResponse = {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      issues: [],
                      finishedStudentLabels: [],
                    }),
                  },
                ],
              },
            },
          ],
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const input: AnalysisInput = {
          ...baseInput,
          submissions: [{ studentId: 'student-1', code: 'print("Long enough code here")' }],
        };

        await service.analyzeSubmissions(input);

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url, options] = mockFetch.mock.calls[0];

        expect(url).not.toContain('key=');
        expect(url).not.toContain('test-api-key');
        expect(options.headers).toHaveProperty('x-goog-api-key', 'test-api-key');
      });

      it('throws error when not configured', async () => {
        const unconfiguredService = new GeminiAnalysisService('');

        await expect(unconfiguredService.analyzeSubmissions(baseInput)).rejects.toThrow(
          'Gemini API key not configured'
        );
      });

      it('handles rate limit error with sanitized message (no error body leaked)', async () => {
        const sensitiveErrorBody = '{"error": {"message": "API key abc123xyz leaked in error"}}';
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: () => Promise.resolve(sensitiveErrorBody),
        });

        const input: AnalysisInput = {
          ...baseInput,
          submissions: [{ studentId: 's1', code: 'print("Long enough code here")' }],
        };

        await expect(service.analyzeSubmissions(input)).rejects.toThrow(
          'Rate limit exceeded. Please try again later.'
        );

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[Gemini] API error 429:',
          sensitiveErrorBody
        );

        consoleErrorSpy.mockRestore();
      });

      it('rate limit error message does not contain error body', async () => {
        const sensitiveData = 'secret-api-response-data-should-not-be-exposed';
        jest.spyOn(console, 'error').mockImplementation(() => {});

        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 429,
          text: () => Promise.resolve(sensitiveData),
        });

        const input: AnalysisInput = {
          ...baseInput,
          submissions: [{ studentId: 's1', code: 'print("Long enough code here")' }],
        };

        try {
          await service.analyzeSubmissions(input);
          fail('Expected error to be thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          const errorMessage = (error as Error).message;
          expect(errorMessage).not.toContain(sensitiveData);
          expect(errorMessage).toBe('Rate limit exceeded. Please try again later.');
        }

        jest.restoreAllMocks();
      });

      it('handles model overloaded error (503)', async () => {
        jest.spyOn(console, 'error').mockImplementation(() => {});

        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 503,
          text: () => Promise.resolve('Service Unavailable'),
        });

        const input: AnalysisInput = {
          ...baseInput,
          submissions: [{ studentId: 's1', code: 'print("Long enough code here")' }],
        };

        await expect(service.analyzeSubmissions(input)).rejects.toThrow(
          'AI model is temporarily overloaded. Please try again in a few moments.'
        );

        jest.restoreAllMocks();
      });

      it('handles invalid API key error', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 401,
          text: () => Promise.resolve('Unauthorized'),
        });

        const input: AnalysisInput = {
          ...baseInput,
          submissions: [{ studentId: 's1', code: 'print("Long enough code here")' }],
        };

        await expect(service.analyzeSubmissions(input)).rejects.toThrow('Invalid Gemini API key');
      });

      it('handles empty response from Gemini', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ candidates: [] }),
        });

        const input: AnalysisInput = {
          ...baseInput,
          submissions: [{ studentId: 's1', code: 'print("Long enough code here")' }],
        };

        await expect(service.analyzeSubmissions(input)).rejects.toThrow('No response generated');
      });

      it('handles generic API error with sanitized message (no error body leaked)', async () => {
        const sensitiveErrorBody = '{"internal_error": "database connection to secret-host.internal failed"}';
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          text: () => Promise.resolve(sensitiveErrorBody),
        });

        const input: AnalysisInput = {
          ...baseInput,
          submissions: [{ studentId: 's1', code: 'print("Long enough code here")' }],
        };

        try {
          await service.analyzeSubmissions(input);
          fail('Expected error to be thrown');
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
          const errorMessage = (error as Error).message;
          expect(errorMessage).not.toContain(sensitiveErrorBody);
          expect(errorMessage).not.toContain('secret-host');
          expect(errorMessage).not.toContain('database');
          expect(errorMessage).toBe('Gemini API error (500). Please try again later.');
        }

        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[Gemini] API error 500:',
          sensitiveErrorBody
        );

        consoleErrorSpy.mockRestore();
      });
    });
  });
});
