// ============================================================
// bridgeCrossings.ts — detect_bridge_crossings tool handler
// UI Thread Guardian: flags useState/useEffect inside
// onScroll/onLayout/worklet handlers
// ============================================================

import { BridgeCrossingDetector } from '../engine/BridgeCrossingDetector.js';
import { validateFilePath } from '../utils/validateFilePath.js';
import type { ToolResponse } from './shared.js';
import { success, error } from './shared.js';

const detector = new BridgeCrossingDetector();

export function handleDetectBridgeCrossings(args: { filePath: string }): ToolResponse {
  try {
    validateFilePath(args.filePath);
    const report = detector.detect(args.filePath);

    const lines: string[] = [];
    lines.push(`[BRIDGE-CROSSINGS] ${args.filePath}`);

    if (report.crossings.length === 0) {
      lines.push('[CLEAN] No bridge crossings detected. All handlers are UI-thread safe.');
      return success(lines.join('\n'));
    }

    for (const c of report.crossings) {
      const severity = c.severity.toUpperCase();
      lines.push(`[${severity}] ${c.handler} → ${c.culprit} (line ${c.lineNumber})`);
      lines.push(`  Context: ${c.lineContext}`);
      lines.push(`  Suggestion: ${c.suggestion}`);
    }

    lines.push(`[SUMMARY] ${report.summary}`);
    return success(lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`[ERROR] ${args.filePath}: ${message}`);
  }
}
