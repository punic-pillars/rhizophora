// ============================================================
// context.ts — Shared AnalysisContext for all Vein-powered tools
//
// v1.0.0: Consolidates all cross-cutting parameters into a single
//   interface. Eliminates the "boilerplate corridor" where every
//   layer (handler, service, engine) independently declared the
//   same parameters. Now adding a new cross-cutting parameter is
//   a 1-file change instead of a 9-12 file change.
//
//   Each tool handler constructs an AnalysisContext and passes it
//   through the pipeline. Tools ignore fields they don't need.
// ============================================================

/**
 * Single context object for all Vein-powered tool analysis.
 * Carries the file to analyze plus all cross-cutting parameters
 * (performance guards, design tokens, mode, etc.).
 *
 * Tools that don't use certain fields simply ignore them.
 * This avoids per-tool parameter declarations that must be
 * kept in sync across 4+ layers.
 */
export interface AnalysisContext {
  /** Absolute path to the .tsx/.jsx file to analyze */
  filePath: string;

  // ─── Performance Guards ────────────────────────────────────
  /** Maximum number of files to parse before truncating. Default: 20. */
  maxFiles?: number;
  /** Maximum file size in KB. Files larger than this are skipped. Default: 500 KB. */
  maxFileSizeKB?: number;
  /** Timeout in milliseconds. Analysis stops after this duration. Default: 10000. */
  timeoutMs?: number;
  /** Maximum depth to recurse (prevents infinite loops). Default: 10. */
  maxDepth?: number;

  // ─── Layout Audit Parameters ───────────────────────────────
  /** Valid design token values (e.g., [4, 8, 12, 16, 24, 32]) */
  designTokens?: number[];
  /** Analysis mode for boundary gap detection */
  mode?: 'all' | 'vein-propagation';
  /** Explicit path to the styles file (for cross-file style resolution) */
  stylesPath?: string;
  /** If true, recursively scan all .tsx/.ts files in the directory */
  recursive?: boolean;

  // ─── Import Tracing ────────────────────────────────────────
  /** Component name to trace (for trace_component_import) */
  componentName?: string;
}
