// ============================================================
// renderDiagram.ts — render_structural_diagram tool handler
// Read source code and render ASCII structural diagram
// ============================================================

import { parseFile } from '../parser/StructuralParser.js';
import { validateFilePath } from '../utils/validateFilePath.js';
import type { ToolResponse } from './shared.js';
import { success, error } from './shared.js';

export function handleRenderStructuralDiagram(args: { filePath: string }): ToolResponse {
  try {
    validateFilePath(args.filePath);
    const result = parseFile(args.filePath);

    const lines: string[] = [];
    lines.push(result.diagram);

    if (result.animatedValues.length > 0) {
      lines.push('');
      lines.push('[ANIMATED-VALUES]');
      for (const av of result.animatedValues) {
        lines.push(`  ${av.name} [${av.type}] — ${av.description}`);
      }
    }

    lines.push('');
    lines.push('[SUMMARY]');
    for (const s of result.summary) {
      lines.push(`  ${s}`);
    }

    return success(lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`[ERROR] ${args.filePath}: ${message}`);
  }
}
