import {
  sanitizeError,
  sanitizeFilename,
  validateAttachedFiles,
  validateCodeSize,
  validateStdinSize,
  validateMaxSteps,
  truncateOutput,
  DEFAULT_TIMEOUT,
  MAX_FILE_SIZE,
  MAX_FILES,
  CODE_MAX_BYTES,
  STDIN_MAX_BYTES,
  OUTPUT_MAX_BYTES,
  TRACE_MAX_STEPS,
} from '../utils';

describe('code-execution utils', () => {
  describe('constants', () => {
    it('should export DEFAULT_TIMEOUT as 10000ms', () => {
      expect(DEFAULT_TIMEOUT).toBe(10000);
    });

    it('should export MAX_FILE_SIZE as 10KB', () => {
      expect(MAX_FILE_SIZE).toBe(10 * 1024);
    });

    it('should export MAX_FILES as 5', () => {
      expect(MAX_FILES).toBe(5);
    });
  });

  describe('sanitizeError', () => {
    it('should remove file paths from error messages', () => {
      const error = 'File "/tmp/foo.py", line 5, in <module>';
      const result = sanitizeError(error);
      expect(result).toBe('File "<student code>", line 5, in <module>');
    });

    it('should handle multiple file paths in an error', () => {
      const error = 'File "/tmp/foo.py", line 5\nFile "/home/user/bar.py", line 10';
      const result = sanitizeError(error);
      expect(result).toBe('File "<student code>", line 5\nFile "<student code>", line 10');
    });

    it('should replace errno numbers with generic error', () => {
      const error = '[Errno 2] No such file or directory';
      const result = sanitizeError(error);
      expect(result).toBe('[Error] No such file or directory');
    });

    it('should handle both file paths and errno in the same error', () => {
      const error = 'File "/tmp/code.py", line 1\n[Errno 13] Permission denied';
      const result = sanitizeError(error);
      expect(result).toBe('File "<student code>", line 1\n[Error] Permission denied');
    });

    it('should return unchanged string if no sensitive info present', () => {
      const error = 'NameError: name \'x\' is not defined';
      const result = sanitizeError(error);
      expect(result).toBe(error);
    });
  });

  describe('sanitizeFilename', () => {
    it('should return valid filenames unchanged', () => {
      expect(sanitizeFilename('data.txt')).toBe('data.txt');
      expect(sanitizeFilename('my_file.csv')).toBe('my_file.csv');
    });

    it('should replace forward slashes with underscores', () => {
      expect(sanitizeFilename('path/to/file.txt')).toBe('path_to_file.txt');
    });

    it('should replace backslashes with underscores', () => {
      expect(sanitizeFilename('path\\to\\file.txt')).toBe('path_to_file.txt');
    });

    it('should prevent parent directory traversal attacks', () => {
      // ../../../etc/passwd -> .._.._.._etc_passwd (slashes) -> ______etc_passwd (.. replaced)
      expect(sanitizeFilename('../../../etc/passwd')).toBe('______etc_passwd');
      // ..\\..\\windows\\system32 -> .._.._.._windows_system32 -> ______windows_system32
      expect(sanitizeFilename('..\\..\\..\\windows\\system32')).toBe('______windows_system32');
    });

    it('should replace leading dots', () => {
      expect(sanitizeFilename('.hidden')).toBe('_hidden');
      // ..hidden -> _hidden (.. replaced with _)
      expect(sanitizeFilename('..hidden')).toBe('_hidden');
      // ...hidden -> _.hidden (first .. replaced with _, leaving .hidden)
      expect(sanitizeFilename('...hidden')).toBe('_.hidden');
    });

    it('should return default name for empty input', () => {
      expect(sanitizeFilename('')).toBe('unnamed_file.txt');
    });

    it('should return default name for whitespace-only input', () => {
      expect(sanitizeFilename('   ')).toBe('unnamed_file.txt');
    });
  });

  describe('validateAttachedFiles', () => {
    it('should accept valid files within limits', () => {
      const files = [
        { name: 'file1.txt', content: 'hello' },
        { name: 'file2.txt', content: 'world' },
      ];
      expect(() => validateAttachedFiles(files)).not.toThrow();
    });

    it('should accept empty array', () => {
      expect(() => validateAttachedFiles([])).not.toThrow();
    });

    it('should accept exactly MAX_FILES files', () => {
      const files = Array.from({ length: MAX_FILES }, (_, i) => ({
        name: `file${i}.txt`,
        content: 'content',
      }));
      expect(() => validateAttachedFiles(files)).not.toThrow();
    });

    it('should throw error for too many files', () => {
      const files = Array.from({ length: MAX_FILES + 1 }, (_, i) => ({
        name: `file${i}.txt`,
        content: 'content',
      }));
      expect(() => validateAttachedFiles(files)).toThrow(`Too many files attached (max ${MAX_FILES})`);
    });

    it('should throw error for file exceeding size limit', () => {
      const largeContent = 'x'.repeat(MAX_FILE_SIZE + 1);
      const files = [{ name: 'large.txt', content: largeContent }];
      expect(() => validateAttachedFiles(files)).toThrow(
        `File "large.txt" exceeds size limit (${MAX_FILE_SIZE} bytes)`
      );
    });

    it('should accept file at exactly MAX_FILE_SIZE', () => {
      const exactContent = 'x'.repeat(MAX_FILE_SIZE);
      const files = [{ name: 'exact.txt', content: exactContent }];
      expect(() => validateAttachedFiles(files)).not.toThrow();
    });

    it('should throw error for file without name', () => {
      const files = [{ name: '', content: 'content' }];
      expect(() => validateAttachedFiles(files)).toThrow('Invalid file: name and content are required');
    });

    it('should throw error for file without content', () => {
      const files = [{ name: 'file.txt', content: '' }];
      expect(() => validateAttachedFiles(files)).toThrow('Invalid file: name and content are required');
    });

    it('should correctly calculate multi-byte character sizes', () => {
      // Each emoji is typically 4 bytes in UTF-8
      const emojiContent = '\u{1F600}'.repeat(2560); // 2560 * 4 = 10240 bytes = exactly MAX_FILE_SIZE
      const files = [{ name: 'emoji.txt', content: emojiContent }];
      expect(() => validateAttachedFiles(files)).not.toThrow();

      const tooManyEmojis = '\u{1F600}'.repeat(2561); // One more emoji = over limit
      const overFiles = [{ name: 'emoji.txt', content: tooManyEmojis }];
      expect(() => validateAttachedFiles(overFiles)).toThrow(/exceeds size limit/);
    });
  });

  describe('input size limit constants', () => {
    it('should export CODE_MAX_BYTES as 100KB', () => {
      expect(CODE_MAX_BYTES).toBe(100 * 1024);
    });

    it('should export STDIN_MAX_BYTES as 1MB', () => {
      expect(STDIN_MAX_BYTES).toBe(1024 * 1024);
    });

    it('should export OUTPUT_MAX_BYTES as 1MB', () => {
      expect(OUTPUT_MAX_BYTES).toBe(1024 * 1024);
    });

    it('should export TRACE_MAX_STEPS as 50000', () => {
      expect(TRACE_MAX_STEPS).toBe(50_000);
    });
  });

  describe('validateCodeSize', () => {
    it('should accept code under the limit', () => {
      const code = 'print("hello")';
      expect(() => validateCodeSize(code)).not.toThrow();
    });

    it('should accept code at exactly the limit', () => {
      const code = 'x'.repeat(CODE_MAX_BYTES);
      expect(() => validateCodeSize(code)).not.toThrow();
    });

    it('should throw for code over the limit', () => {
      const code = 'x'.repeat(CODE_MAX_BYTES + 1);
      expect(() => validateCodeSize(code)).toThrow(/exceeds maximum size of 100 KB/);
    });

    it('should correctly calculate multi-byte character sizes', () => {
      // Each emoji is 4 bytes in UTF-8
      const emojiCount = Math.floor(CODE_MAX_BYTES / 4);
      const exactEmojis = '\u{1F600}'.repeat(emojiCount);
      expect(() => validateCodeSize(exactEmojis)).not.toThrow();

      const tooManyEmojis = '\u{1F600}'.repeat(emojiCount + 1);
      expect(() => validateCodeSize(tooManyEmojis)).toThrow(/exceeds maximum size/);
    });
  });

  describe('validateStdinSize', () => {
    it('should accept stdin under the limit', () => {
      const stdin = 'test input';
      expect(() => validateStdinSize(stdin)).not.toThrow();
    });

    it('should accept undefined stdin', () => {
      expect(() => validateStdinSize(undefined)).not.toThrow();
    });

    it('should accept empty string stdin', () => {
      expect(() => validateStdinSize('')).not.toThrow();
    });

    it('should accept stdin at exactly the limit', () => {
      const stdin = 'x'.repeat(STDIN_MAX_BYTES);
      expect(() => validateStdinSize(stdin)).not.toThrow();
    });

    it('should throw for stdin over the limit', () => {
      const stdin = 'x'.repeat(STDIN_MAX_BYTES + 1);
      expect(() => validateStdinSize(stdin)).toThrow(/exceeds maximum size of 1024 KB/);
    });
  });

  describe('validateMaxSteps', () => {
    it('should return TRACE_MAX_STEPS for undefined', () => {
      expect(validateMaxSteps(undefined)).toBe(TRACE_MAX_STEPS);
    });

    it('should return input value if under limit', () => {
      expect(validateMaxSteps(1000)).toBe(1000);
      expect(validateMaxSteps(10000)).toBe(10000);
    });

    it('should return input value if at exactly the limit', () => {
      expect(validateMaxSteps(TRACE_MAX_STEPS)).toBe(TRACE_MAX_STEPS);
    });

    it('should cap value if over limit', () => {
      expect(validateMaxSteps(100000)).toBe(TRACE_MAX_STEPS);
      expect(validateMaxSteps(999999)).toBe(TRACE_MAX_STEPS);
    });

    it('should handle zero', () => {
      expect(validateMaxSteps(0)).toBe(0);
    });
  });

  describe('truncateOutput', () => {
    it('should return unchanged output if under limit', () => {
      const output = 'Hello, World!';
      expect(truncateOutput(output)).toBe(output);
    });

    it('should return unchanged output at exactly the limit', () => {
      const output = 'x'.repeat(OUTPUT_MAX_BYTES);
      expect(truncateOutput(output)).toBe(output);
    });

    it('should truncate and add marker if over limit', () => {
      const output = 'x'.repeat(OUTPUT_MAX_BYTES + 10000);
      const result = truncateOutput(output);
      expect(result).toContain('... [output truncated]');
      expect(Buffer.byteLength(result, 'utf-8')).toBeLessThanOrEqual(OUTPUT_MAX_BYTES + 100);
    });

    it('should handle multi-byte characters safely', () => {
      // Create output with multi-byte characters at the truncation boundary
      const unicodeOutput = '\u{1F600}'.repeat(OUTPUT_MAX_BYTES / 4 + 1000);
      const result = truncateOutput(unicodeOutput);
      // Should not throw and should be valid UTF-8
      expect(() => Buffer.from(result, 'utf-8')).not.toThrow();
      expect(result).toContain('... [output truncated]');
    });

    it('should handle empty string', () => {
      expect(truncateOutput('')).toBe('');
    });
  });
});
