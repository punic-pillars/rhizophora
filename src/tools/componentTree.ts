// ============================================================
// componentTree.ts — analyze_component_tree tool handler
// [Vein-Powered] Cross-file component tree with spacing/layout
// annotations using the Vein Propagation Engine.
// ============================================================

import { getComponentTree } from '../engine/services/VeinToolService.js';
import { validateFilePath } from '../utils/validateFilePath.js';
import type { ToolResponse } from './shared.js';
import { success, error } from './shared.js';

export function handleAnalyzeComponentTree(args: { filePath: string }): ToolResponse {
  try {
    validateFilePath(args.filePath);
    const result = getComponentTree(args.filePath);
    return success(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`[ERROR] ${args.filePath}: ${message}`);
  }
}
