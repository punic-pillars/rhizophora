// ============================================================
// absoluteOverlaps.ts — detect_absolute_overlaps tool handler
// [Vein-Powered] Reports absolutely-positioned elements with
// zIndex analysis and dimension checks.
// ============================================================

import { getAbsoluteOverlaps } from '../engine/services/VeinToolService.js';
import { validateFilePath } from '../utils/validateFilePath.js';
import type { ToolResponse } from './shared.js';
import { success, error } from './shared.js';
import type { AnalysisContext } from '../domain/types/context.js';

export function handleDetectAbsoluteOverlaps(args: Record<string, unknown>): ToolResponse {
  try {
    validateFilePath(args.filePath as string);
    const ctx: AnalysisContext = { filePath: args.filePath as string };
    if (args.maxFiles !== undefined) ctx.maxFiles = args.maxFiles as number;
    if (args.maxFileSizeKB !== undefined) ctx.maxFileSizeKB = args.maxFileSizeKB as number;
    if (args.timeoutMs !== undefined) ctx.timeoutMs = args.timeoutMs as number;
    const result = getAbsoluteOverlaps(ctx);
    return success(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`[ERROR] ${args.filePath}: ${message}`);
  }
}
