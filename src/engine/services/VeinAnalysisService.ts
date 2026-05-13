// ============================================================
// VeinAnalysisService.ts — Public API for the Vein Propagation
// Engine. Orchestrates the full pipeline:
//   AST Parse → Venous Propagate → Heuristic Infer → Report
//
// v0.6.0 "Vein Propagation" — Replaces all regex-based
//   boundary gap detection with AST-driven analysis.
// ============================================================

import * as path from 'path';
import { VenousPropagator, PropagationOptions } from '../vein/VenousPropagator.js';
import { HeuristicInferenceEngine, HeuristicOptions } from '../vein/HeuristicInferenceEngine.js';
import { SemanticLayoutGraph } from '../vein/SemanticLayoutGraph.js';
import type { InferenceResult } from '../vein/types.js';
import { hasCumulativePaddingBoundary } from '../vein/FoundationCheck.js';
import { BoundaryGap, BoundaryGapReport } from '../../domain/types/index.js';

// ─── Service ─────────────────────────────────────────────────

export interface VeinAnalysisOptions {
  designTokens?: number[];
  maxDepth?: number;
  /**
   * v0.8.3: Mode filter for boundary gap detection.
   * - 'all': Report all gap types (default)
   * - 'vein-propagation': Full AST-driven analysis (same as 'all')
   * Legacy modes (anchors, rhythm, margin-inventory, gap-validator) removed.
   */
  mode?: 'all' | 'vein-propagation';

}

/**
 * Run the full Vein Propagation analysis on a file.
 * Returns a BoundaryGapReport compatible with the existing
 * detect_boundary_gaps tool output format.
 */
export function runVeinAnalysis(
  filePath: string,
  options: VeinAnalysisOptions = {}
): BoundaryGapReport {
  const absolutePath = path.resolve(filePath);

  // Step 1: Propagate — build the Semantic Layout Graph
  const propagator = new VenousPropagator({
    designTokens: options.designTokens,
    maxDepth: options.maxDepth ?? 10,
  });

  const graph = propagator.propagate(absolutePath);

  // Step 2: Infer — analyze the graph for issues
  const engine = new HeuristicInferenceEngine({
    designTokens: options.designTokens,
  });

  const result = engine.analyze(graph);

  // Step 3: Convert to BoundaryGapReport format, filtering by mode
  return convertToReport(absolutePath, graph, result, options.mode ?? 'all');
}

/**
 * Run vein analysis and return the raw graph + inference result
 * (for programmatic consumers).
 */
export function runVeinAnalysisRaw(
  filePath: string,
  options: VeinAnalysisOptions = {}
): {
  graph: SemanticLayoutGraph;
  inference: InferenceResult;
} {
  const absolutePath = path.resolve(filePath);

  const propagator = new VenousPropagator({
    designTokens: options.designTokens,
    maxDepth: options.maxDepth ?? 10,
  });

  const graph = propagator.propagate(absolutePath);

  const engine = new HeuristicInferenceEngine({
    designTokens: options.designTokens,
  });

  const inference = engine.analyze(graph);

  return { graph, inference };
}

// ─── Report Conversion ───────────────────────────────────────

