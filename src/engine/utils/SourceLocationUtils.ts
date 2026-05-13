// ============================================================
// SourceLocationUtils.ts — Shared utilities for source location
// resolution, context extraction, and parent component inference.
//
// Extracted from BridgeCrossingDetector.ts and RenderTrapDetector.ts
// to eliminate code duplication across all detectors.
// ============================================================

/**
 * Get the 1-based line number for a character index in source text.
 */
export function getLineNumber(source: string, index: number): number {
  return source.substring(0, index).split('\n').length;
}

/**
 * Extract a context window around a position in source text.
 * Truncates with "..." if the window extends beyond the source bounds.
 */
export function extractContext(body: string, index: number, width: number): string {
  const start = Math.max(0, index - width);
  const end = Math.min(body.length, index + width);
  let context = body.substring(start, end).replace(/\n/g, '\\n').trim();
  if (start > 0) context = '...' + context;
  if (end < body.length) context = context + '...';
  return context;
}

/**
 * Find the parent component name by scanning backwards from a JSX usage.
 * Looks for the nearest enclosing JSX element or function/const declaration.
 */
export function findParentComponent(source: string, usageIndex: number): string | null {
  // Scan backwards to find the nearest enclosing JSX element
  const beforeUsage = source.substring(0, usageIndex);

  // Try to find the nearest return statement with a JSX element
  const returnRegex = /return\s*\(?\s*<([A-Z][a-zA-Z0-9]*)/g;
  let lastReturnMatch: RegExpExecArray | null = null;
  let match: RegExpExecArray | null;
  while ((match = returnRegex.exec(beforeUsage)) !== null) {
    lastReturnMatch = match;
  }

  if (lastReturnMatch) {
    return lastReturnMatch[1];
  }

  // Fallback: find the nearest function/const component declaration
  const funcRegex = /(?:function\s+(\w+)|const\s+(\w+)\s*[=:]\s*(?:\([^)]*\)|\([^)]*\)\s*:\s*\w+)\s*=>)/g;
  let lastFuncMatch: RegExpExecArray | null = null;
  while ((match = funcRegex.exec(beforeUsage)) !== null) {
    lastFuncMatch = match;
  }

  if (lastFuncMatch) {
    return lastFuncMatch[1] || lastFuncMatch[2] || null;
  }

  return null;
}
