// ============================================================
// spacingRhythm.ts — audit_spacing_rhythm tool handler
// [Rhythm Hierarch] Enforces inner_gap < outer_gap to prevent
// "flat" UIs where all spacing is uniform.
// ============================================================

import { getRhythmAudit } from '../engine/services/VeinToolService.js';
import { validateFilePath } from '../utils/validateFilePath.js';
import type { ToolResponse } from './shared.js';
import { success, error } from './shared.js';
import type { AnalysisContext } from '../domain/types/context.js';

export function handleAuditSpacingRhythm(args: Record<string, unknown>): ToolResponse {
  try {
    validateFilePath(args.filePath as string);
    const ctx: AnalysisContext = { filePath: args.filePath as string };
    if (args.maxFiles !== undefined) ctx.maxFiles = args.maxFiles as number;
    if (args.maxFileSizeKB !== undefined) ctx.maxFileSizeKB = args.maxFileSizeKB as number;
    if (args.timeoutMs !== undefined) ctx.timeoutMs = args.timeoutMs as number;
    const result = getRhythmAudit(ctx);
    return success(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`[ERROR] ${args.filePath}: ${message}`);
  }
}
