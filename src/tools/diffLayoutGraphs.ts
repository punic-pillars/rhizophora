// ============================================================
// diffLayoutGraphs.ts — diff_layout_graphs tool handler
// [Serialization] Compare two layout graph snapshots and produce
// a structured diff report showing structural, spacing, violation,
// health score, and complexity changes.
// ============================================================

import { GraphComparator, formatDiff, readSnapshot } from '../engine/serialization/index.js';
import type { ToolResponse } from './shared.js';
import { success, error } from './shared.js';

export function handleDiffLayoutGraphs(args: Record<string, unknown>): ToolResponse {
  try {
    const beforePath = args.before as string;
    const afterPath = args.after as string;

    if (!beforePath || !afterPath) {
      return error(`[ERROR] Both 'before' and 'after' snapshot paths are required.`);
    }

    // Read both snapshots from disk
    const before = readSnapshot(beforePath);
    const after = readSnapshot(afterPath);

    // Compare
    const comparator = new GraphComparator();
    const diff = comparator.compare(before, after);

    // Format as ASCII report
    const report = formatDiff(diff);

    return success(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`[ERROR] ${message}`);
  }
}
