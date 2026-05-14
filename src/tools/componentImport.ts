// ============================================================
// componentImport.ts — trace_component_import tool handler
// [Vein-Powered] Follow import chain from usage to source
// definition, resolving through barrel files and re-exports.
// ============================================================

import { getImportChain } from '../engine/services/VeinToolService.js';
import { validateFilePath } from '../utils/validateFilePath.js';
import type { ToolResponse } from './shared.js';
import { success, error } from './shared.js';
import type { AnalysisContext } from '../domain/types/context.js';

export function handleTraceComponentImport(args: Record<string, unknown>): ToolResponse {
  try {
    validateFilePath(args.filePath as string);
    const ctx: AnalysisContext = { filePath: args.filePath as string };
    if (args.componentName !== undefined) ctx.componentName = args.componentName as string;
    const result = getImportChain(ctx);
    return success(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`[ERROR] ${args.filePath}: ${message}`);
  }
}
