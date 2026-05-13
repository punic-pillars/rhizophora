// ============================================================
// ImportResolver.ts — Resolves relative import paths to
// absolute file paths with extension guessing.
// Extracted from ASTParser.ts to keep parsing separate from
// filesystem resolution logic.
//
// v1.0.0 "Refactored Vein" — Extracted from ASTParser.ts
// ============================================================

import * as fs from 'fs';
import * as path from 'path';

/**
 * Resolve a relative import path to an absolute file path.
 * Tries common extensions (.ts, .tsx, .js, .jsx) and index files.
 */
export function resolveImportPath(currentFilePath: string, importPath: string): string | null {
  if (!importPath.startsWith('.')) return null;

  const dir = path.dirname(currentFilePath);
  const resolved = path.resolve(dir, importPath);
  const extensions = ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js', '/index.jsx'];

  for (const ext of extensions) {
    const fullPath = resolved + ext;
    if (fs.existsSync(fullPath)) return fullPath;
  }

  if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
    for (const ext of ['.ts', '.tsx', '.js', '.jsx']) {
      const indexPath = path.join(resolved, `index${ext}`);
      if (fs.existsSync(indexPath)) return indexPath;
    }
  }

  return null;
}
