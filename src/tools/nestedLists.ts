// ============================================================
// nestedLists.ts — detect_nested_lists tool handler
// [Vein-Powered] Finds .map() inside .map() — a React Native
// scroll nesting anti-pattern that causes performance issues.
// ============================================================

import { getNestedLists } from '../engine/services/VeinToolService.js';
import { validateFilePath } from '../utils/validateFilePath.js';
import type { ToolResponse } from './shared.js';
import { success, error } from './shared.js';

export function handleDetectNestedLists(args: { filePath: string }): ToolResponse {
  try {
    validateFilePath(args.filePath);
    const result = getNestedLists(args.filePath);
    return success(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`[ERROR] ${args.filePath}: ${message}`);
  }
}
