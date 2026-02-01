import {
  ICodeExecutionBackend,
  BackendCapabilities,
  BackendStatus,
  ExecuteOptions,
  TraceOptions,
  CodeSubmission,
  ExecutionResult,
  ExecutionTrace,
} from '../interfaces';

export class DisabledBackend implements ICodeExecutionBackend {
  readonly backendType = 'disabled';

  readonly capabilities: BackendCapabilities = {
    execute: false,
    trace: false,
    attachedFiles: false,
    stdin: false,
    randomSeed: false,
    stateful: false,
    requiresWarmup: false,
  };

  async execute(submission: CodeSubmission, _options?: ExecuteOptions): Promise<ExecutionResult> {
    return {
      success: false,
      output: '',
      error: 'Code execution is not available in this environment.',
      executionTime: 0,
      stdin: submission.executionSettings?.stdin,
    };
  }

  async trace(_code: string, _options?: TraceOptions): Promise<ExecutionTrace> {
    return {
      steps: [],
      totalSteps: 0,
      exitCode: 1,
      error: 'Code tracing is not available in this environment.',
      truncated: false,
    };
  }

  async getStatus(): Promise<BackendStatus> {
    return {
      available: true, // Always available as fallback
      healthy: true,
      message: 'Code execution disabled',
    };
  }
}
