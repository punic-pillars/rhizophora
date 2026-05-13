// ============================================================
// renderTraps.ts — detect_render_traps tool handler
// React.memo Enforcer: flags inline functions/objects/arrays
// passed as props to memoized components
// ============================================================

import { RenderTrapDetector } from '../engine/RenderTrapDetector.js';
import { validateFilePath } from '../utils/validateFilePath.js';
import type { ToolResponse } from './shared.js';
import { success, error } from './shared.js';
import type { RenderTrap } from '../domain/types/index.js';

const detector = new RenderTrapDetector();

export function handleDetectRenderTraps(args: { filePath: string }): ToolResponse {
  try {
    validateFilePath(args.filePath);
    const report = detector.detect(args.filePath);

    const lines: string[] = [];
    lines.push(`[RENDER-TRAPS] ${args.filePath}`);

    if (report.traps.length === 0) {
      const reason = report.summary.includes('No React.memo()')
        ? 'No React.memo() components found'
        : 'All props to memoized components are stable references';
      lines.push(`[CLEAN] ${reason}.`);
      return success(lines.join('\n'));
    }

    for (const t of report.traps) {
      const severity = t.severity.toUpperCase();
      const propType = severity === 'HIGH' ? 'inline function' : 'inline object/array';
      lines.push(`[${severity}] <${t.component}> (parent: ${t.parentComponent}) — prop "${t.propName}" = ${propType} (line ${t.lineNumber})`);
      lines.push(`  Context: ${t.lineContext}`);
      lines.push(`  Suggestion: ${t.suggestion}`);
    }

    lines.push(`[SUMMARY] ${report.summary}`);
    return success(lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`[ERROR] ${args.filePath}: ${message}`);
  }
}
