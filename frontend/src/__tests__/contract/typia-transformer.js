/**
 * Adapter that wraps typia's TypeScript transformer for ts-jest compatibility.
 *
 * ts-jest expects an AST transformer module to export:
 *   factory(tsCompiler: TsCompiler, options?: unknown): TransformerFactory<SourceFile>
 *
 * Typia 12.x exports:
 *   transform(program, options, extras): TransformerFactory<SourceFile>
 *
 * The challenge: ts-jest calls factory(tsCompiler) at _makeTransformers time,
 * but in transpileModule mode (CommonJS), tsCompiler.program is not yet set.
 * We return a lazy transformer factory that initializes typia's transform when
 * the TypeScript compiler context is available (i.e., when it runs on a file).
 *
 * In language service mode (used when diagnostics are enabled), tsCompiler.program
 * IS set at factory time — so we handle both paths.
 */
'use strict';

const { transform } = require('typia/lib/transform');

const name = 'typia-transformer';
const version = 1;

/**
 * Factory function compatible with ts-jest's AST transformer interface.
 *
 * @param {object} tsCompiler - ts-jest's TsCompiler instance
 * @param {unknown} [options]
 * @returns {import('typescript').TransformerFactory<import('typescript').SourceFile>}
 */
function factory(tsCompiler, options) {
  // Return a transformer factory that lazily creates the typia transformer
  // once we have access to the TypeScript transformation context (which has
  // the program). This handles transpileModule mode where tsCompiler.program
  // may be null at factory creation time.
  return (ctx) => {
    // At this point, the TypeScript compiler passes us the transformation
    // context. We get the program from tsCompiler (set by ts-jest during
    // tsTranspileModule) or from ctx if available.
    const program = tsCompiler.program;

    if (!program) {
      // In strict transpileModule mode there is no program — typia can't
      // generate validators without the type checker. Skip transformation.
      return (sourceFile) => sourceFile;
    }

    const extras = {
      addDiagnostic() {
        // Ignore diagnostics in test context
      },
    };

    // Create the typia transformer factory with the real program
    const typiaTransformerFactory = transform(program, options, extras);
    // Apply it with the context we already have
    return typiaTransformerFactory(ctx);
  };
}

module.exports = { factory, name, version };
