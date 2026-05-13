// ============================================================
// designTokens.ts — audit_design_tokens tool handler
// [Vein-Powered] Scans files for spacing values not in the
// design token whitelist. Reports magic numbers.
// ============================================================

import { getTokenDeviations } from '../engine/services/VeinToolService.js';
import { validateFilePath } from '../utils/validateFilePath.js';
import type { ToolResponse } from './shared.js';
import { success, error } from './shared.js';

export function handleAuditDesignTokens(args: { filePath: string; designTokens?: number[] }): ToolResponse {
  try {
    validateFilePath(args.filePath);
    const result = getTokenDeviations(args.filePath, args.designTokens);
    return success(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`[ERROR] ${args.filePath}: ${message}`);
  }
}
