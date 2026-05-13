// ============================================================
// screenComplexity.ts — profile_screen_complexity tool handler
// [Vein-Powered] Screen complexity profile: component count,
// nesting depth, container/leaf ratio, health score.
// ============================================================

import { getScreenProfile } from '../engine/services/VeinToolService.js';
import { validateFilePath } from '../utils/validateFilePath.js';
import type { ToolResponse } from './shared.js';
import { success, error } from './shared.js';

export function handleProfileScreenComplexity(args: { filePath: string }): ToolResponse {
  try {
    validateFilePath(args.filePath);
    const result = getScreenProfile(args.filePath);
    return success(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`[ERROR] ${args.filePath}: ${message}`);
  }
}
