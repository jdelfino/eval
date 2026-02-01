#!/usr/bin/env python3
"""
Python execution tracer for debugging support.
Captures execution steps, variable states, and call stack.
"""

import sys
import json
import traceback
import io
from contextlib import redirect_stdout

# Configuration
MAX_STEPS = 5000
MAX_VAR_LENGTH = 1000

class ExecutionTracer:
    def __init__(self, max_steps=MAX_STEPS):
        self.steps = []
        self.step_count = 0
        self.max_steps = max_steps
        self.truncated = False
        self.stdout_buffer = io.StringIO()
        self.call_stack = []
        
    def format_value(self, value):
        """Format a value for JSON serialization with truncation."""
        try:
            if value is None:
                return None
            elif isinstance(value, (bool, int, float)):
                return value
            elif isinstance(value, str):
                if len(value) > MAX_VAR_LENGTH:
                    return value[:MAX_VAR_LENGTH] + '...'
                return value
            elif isinstance(value, (list, tuple)):
                if len(value) > 10:
                    formatted = [self.format_value(v) for v in value[:10]]
                    return formatted + ['...']
                return [self.format_value(v) for v in value]
            elif isinstance(value, dict):
                if len(value) > 10:
                    items = list(value.items())[:10]
                    result = {str(k): self.format_value(v) for k, v in items}
                    result['...'] = '...'
                    return result
                return {str(k): self.format_value(v) for k, v in value.items()}
            elif callable(value):
                return f'<function {getattr(value, "__name__", "?")}>'
            else:
                s = str(value)
                if len(s) > MAX_VAR_LENGTH:
                    s = s[:MAX_VAR_LENGTH] + '...'
                return f'<{type(value).__name__}: {s}>'
        except:
            return '<unserializable>'
    
    def get_variables(self, frame):
        """Extract and format local and global variables."""
        # Get locals (filter out internal variables)
        locals_dict = {}
        for name, value in frame.f_locals.items():
            if not name.startswith('__'):
                locals_dict[name] = self.format_value(value)
        
        # Get globals (only user-defined functions and variables)
        globals_dict = {}
        for name, value in frame.f_globals.items():
            if not name.startswith('__') and name not in ['sys', 'json', 'io', 'traceback', 'ExecutionTracer']:
                globals_dict[name] = self.format_value(value)
        
        return locals_dict, globals_dict
    
    def get_call_stack(self, frame):
        """Build call stack from current frame."""
        stack = []
        current = frame
        while current is not None:
            func_name = current.f_code.co_name
            filename = current.f_code.co_filename
            line = current.f_lineno
            
            # Only include user code (not tracer internals)
            if filename == '<string>':
                stack.append({
                    'functionName': func_name,
                    'filename': filename,
                    'line': line
                })
            
            current = current.f_back
        
        return list(reversed(stack))
    
    def trace_function(self, frame, event, arg):
        """Trace function called on each line execution."""
        # Check step limit
        if self.step_count >= self.max_steps:
            self.truncated = True
            return None  # Stop tracing
        
        # Only trace user code (not libraries or tracer itself)
        filename = frame.f_code.co_filename
        if filename != '<string>':
            return self.trace_function
        
        # Capture step
        locals_dict, globals_dict = self.get_variables(frame)
        call_stack = self.get_call_stack(frame)
        
        step = {
            'line': frame.f_lineno,
            'event': event,
            'locals': locals_dict,
            'globals': globals_dict,
            'callStack': call_stack,
            'stdout': self.stdout_buffer.getvalue()
        }
        
        self.steps.append(step)
        self.step_count += 1
        
        return self.trace_function
    
    def execute(self, code, stdin_data=''):
        """Execute code with tracing enabled."""
        # Set up stdin
        if stdin_data:
            sys.stdin = io.StringIO(stdin_data)
        
        # Redirect stdout
        original_stdout = sys.stdout
        sys.stdout = self.stdout_buffer
        
        exit_code = 0
        error = None
        
        try:
            # Set up tracing
            sys.settrace(self.trace_function)
            
            # Execute code
            exec(code, {'__name__': '__main__'})
            
        except Exception as e:
            exit_code = 1
            error = f"{type(e).__name__}: {str(e)}\n{traceback.format_exc()}"
        finally:
            # Restore
            sys.settrace(None)
            sys.stdout = original_stdout
            if stdin_data:
                sys.stdin = sys.__stdin__
        
        return {
            'steps': self.steps,
            'totalSteps': self.step_count,
            'exitCode': exit_code,
            'error': error,
            'truncated': self.truncated
        }

def main():
    """Main entry point - read code and execute with tracing."""
    if len(sys.argv) < 2:
        print(json.dumps({'error': 'No code provided'}))
        sys.exit(1)
    
    code = sys.argv[1]
    stdin_data = sys.argv[2] if len(sys.argv) > 2 else ''
    max_steps = int(sys.argv[3]) if len(sys.argv) > 3 else MAX_STEPS
    
    tracer = ExecutionTracer(max_steps=max_steps)
    result = tracer.execute(code, stdin_data)
    
    # Output as JSON
    print(json.dumps(result))

if __name__ == '__main__':
    main()
