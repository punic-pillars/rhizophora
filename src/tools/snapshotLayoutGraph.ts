// ============================================================
// snapshotLayoutGraph.ts — snapshot_layout_graph tool handler
// [Serialization] Takes a snapshot of the Semantic Layout Graph
// and writes it to a .rhizome/ JSON file for cross-commit diffing.
// ============================================================

import { getOrAnalyzeForSnapshot } from '../engine/services/VeinToolService.js';
import { GraphSerializer, resolveSnapshotPath, writeSnapshot } from '../engine/serialization/GraphSerializer.js';
import { validateFilePath } from '../utils/validateFilePath.js';
import type { ToolResponse } from './shared.js';
import { success, error } from './shared.js';
import type { AnalysisContext } from '../domain/types/context.js';

export function handleSnapshotLayoutGraph(args: Record<string, unknown>): ToolResponse {
  try {
    validateFilePath(args.filePath as string);

    const ctx: AnalysisContext = { filePath: args.filePath as string };
    if (args.maxFiles !== undefined) ctx.maxFiles = args.maxFiles as number;
    if (args.maxFileSizeKB !== undefined) ctx.maxFileSizeKB = args.maxFileSizeKB as number;
    if (args.timeoutMs !== undefined) ctx.timeoutMs = args.timeoutMs as number;

    const snapshotName = args.snapshotName as string | undefined;

    // Run the analysis pipeline and get the raw graph + inference
    const { graph, inference, truncation } = getOrAnalyzeForSnapshot(ctx);

    // Serialize
    const serializer = new GraphSerializer();
    const serialized = serializer.serialize(ctx.filePath, graph, inference, truncation);

    // Write to .rhizome/
    const outputPath = resolveSnapshotPath(ctx.filePath, snapshotName);
    writeSnapshot(serialized, outputPath);

    const lines: string[] = [];
    lines.push(`[SNAPSHOT] ${ctx.filePath}`);
    lines.push(`  Written to: ${outputPath}`);
    lines.push(`  Commit: ${serialized.metadata.commitHash}`);
    lines.push(`  Timestamp: ${serialized.metadata.timestamp}`);
    lines.push(`  Components: ${serialized.details.complexityProfile.totalComponents}`);
    lines.push(`  Health score: ${serialized.details.healthScore}/100`);
    lines.push(`  Complexity grade: ${serialized.details.complexityProfile.grade}`);
    lines.push(`  Total violations: ${Object.values(serialized.details.violations).reduce((s, v) => s + v, 0)}`);

    if (serialized.metadata.truncated) {
      lines.push(`  [TRUNCATED] Analysis was truncated — snapshot is partial.`);
    }

    return success(lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`[ERROR] ${args.filePath}: ${message}`);
  }
}
