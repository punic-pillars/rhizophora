// ============================================================
// absoluteOverlaps.ts — detect_absolute_overlaps tool handler
// [Vein-Powered] Reports absolutely-positioned elements with
// zIndex analysis and dimension checks.
// ============================================================

import { getAbsoluteOverlaps } from '../engine/services/VeinToolService.js';
import { validateFilePath } from '../utils/validateFilePath.js';
import type { ToolResponse } from './shared.js';
import { success, error } from './shared.js';

export function handleDetectAbsoluteOverlaps(args: { filePath: string }): ToolResponse {
  try {
    validateFilePath(args.filePath);
    const result = getAbsoluteOverlaps(args.filePath);
    return success(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`[ERROR] ${args.filePath}: ${message}`);
  }
}
