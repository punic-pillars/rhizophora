// ============================================================
// GraphSerializer.ts — Serialize SemanticLayoutGraph + InferenceResult
// to a JSON-compatible SerializedGraph for persistent storage
// and cross-commit comparison.
//
// v1.0.0 — Initial release. Part of the Regression Detection
//   feature (Potential 2 from brain-storming.md).
// ============================================================

import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import type { SemanticLayoutGraph } from '../vein/SemanticLayoutGraph.js';
import type { InferenceResult, LayoutNode, TruncationInfo } from '../vein/types.js';
import type {
  SerializedGraph,
  SerializedNode,
  SerializedEdge,
  SerializedDetails,
  SerializedComplexityProfile,
  SerializedViolationCounts,
  SerializedSpacing,
  SerializedLayout,
  SerializedTokenDeviation,
  SerializedMetadata,
} from '../../domain/types/serialized-graph.js';

// ─── Package Version ──────────────────────────────────────────

// Inline version constant to avoid circular dependency on package.json
const RHIZOPHORA_VERSION = '0.1.0';
const ANALYSIS_VERSION = '1.0.0';

// ─── Serializer ───────────────────────────────────────────────

export class GraphSerializer {
  /**
   * Serialize a SemanticLayoutGraph and its InferenceResult into
   * a JSON-compatible SerializedGraph.
   *
   * @param filePath - Absolute path to the analyzed file
   * @param graph - The Semantic Layout Graph
   * @param inference - The inference results
   * @param truncation - Optional truncation info
   * @returns A serialized graph ready for JSON.stringify
   */
  serialize(
    filePath: string,
    graph: SemanticLayoutGraph,
    inference: InferenceResult,
    truncation?: TruncationInfo
  ): SerializedGraph {
    const absolutePath = path.resolve(filePath);

    return {
      metadata: this.buildMetadata(absolutePath, truncation),
      nodes: this.serializeNodes(graph),
      edges: this.serializeEdges(graph),
      details: this.buildDetails(graph, inference),
    };
  }

  /**
   * Build metadata for the snapshot.
   */
  private buildMetadata(
    filePath: string,
    truncation?: TruncationInfo
  ): SerializedMetadata {
    return {
      filePath,
      timestamp: new Date().toISOString(),
      commitHash: this.getCommitHash(),
      rhizophoraVersion: RHIZOPHORA_VERSION,
      analysisVersion: ANALYSIS_VERSION,
      truncated: truncation?.truncated ?? false,
      truncationInfo: truncation?.truncated ? truncation : undefined,
    };
  }

