// ============================================================
// GraphComparator.ts — Compare two SerializedGraph snapshots
// and produce a structured GraphDiff report.
//
// v1.0.0 — Initial release. Enables cross-commit regression
//   detection for layout changes.
// ============================================================

import type {
  SerializedGraph,
  SerializedNode,
  GraphDiff,
  StructuralDiff,
  SpacingChange,
  ViolationCountChange,
  HealthScoreChange,
  ComplexityChange,
  NodeSummary,
  SerializedViolationCounts,
} from '../../domain/types/serialized-graph.js';

// ─── Comparator ───────────────────────────────────────────────

export class GraphComparator {
  /**
   * Compare two serialized graph snapshots and produce a diff.
   *
   * @param before - The "before" snapshot (e.g., from main branch)
   * @param after - The "after" snapshot (e.g., from feature branch)
   * @returns A structured diff report
   */
  compare(before: SerializedGraph, after: SerializedGraph): GraphDiff {
    return {
      metadata: {
        filePath: before.metadata.filePath,
        before: {
          commitHash: before.metadata.commitHash,
          timestamp: before.metadata.timestamp,
        },
        after: {
          commitHash: after.metadata.commitHash,
          timestamp: after.metadata.timestamp,
        },
      },
      structural: this.diffStructure(before, after),
      spacingChanges: this.diffSpacing(before, after),
      violationChanges: this.diffViolations(before, after),
      healthScoreChange: this.diffHealthScore(before, after),
      complexityChange: this.diffComplexity(before, after),
    };
  }

  /**
   * Detect structural changes: nodes added, removed, or unchanged.
   * Nodes are matched by their componentName + lineNumber combination
   * (not by ID, since IDs are ephemeral and change between analyses).
   */
  private diffStructure(
    before: SerializedGraph,
    after: SerializedGraph
  ): StructuralDiff {
    const beforeNodes = Object.values(before.nodes);
    const afterNodes = Object.values(after.nodes);

    // Build lookup maps using componentName + lineNumber as the stable key
    const beforeMap = this.buildStableMap(beforeNodes);
    const afterMap = this.buildStableMap(afterNodes);

    const added: NodeSummary[] = [];
    const removed: NodeSummary[] = [];

    // Find added nodes (in after but not in before)
    for (const [key, node] of afterMap) {
      if (!beforeMap.has(key)) {
        added.push(this.toNodeSummary(node));
      }
    }

    // Find removed nodes (in before but not in after)
    for (const [key, node] of beforeMap) {
      if (!afterMap.has(key)) {
        removed.push(this.toNodeSummary(node));
      }
    }

    return {
      added,
      removed,
      netChange: added.length - removed.length,
    };
  }

  /**
   * Build a stable map keyed by "componentName:lineNumber".
   * This is the most reliable way to match nodes across snapshots
   * since IDs are regenerated each analysis.
   */
  private buildStableMap(
    nodes: SerializedNode[]
  ): Map<string, SerializedNode> {
    const map = new Map<string, SerializedNode>();
    for (const node of nodes) {
      const key = `${node.componentName}:${node.lineNumber}`;
      // If there are duplicates (same component at same line), keep the first
      if (!map.has(key)) {
        map.set(key, node);
      }
    }
    return map;
  }

  /**
   * Detect spacing changes on nodes that exist in both snapshots.
   * Compares all spacing properties (margin, padding, gap) for
   * nodes matched by stable key.
   */
  private diffSpacing(
    before: SerializedGraph,
    after: SerializedGraph
  ): SpacingChange[] {
    const changes: SpacingChange[] = [];

    const beforeNodes = Object.values(before.nodes);
    const afterNodes = Object.values(after.nodes);

    const beforeMap = this.buildStableMap(beforeNodes);
    const afterMap = this.buildStableMap(afterNodes);

    const spacingProps: Array<keyof SerializedNode['spacing']> = [
      'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight',
      'marginVertical', 'marginHorizontal',
      'padding', 'paddingTop', 'paddingBottom', 'paddingLeft', 'paddingRight',
      'paddingVertical', 'paddingHorizontal',
      'gap', 'rowGap', 'columnGap',
    ];

    for (const [key, afterNode] of afterMap) {
      const beforeNode = beforeMap.get(key);
      if (!beforeNode) continue; // Node was added — no before state

      for (const prop of spacingProps) {
        const beforeVal = beforeNode.spacing[prop];
        const afterVal = afterNode.spacing[prop];

        if (beforeVal !== afterVal) {
          changes.push({
            nodeId: afterNode.id,
            componentName: afterNode.componentName,
            property: prop,
            before: beforeVal,
            after: afterVal,
            description: this.describeSpacingChange(
              afterNode.componentName,
              prop,
              beforeVal,
              afterVal
            ),
          });
        }
      }
    }

    return changes;
  }

