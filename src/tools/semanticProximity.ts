// ============================================================
// semanticProximity.ts — audit_semantic_proximity tool handler
// [Semantic Proximity Auditor] Clusters sibling components by
// semantic name/label to detect when related components aren't
// grouped together.
// ============================================================

import { getProximityAudit } from '../engine/services/VeinToolService.js';
import { validateFilePath } from '../utils/validateFilePath.js';
import type { ToolResponse } from './shared.js';
import { success, error } from './shared.js';

export function handleAuditSemanticProximity(args: { filePath: string }): ToolResponse {
  try {
    validateFilePath(args.filePath);
    const result = getProximityAudit(args.filePath);
    return success(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`[ERROR] ${args.filePath}: ${message}`);
  }
}
