// ============================================================
// componentImport.ts — trace_component_import tool handler
// [Vein-Powered] Follow import chain from usage to source
// definition, resolving through barrel files and re-exports.
// ============================================================

import { getImportChain } from '../engine/services/VeinToolService.js';
import { validateFilePath } from '../utils/validateFilePath.js';
import type { ToolResponse } from './shared.js';
import { success, error } from './shared.js';

export function handleTraceComponentImport(args: { filePath: string; componentName?: string }): ToolResponse {
  try {
    validateFilePath(args.filePath);
    const result = getImportChain(args.filePath, args.componentName);
    return success(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`[ERROR] ${args.filePath}: ${message}`);
  }
}