  /**
   * Generate a human-readable description of a spacing change.
   */
  private describeSpacingChange(
    componentName: string,
    property: string,
    before: number | undefined,
    after: number | undefined
  ): string {
    const beforeStr = before !== undefined ? `${before}px` : 'not set';
    const afterStr = after !== undefined ? `${after}px` : 'removed';

    if (before === undefined && after !== undefined) {
      return `<${componentName}> ${property}: ${afterStr} (added)`;
    }
    if (before !== undefined && after === undefined) {
      return `<${componentName}> ${property}: ${beforeStr} -> removed`;
    }
    if (before !== undefined && after !== undefined) {
      const direction = after > before ? 'increased' : 'decreased';
      const delta = Math.abs(after - before);
      return `<${componentName}> ${property}: ${beforeStr} -> ${afterStr} (${direction} by ${delta}px)`;
    }
    return `<${componentName}> ${property}: ${beforeStr} -> ${afterStr}`;
  }

  /**
   * Compare violation counts between two snapshots.
   */
  private diffViolations(
    before: SerializedGraph,
    after: SerializedGraph
  ): ViolationCountChange {
    const beforeCounts = before.details.violations;
    const afterCounts = after.details.violations;

    const deltas: Record<keyof SerializedViolationCounts, number> = {
      contextualGapViolations: afterCounts.contextualGapViolations - beforeCounts.contextualGapViolations,
      boundaryViolations: afterCounts.boundaryViolations - beforeCounts.boundaryViolations,
      terminalPaddingViolations: afterCounts.terminalPaddingViolations - beforeCounts.terminalPaddingViolations,
      groupingSuggestions: afterCounts.groupingSuggestions - beforeCounts.groupingSuggestions,
      tokenDeviations: afterCounts.tokenDeviations - beforeCounts.tokenDeviations,
      gapOpportunities: afterCounts.gapOpportunities - beforeCounts.gapOpportunities,
      stylePollution: afterCounts.stylePollution - beforeCounts.stylePollution,
      marginStacking: afterCounts.marginStacking - beforeCounts.marginStacking,
      listItemIssues: afterCounts.listItemIssues - beforeCounts.listItemIssues,
      rhythmViolations: afterCounts.rhythmViolations - beforeCounts.rhythmViolations,
      proximityIssues: afterCounts.proximityIssues - beforeCounts.proximityIssues,
    };

    const totalBefore = this.sumViolations(beforeCounts);
    const totalAfter = this.sumViolations(afterCounts);

    return {
      before: beforeCounts,
      after: afterCounts,
      deltas,
      netChange: totalAfter - totalBefore,
    };
  }

  /**
   * Sum all violation counts.
   */
  private sumViolations(counts: SerializedViolationCounts): number {
    return Object.values(counts).reduce((sum, val) => sum + val, 0);
  }

  /**
   * Compare health scores between two snapshots.
   */
  private diffHealthScore(
    before: SerializedGraph,
    after: SerializedGraph
  ): HealthScoreChange {
    const beforeScore = before.details.healthScore;
    const afterScore = after.details.healthScore;

    return {
      before: beforeScore,
      after: afterScore,
      delta: afterScore - beforeScore,
    };
  }

  /**
   * Compare complexity grades between two snapshots.
   */
  private diffComplexity(
    before: SerializedGraph,
    after: SerializedGraph
  ): ComplexityChange {
    const beforeGrade = before.details.complexityProfile.grade;
    const afterGrade = after.details.complexityProfile.grade;

    return {
      before: beforeGrade,
      after: afterGrade,
      changed: beforeGrade !== afterGrade,
    };
  }

