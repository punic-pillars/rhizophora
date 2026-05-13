// ============================================================
// validateFilePath.ts — Shared file path validation utility
// Ensures all tools consistently validate file existence and
// supported extensions before attempting AST parsing.
// ============================================================

import * as fs from 'fs';
import * as path from 'path';

const VALID_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

/**
 * Validates that the given file path exists and has a supported extension.
 * Throws descriptive errors for invalid paths or unsupported file types.
 *
 * Supported extensions: .ts, .tsx, .js, .jsx
 */
export function validateFilePath(filePath: string): void {
  if (!filePath || filePath.trim() === '') {
    throw new Error('filePath is required and must be a non-empty string.');
  }

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: "${filePath}". Please provide a valid file path.`);
  }

  const ext = path.extname(filePath).toLowerCase();
  if (!VALID_EXTENSIONS.includes(ext)) {
    throw new Error(
      `Unsupported file type "${ext}". This tool only supports ${VALID_EXTENSIONS.join(', ')} files.`
    );
  }
}