function convertToReport(
  filePath: string,
  graph: SemanticLayoutGraph,
  result: InferenceResult,
  mode: 'all' | 'vein-propagation' = 'all'
): BoundaryGapReport {
  const gaps: BoundaryGap[] = [];

  // All modes now run the full AST-driven Vein Propagation analysis.
  // Legacy mode filtering (anchors, rhythm, margin-inventory, gap-validator)
  // has been removed — Vein Propagation subsumes them all.

  // Gap opportunities → high severity
  for (const op of result.gapOpportunities) {
    gaps.push({
      severity: op.severity,
      category: 'style-pollution',
      description: op.description,
      location: `<${op.node.tagName}> at line ${op.node.lineNumber}`,
      suggestion: op.suggestion,
    });
  }

  // Style pollution → high/medium
  for (const p of result.stylePollution) {
    gaps.push({
      severity: p.severity,
      category: 'style-pollution',
      description: p.description,
      location: `<${p.node.tagName}> at line ${p.node.lineNumber}`,
      suggestion: p.suggestion,
    });
  }

  // Margin stacking → medium/low
  for (const s of result.marginStacking) {
    gaps.push({
      severity: s.severity,
      category: 'margin-stacking',
      description: `Parent <${s.parent.tagName}> padding + child <${s.child.tagName}> margin = ${s.totalSpacing}px. This creates ${s.totalSpacing}px spacing between items — likely unintended double spacing.`,
      location: `<${s.parent.tagName}> → <${s.child.tagName}>`,
      suggestion: `Use EITHER parent padding OR child margins, not both. Prefer parent gap.`,
    });
  }

  // List item issues → medium
  for (const li of result.listItemIssues) {
    gaps.push({
      severity: li.severity,
      category: 'missing-last-item-guard',
      description: li.description,
      location: `<${li.node.tagName}> at line ${li.node.lineNumber}`,
      suggestion: li.suggestion,
    });
  }

  // Token deviations → low
  for (const td of result.tokenDeviations) {
    gaps.push({
      severity: 'low',
      category: 'magic-number',
      description: `Spacing value ${td.value} in "${td.property}" is not a design token.`,
      location: td.property,
      suggestion: td.suggestion,
    });
  }

  // ─── v2.2.0: Ghost Margin Detection (Cumulative Padding) ─────
  // Check all container nodes for cumulative boundary padding
  // where the last child's paddingBottom overlaps with parent paddingBottom.
  for (const container of graph.getContainerNodes()) {
    const ghostMargin = hasCumulativePaddingBoundary(container);
    if (ghostMargin) {
      gaps.push({
        severity: 'medium',
        category: 'ghost-margin',
        description: `Ghost Margin: Container <${ghostMargin.container.componentName}> has paddingBottom: ${ghostMargin.parentPaddingBottom}px and its last child <${ghostMargin.lastChild.componentName}> also has paddingBottom: ${ghostMargin.childPaddingBottom}px. Combined bottom spacing = ${ghostMargin.totalCumulative}px — likely unintended double padding.`,
        location: `<${ghostMargin.container.componentName}> → <${ghostMargin.lastChild.componentName}>`,
        suggestion: `Remove paddingBottom from <${ghostMargin.lastChild.componentName}> and rely on the parent container's paddingBottom: ${ghostMargin.parentPaddingBottom}px for screen-edge spacing.`,
      });
    }
  }

  // ─── v2.3.0: Terminal Padding Violations ─────────────────────
  // Detect last-child paddingBottom/marginBottom that is redundant
  // when the container already has gap or padding.
  for (const tpv of result.terminalPaddingViolations) {
    gaps.push({
      severity: 'medium',
      category: 'ghost-margin',
      description: `Terminal Padding: Last child <${tpv.child.componentName}> of container <${tpv.container.componentName}> has ${tpv.property}: ${tpv.value}px but the container already has spacing (gap/padding). This creates redundant "Ghost Margin" boundary spacing.`,
      location: `<${tpv.container.componentName}> → <${tpv.child.componentName}>`,
      suggestion: `Remove ${tpv.property}: ${tpv.value}px from <${tpv.child.componentName}>. The container <${tpv.container.componentName}> already handles boundary spacing via its own gap/padding.`,
    });
  }

  // Build summary with mode-aware label

  const modeLabel = mode === 'vein-propagation' ? 'Vein Propagation' : 'Boundary Gap Detection';


  const highCount = gaps.filter((g) => g.severity === 'high').length;
  const mediumCount = gaps.filter((g) => g.severity === 'medium').length;
  const lowCount = gaps.filter((g) => g.severity === 'low').length;

  let summary: string;
  if (highCount > 0) {
    summary = `[CRITICAL] ${modeLabel}: ${highCount} critical, ${mediumCount} warning(s), ${lowCount} info — layout issues found. Health score: ${result.healthScore}/100.`;
  } else if (mediumCount > 0) {
    summary = `[WARNING] ${modeLabel}: ${mediumCount} warning(s), ${lowCount} info — minor layout issues. Health score: ${result.healthScore}/100.`;
  } else if (lowCount > 0) {
    summary = `[INFO] ${modeLabel}: ${lowCount} info — spacing observations. Health score: ${result.healthScore}/100.`;
  } else {
    summary = `[CLEAN] ${modeLabel}: No layout issues detected. Component tree is clean. Health score: ${result.healthScore}/100.`;
  }

  return { filePath, gaps, summary };
}

/**
 * Generate a detailed vein analysis report including the ASCII tree.
 */
export function generateVeinReport(
  filePath: string,
  options: VeinAnalysisOptions = {}
): string {
  const absolutePath = path.resolve(filePath);

  const propagator = new VenousPropagator({
    designTokens: options.designTokens,
    maxDepth: options.maxDepth ?? 10,
  });

  const graph = propagator.propagate(absolutePath);

  const engine = new HeuristicInferenceEngine({
    designTokens: options.designTokens,
  });

  const inference = engine.analyze(graph);

  const lines: string[] = [];
  lines.push('[VEIN-ANALYSIS] Vein Propagation Analysis');
  lines.push('-'.repeat(60));
  lines.push(`File: ${filePath}`);
  lines.push(`Health Score: ${inference.healthScore}/100`);
  lines.push('');
  lines.push('[TREE] Component Tree:');
  lines.push(engine.renderAscii(graph));
  lines.push('');
  lines.push(engine.generateSummaryReport(inference));
  lines.push('');
  lines.push('-'.repeat(60));

  return lines.join('\n');
}