  /**
   * Get the current git commit hash.
   * Falls back to "unknown" if git is not available or not a git repo.
   */
  private getCommitHash(): string {
    try {
      return execSync('git rev-parse HEAD', {
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 3000,
      }).trim();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Serialize all nodes into a flat map (keyed by node ID).
   * Children arrays are emptied to avoid circular references;
   * parent-child relationships are in the edges array.
   */
  private serializeNodes(graph: SemanticLayoutGraph): Record<string, SerializedNode> {
    const nodes: Record<string, SerializedNode> = {};
    const allNodes = graph.getAllNodes();

    for (const node of allNodes) {
      nodes[node.id] = this.serializeNode(node);
    }

    return nodes;
  }

  /**
   * Serialize a single LayoutNode to a SerializedNode.
   */
  private serializeNode(node: LayoutNode): SerializedNode {
    return {
      id: node.id,
      componentName: node.componentName,
      tagName: node.tagName,
      filePath: node.filePath,
      lineNumber: node.lineNumber,
      spacing: this.serializeSpacing(node.spacing),
      layout: this.serializeLayout(node.layout),
      isPrimitive: node.isPrimitive,
      isCustomComponent: node.isCustomComponent,
      parentId: node.parentId,
      hasOnLayout: node.hasOnLayout,
      isListItem: node.isListItem,
      pollutionScore: node.pollutionScore,
      tokenDeviations: this.serializeTokenDeviations(node.tokenDeviations),
      isSlot: node.isSlot,
      contextCalls: [...node.contextCalls],
    };
  }

  /**
   * Serialize spacing tokens.
   */
  private serializeSpacing(spacing: LayoutNode['spacing']): SerializedSpacing {
    const result: SerializedSpacing = {};
    for (const [key, value] of Object.entries(spacing)) {
      if (value !== undefined) {
        (result as Record<string, unknown>)[key] = value;
      }
    }
    return result;
  }

  /**
   * Serialize layout properties.
   */
  private serializeLayout(layout: LayoutNode['layout']): SerializedLayout {
    const result: SerializedLayout = {};
    for (const [key, value] of Object.entries(layout)) {
      if (value !== undefined) {
        (result as Record<string, unknown>)[key] = value;
      }
    }
    return result;
  }

  /**
   * Serialize token deviations.
   */
  private serializeTokenDeviations(deviations: LayoutNode['tokenDeviations']): SerializedTokenDeviation[] {
    return deviations.map((d) => ({
      property: d.property,
      value: d.value,
      suggestion: d.suggestion,
    }));
  }

  /**
   * Build the explicit edge list from parent-child relationships.
   */
  private serializeEdges(graph: SemanticLayoutGraph): SerializedEdge[] {
    const edges: SerializedEdge[] = [];
    const allNodes = graph.getAllNodes();

    for (const node of allNodes) {
      for (const child of node.children) {
        edges.push({
          parentId: node.id,
          childId: child.id,
        });
      }
    }

    return edges;
  }

  /**
   * Build the aggregated details from the graph and inference result.
   */
  private buildDetails(
    graph: SemanticLayoutGraph,
    inference: InferenceResult
  ): SerializedDetails {
    const allNodes = graph.getAllNodes();
    const containers = graph.getContainerNodes();
    const leaves = graph.getLeafNodes();
    const root = graph.getRoot();
    const maxDepth = root
      ? Math.max(...allNodes.map((n) => graph.getDepth(n.id)))
      : 0;

    const customComponents = allNodes.filter((n) => n.isCustomComponent);
    const uniqueCustomNames = new Set(customComponents.map((n) => n.componentName));

    const complexityProfile: SerializedComplexityProfile = {
      grade: this.computeGrade(inference.healthScore),
      totalComponents: allNodes.length,
      maxDepth,
      containers: containers.length,
      leaves: leaves.length,
      containerLeafRatio:
        containers.length > 0
          ? Math.round((leaves.length / containers.length) * 10) / 10
          : 0,
      uniqueCustomComponents: uniqueCustomNames.size,
      slots: allNodes.filter((n) => n.isSlot).length,
      listItems: allNodes.filter((n) => n.isListItem).length,
      absolutePositioned: allNodes.filter((n) => n.layout.position === 'absolute').length,
      onLayoutHandlers: allNodes.filter((n) => n.hasOnLayout).length,
    };

    const violations: SerializedViolationCounts = {
      contextualGapViolations: inference.contextualGapViolations.length,
      boundaryViolations: inference.boundaryViolations.length,
      terminalPaddingViolations: inference.terminalPaddingViolations.length,
      groupingSuggestions: inference.groupingSuggestions.length,
      tokenDeviations: inference.tokenDeviations.length,
      gapOpportunities: inference.gapOpportunities.length,
      stylePollution: inference.stylePollution.length,
      marginStacking: inference.marginStacking.length,
      listItemIssues: inference.listItemIssues.length,
      rhythmViolations: inference.rhythmViolations.length,
      proximityIssues: inference.proximityIssues.length,
    };

    return {
      complexityProfile,
      healthScore: inference.healthScore,
      violations,
    };
  }

  /**
   * Compute the complexity grade from a health score.
   */
  private computeGrade(score: number): SerializedComplexityProfile['grade'] {
    if (score >= 90) return 'SIMPLE';
    if (score >= 70) return 'MODERATE';
    if (score >= 50) return 'COMPLEX';
    return 'OVERCOMPLICATED';
  }
}

// ─── File I/O Helpers ─────────────────────────────────────────

/**
 * Default directory for storing layout graph snapshots.
 * Created at the project root.
 */
export const DEFAULT_SNAPSHOT_DIR = '.rhizome';

/**
 * Derive a snapshot filename from a file path.
 * E.g., "src/screens/DashboardScreen.tsx" → "dashboard-screen.json"
 */
export function deriveSnapshotName(filePath: string): string {
  const basename = path.basename(filePath, path.extname(filePath));
  // Convert PascalCase/camelCase to kebab-case
  const kebab = basename
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');
  return `${kebab}.json`;
}

/**
 * Resolve the full path for a snapshot file.
 * If snapshotName is provided, uses it; otherwise derives from filePath.
 */
export function resolveSnapshotPath(
  filePath: string,
  snapshotName?: string
): string {
  const cwd = process.cwd();
  const dir = path.join(cwd, DEFAULT_SNAPSHOT_DIR);
  const name = snapshotName ?? deriveSnapshotName(filePath);
  return path.join(dir, name);
}

/**
 * Ensure the .rhizome directory exists.
 */
export function ensureSnapshotDir(): void {
  const dir = path.join(process.cwd(), DEFAULT_SNAPSHOT_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Write a serialized graph to a JSON file.
 */
export function writeSnapshot(snapshot: SerializedGraph, outputPath: string): void {
  ensureSnapshotDir();
  fs.writeFileSync(outputPath, JSON.stringify(snapshot, null, 2), 'utf-8');
}

/**
 * Read a serialized graph from a JSON file.
 */
export function readSnapshot(filePath: string): SerializedGraph {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as SerializedGraph;
}