  /**
   * Convert a SerializedNode to a NodeSummary.
   */
  private toNodeSummary(node: SerializedNode): NodeSummary {
    return {
      id: node.id,
      componentName: node.componentName,
      tagName: node.tagName,
      lineNumber: node.lineNumber,
    };
  }
}

// ─── Diff Formatting ──────────────────────────────────────────

/**
 * Format a GraphDiff as a human-readable ASCII report.
 * This is the primary output format for the diff_layout_graphs tool.
 */
export function formatDiff(diff: GraphDiff): string {
  const lines: string[] = [];

  lines.push(`[LAYOUT-DIFF] ${diff.metadata.filePath}`);
  lines.push('');
  lines.push(`  Before: ${diff.metadata.before.commitHash} (${diff.metadata.before.timestamp})`);
  lines.push(`  After:  ${diff.metadata.after.commitHash} (${diff.metadata.after.timestamp})`);
  lines.push('');

  // ─── Structural Changes ──────────────────────────────────────
  lines.push(`  ── Structural Changes ──`);
  if (diff.structural.added.length === 0 && diff.structural.removed.length === 0) {
    lines.push(`  (No structural changes)`);
  } else {
    for (const added of diff.structural.added) {
      lines.push(`  + <${added.componentName}> at line ${added.lineNumber} (added)`);
    }
    for (const removed of diff.structural.removed) {
      lines.push(`  - <${removed.componentName}> at line ${removed.lineNumber} (removed)`);
    }
    const netLabel = diff.structural.netChange >= 0 ? `+${diff.structural.netChange}` : `${diff.structural.netChange}`;
    lines.push(`  Net: ${netLabel} components`);
  }
  lines.push('');

  // ─── Spacing Changes ─────────────────────────────────────────
  lines.push(`  ── Spacing Changes ──`);
  if (diff.spacingChanges.length === 0) {
    lines.push(`  (No spacing changes)`);
  } else {
    for (const change of diff.spacingChanges) {
      lines.push(`  ~ ${change.description}`);
    }
  }
  lines.push('');

  // ─── Violation Changes ───────────────────────────────────────
  lines.push(`  ── Violation Changes ──`);
  const introduced: string[] = [];
  const resolved: string[] = [];

  for (const [category, delta] of Object.entries(diff.violationChanges.deltas)) {
    if (delta > 0) {
      introduced.push(`  + ${delta} ${formatCategoryName(category)} (introduced)`);
    } else if (delta < 0) {
      resolved.push(`  - ${Math.abs(delta)} ${formatCategoryName(category)} (resolved)`);
    }
  }

  if (introduced.length === 0 && resolved.length === 0) {
    lines.push(`  (No violation changes)`);
  } else {
    for (const line of introduced) lines.push(line);
    for (const line of resolved) lines.push(line);
    const netLabel = diff.violationChanges.netChange >= 0
      ? `+${diff.violationChanges.netChange}`
      : `${diff.violationChanges.netChange}`;
    lines.push(`  Net: ${netLabel} total violations`);
  }
  lines.push('');

  // ─── Health Score ────────────────────────────────────────────
  const healthDelta = diff.healthScoreChange.delta;
  const healthLabel = healthDelta >= 0 ? `+${healthDelta}` : `${healthDelta}`;
  const healthDir = healthDelta >= 0 ? 'improved' : 'degraded';
  lines.push(`  ── Health Score ──`);
  lines.push(`  ${diff.healthScoreChange.before}/100 -> ${diff.healthScoreChange.after}/100 (${healthDir} by ${Math.abs(healthDelta)}pts)`);
  lines.push('');

  // ─── Complexity ──────────────────────────────────────────────
  lines.push(`  ── Complexity ──`);
  if (diff.complexityChange.changed) {
    lines.push(`  ${diff.complexityChange.before} -> ${diff.complexityChange.after} (grade changed)`);
  } else {
    lines.push(`  ${diff.complexityChange.before} (unchanged)`);
  }

  return lines.join('\n');
}

/**
 * Format a camelCase category name for display.
 * E.g., "contextualGapViolations" -> "contextual gap violations"
 */
function formatCategoryName(name: string): string {
  return name
    .replace(/([A-Z])/g, ' $1')
    .toLowerCase()
    .trim();
}
