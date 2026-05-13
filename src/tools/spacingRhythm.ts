// ============================================================
// spacingRhythm.ts — audit_spacing_rhythm tool handler
// [Rhythm Hierarch] Enforces inner_gap < outer_gap to prevent
// "flat" UIs where all spacing is uniform.
// ============================================================

import { getRhythmAudit } from '../engine/services/VeinToolService.js';
import { validateFilePath } from '../utils/validateFilePath.js';
import type { ToolResponse } from './shared.js';
import { success, error } from './shared.js';

export function handleAuditSpacingRhythm(args: { filePath: string }): ToolResponse {
  try {
    validateFilePath(args.filePath);
    const result = getRhythmAudit(args.filePath);
    return success(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`[ERROR] ${args.filePath}: ${message}`);
  }
}
