/**
 * POST /api/sessions/[id]/analyze
 * Analyze all student code submissions using AI and generate a walkthrough script
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUserWithToken, checkPermission } from '@/server/auth/api-auth';
import { createStorage } from '@/server/persistence';
import { getGeminiService } from '@/server/services/gemini-analysis-service';
import { AnalysisInput } from '@/server/types/analysis';
import { rateLimit, checkAnalyzeDailyLimits } from '@/server/rate-limit';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Authenticate user
    const { user, accessToken } = await getAuthenticatedUserWithToken(request);

    // Rate limit by user ID (per-minute limit)
    const limited = await rateLimit('analyze', request, user.id);
    if (limited) return limited;

    // Check daily limits (per-user and global) before calling Gemini
    const dailyLimited = await checkAnalyzeDailyLimits(request, user.id);
    if (dailyLimited) return dailyLimited;

    // Check permission to view all student data
    if (!checkPermission(user, 'data.viewAll')) {
      return NextResponse.json(
        { error: 'You do not have permission to analyze student code' },
        { status: 403 }
      );
    }

    // Get session ID from params
    const { id: sessionId } = await params;

    // Get Gemini service and check configuration
    const geminiService = getGeminiService();
    if (!geminiService.isConfigured()) {
      return NextResponse.json(
        { error: 'AI analysis not configured. Contact administrator to set up GEMINI_API_KEY.' },
        { status: 503 }
      );
    }

    // Get session with all student code
    const storage = await createStorage(accessToken);
    const session = await storage.sessions.getSession(sessionId);

    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Extract student submissions
    const submissions: Array<{ studentId: string; code: string }> = [];
    for (const [studentId, student] of session.students) {
      submissions.push({
        studentId,
        code: student.code,
      });
    }

    // Build analysis input
    const analysisInput: AnalysisInput = {
      sessionId,
      problemTitle: session.problem.title || 'Untitled Problem',
      problemDescription: session.problem.description || '',
      starterCode: session.problem.starterCode || '',
      submissions,
    };

    // Run analysis
    const script = await geminiService.analyzeSubmissions(analysisInput);

    return NextResponse.json({
      success: true,
      script,
    });
  } catch (error: unknown) {
    // Handle authentication errors
    if (error instanceof Error && error.message === 'Not authenticated') {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }

    // Handle known error types
    if (error instanceof Error) {
      // Rate limiting
      if (error.message.includes('Rate limit')) {
        return NextResponse.json(
          { error: error.message },
          { status: 429 }
        );
      }

      // Model overloaded
      if (error.message.includes('overloaded')) {
        return NextResponse.json(
          { error: error.message },
          { status: 503 }
        );
      }

      // Timeout
      if (error.message.includes('timed out')) {
        return NextResponse.json(
          { error: error.message },
          { status: 504 }
        );
      }

      // API key issues
      if (error.message.includes('API key')) {
        return NextResponse.json(
          { error: error.message },
          { status: 503 }
        );
      }
    }

    // Log and return generic error
    console.error('[API] Analyze code error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze code', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
