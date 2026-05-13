// ============================================================
// HeuristicInferenceEngine.ts — Orchestrator that analyzes the
// Semantic Layout Graph and produces inference results.
//
// Delegates to:
//   - GraphAnalyzer for gap/style/margin/list analysis
//   - TokenDeviationDetector for design token validation
//   - GraphRenderer for ASCII tree output
//
// v1.0.0 "Refactored Vein" — Simplified to orchestrator only.
// v2.0.0 "Visual Semantic Orchestration" — Added:
//   - Contextual gap violations (Intra/Inter section rules)
//   - Boundary rule violations (last child marginBottom)
//   - Rule of Three grouping suggestions
//   - Updated health score formula
// ============================================================

import { SemanticLayoutGraph } from './SemanticLayoutGraph.js';
import { GraphAnalyzer, PaddingIssue } from './GraphAnalyzer.js';
import { GraphRenderer } from './GraphRenderer.js';
import { TokenDeviationDetector, DEFAULT_DESIGN_TOKENS } from './TokenDeviationDetector.js';
import { hasChildMarginPollution } from './FoundationCheck.js';
import type {
  LayoutNode,
  TokenDeviation,
  InferenceResult,
  GapOpportunity,
  StylePollution,
  MarginStacking,
  ListItemIssue,
  RhythmViolation,
  ProximityIssue,
  ContextualGapViolation,
  BoundaryViolation,
  GroupingSuggestion,
  TerminalPaddingViolation,
} from './types.js';

// ─── Engine ───────────────────────────────────────────────────

export interface HeuristicOptions {
  /** Valid design token values */
  designTokens?: number[];
  /** Maximum acceptable pollution score per component */
  maxPollutionScore?: number;
}

export class HeuristicInferenceEngine {
  private options: Required<HeuristicOptions>;
  private analyzer: GraphAnalyzer;
  private renderer: GraphRenderer;
  private tokenDetector: TokenDeviationDetector;

  constructor(options: HeuristicOptions = {}) {
    this.options = {
      designTokens: options.designTokens ?? DEFAULT_DESIGN_TOKENS,
      maxPollutionScore: options.maxPollutionScore ?? 3,
    };
    this.analyzer = new GraphAnalyzer();
    this.renderer = new GraphRenderer();
    this.tokenDetector = new TokenDeviationDetector(this.options.designTokens);
  }

  /**
   * Analyze the graph and produce inference results.
   */
  analyze(graph: SemanticLayoutGraph): InferenceResult {
    const gapOpportunities = this.detectGapOpportunities(graph);
    const stylePollution = this.detectStylePollution(graph);
    const marginStacking = this.detectMarginStacking(graph);
    const listItemIssues = this.detectListItemIssues(graph);
    const tokenDeviations = this.tokenDetector.detect(graph);
    const orphanPadding = this.analyzer.findOrphanPadding(graph);

    // Merge orphan padding into token deviations
    for (const op of orphanPadding) {
      if (this.options.designTokens.includes(op.value)) continue;
      tokenDeviations.push({
        property: `${op.node.componentName}.${op.property}`,
        value: op.value,
        suggestion: `Replace ${op.property}: ${op.value} with a design token. ${op.description}`,
      });
    }

    // ─── Deduplication ──────────────────────────────────────────
    const seenGap = new Set<string>();
    const dedupedGaps: GapOpportunity[] = [];
    for (const g of gapOpportunities) {
      const key = `${g.node.id}::${g.description}`;
      if (seenGap.has(key)) continue;
      seenGap.add(key);
      dedupedGaps.push(g);
    }

    const seenStack = new Set<string>();
    const dedupedStacks: MarginStacking[] = [];
    for (const s of marginStacking) {
      const key = `${s.parent.id}::${s.child.id}`;
      if (seenStack.has(key)) continue;
      seenStack.add(key);
      dedupedStacks.push(s);
    }

    const seenPollution = new Set<string>();
    const dedupedPollution: StylePollution[] = [];
    for (const p of stylePollution) {
      const key = `${p.node.id}::${p.description}`;
      if (seenPollution.has(key)) continue;
      seenPollution.add(key);
      dedupedPollution.push(p);
    }

    // ─── v1.1.0: Legacy analysis ────────────────────────────────
    const rhythmViolations = this.analyzer.findRhythmViolations(graph);
    const proximityIssues = this.analyzer.findProximityIssues(graph);

    // ─── v2.0.0: New analysis ───────────────────────────────────
    const contextualGapViolations = this.analyzer.findContextualGapViolations(graph);
    const boundaryViolations = this.analyzer.findBoundaryViolations(graph);

    // Build polluted container set for Rule of Three
    const pollutedContainers = new Set<string>();
    for (const container of graph.getContainerNodes()) {
      if (hasChildMarginPollution(container)) {
        pollutedContainers.add(container.id);
      }
    }
    const groupingSuggestions = this.analyzer.findGroupingSuggestions(graph, pollutedContainers);

    // ─── v2.3.0: Terminal Padding Violations ─────────────────────
    const terminalPaddingViolations = this.analyzer.findTerminalPaddingViolations(graph);

    const healthScore = this.calculateHealthScore(
      dedupedGaps.length,
      dedupedPollution.length,
      dedupedStacks.length,
      listItemIssues.length,
      tokenDeviations.length,
      rhythmViolations.length,
      proximityIssues.length,
      contextualGapViolations.length,
      boundaryViolations.length,
      groupingSuggestions.length,
      terminalPaddingViolations.length,
      graph.getAllNodes().length
    );

    return {
      gapOpportunities: dedupedGaps,
      stylePollution: dedupedPollution,
      marginStacking: dedupedStacks,
      listItemIssues,
      tokenDeviations,
      rhythmViolations,
      proximityIssues,
      contextualGapViolations,
      boundaryViolations,
      groupingSuggestions,
      terminalPaddingViolations,
      healthScore,
    };
  }

  /**
   * Generate a summary report from inference results.
   */
  generateSummaryReport(result: InferenceResult): string {
    const lines: string[] = [];

    lines.push(`[REPORT] Vein Propagation Report`);
    lines.push(`  Health Score: ${result.healthScore}/100`);
    lines.push('');

    if (result.gapOpportunities.length > 0) {
      lines.push(`[HIGH] Gap Opportunities: ${result.gapOpportunities.length}`);
      for (const op of result.gapOpportunities) {
        lines.push(`  ${op.description}`);
        lines.push(`  Fix: ${op.suggestion}`);
      }
      lines.push('');
    }

    if (result.stylePollution.length > 0) {
      lines.push(`[HIGH] Style Pollution: ${result.stylePollution.length}`);
      for (const p of result.stylePollution) {
        lines.push(`  ${p.description}`);
        lines.push(`  Fix: ${p.suggestion}`);
      }
      lines.push('');
    }

    if (result.marginStacking.length > 0) {
      lines.push(`[MEDIUM] Margin Stacking: ${result.marginStacking.length}`);
      for (const s of result.marginStacking) {
        lines.push(`  Parent <${s.parent.tagName}> + child <${s.child.tagName}> = ${s.totalSpacing}px`);
      }
      lines.push('');
    }

    if (result.listItemIssues.length > 0) {
      lines.push(`[MEDIUM] List Item Issues: ${result.listItemIssues.length}`);
      for (const li of result.listItemIssues) {
        lines.push(`  ${li.description}`);
      }
      lines.push('');
    }

    if (result.tokenDeviations.length > 0) {
      lines.push(`[LOW] Token Deviations: ${result.tokenDeviations.length}`);
      for (const td of result.tokenDeviations) {
        lines.push(`  ${td.property}: ${td.value} -> ${td.suggestion}`);
      }
      lines.push('');
    }

    // v1.1.0: Rhythm Hierarch
    if (result.rhythmViolations.length > 0) {
      lines.push(`[MEDIUM] Rhythm Violations (v1): ${result.rhythmViolations.length}`);
      for (const rv of result.rhythmViolations) {
        lines.push(`  ${rv.description}`);
        lines.push(`  Fix: ${rv.suggestion}`);
      }
      lines.push('');
    }

    // v1.1.0: Semantic Proximity
    if (result.proximityIssues.length > 0) {
      lines.push(`[LOW] Proximity Issues (v1): ${result.proximityIssues.length}`);
      for (const pi of result.proximityIssues) {
        lines.push(`  ${pi.description}`);
        lines.push(`  Fix: ${pi.suggestion}`);
      }
      lines.push('');
    }

    // ─── v2.0.0: Contextual Gap Violations ──────────────────────
    if (result.contextualGapViolations.length > 0) {
      lines.push(`[MEDIUM] Contextual Gap Violations (v2): ${result.contextualGapViolations.length}`);
      for (const cgv of result.contextualGapViolations) {
        const typeLabel = cgv.violationType === 'loose-rhythm' ? 'Loose Rhythm' : 'Section Collision';
        lines.push(`  [${typeLabel}] ${cgv.description}`);
        lines.push(`  Fix: ${cgv.suggestion}`);
      }
      lines.push('');
    }

    // ─── v2.0.0: Boundary Violations ────────────────────────────
    if (result.boundaryViolations.length > 0) {
      lines.push(`[MEDIUM] Boundary Violations (v2): ${result.boundaryViolations.length}`);
      for (const bv of result.boundaryViolations) {
        lines.push(`  ${bv.description}`);
        lines.push(`  Fix: ${bv.suggestion}`);
      }
      lines.push('');
    }

    // ─── v2.0.0: Grouping Suggestions ───────────────────────────
    if (result.groupingSuggestions.length > 0) {
      lines.push(`[LOW] Grouping Suggestions (v2): ${result.groupingSuggestions.length}`);
      for (const gs of result.groupingSuggestions) {
        lines.push(`  ${gs.description}`);
        lines.push(`  Fix: ${gs.suggestion}`);
      }
      lines.push('');
    }

    // ─── v2.3.0: Terminal Padding Violations ────────────────────
    if (result.terminalPaddingViolations.length > 0) {
      lines.push(`[MEDIUM] Terminal Padding Violations (v2.3): ${result.terminalPaddingViolations.length}`);
      for (const tpv of result.terminalPaddingViolations) {
        lines.push(`  ${tpv.description}`);
        lines.push(`  Fix: ${tpv.suggestion}`);
      }
      lines.push('');
    }

    if (result.gapOpportunities.length === 0 &&
        result.stylePollution.length === 0 &&
        result.marginStacking.length === 0 &&
        result.listItemIssues.length === 0 &&
        result.tokenDeviations.length === 0 &&
        result.rhythmViolations.length === 0 &&
        result.proximityIssues.length === 0 &&
        result.contextualGapViolations.length === 0 &&
        result.boundaryViolations.length === 0 &&
        result.groupingSuggestions.length === 0 &&
        result.terminalPaddingViolations.length === 0) {
      lines.push('[CLEAN] No layout issues detected. Component tree is clean.');
    }

    return lines.join('\n');
  }

  /**
   * Render the graph as an ASCII tree.
   */
  renderAscii(graph: SemanticLayoutGraph): string {
    return this.renderer.renderAscii(graph);
  }

  // ─── Gap Opportunities ─────────────────────────────────────

  private detectGapOpportunities(graph: SemanticLayoutGraph): GapOpportunity[] {
    const opportunities: GapOpportunity[] = [];
    const rawOps = this.analyzer.findGapOpportunities(graph);

    for (const op of rawOps) {
      const marginValues = op.node.children
        .map((c) => c.spacing.marginBottom ?? c.spacing.marginTop ?? c.spacing.marginVertical ?? c.spacing.margin)
        .filter((v): v is number => v !== undefined);

      const suggestedGap = marginValues.length > 0
        ? Math.max(...marginValues)
        : 16;

      opportunities.push({
        node: op.node,
        severity: 'high',
        description: `Container "${op.node.componentName}" (line ${op.node.lineNumber}) has ${op.node.children.length} children using margins instead of parent gap. This creates brittle spacing that breaks when children are reordered.`,
        suggestion: `Replace child margins with parent gap: add gap: ${suggestedGap} to the container. Remove marginBottom/marginTop from all direct children.`,
      });
    }

    // Also check for tightly packed children with no spacing
    for (const node of graph.getContainerNodes()) {
      if (node.isCustomComponent) continue;
      if (node.layout.flexDirection === 'row') continue;
      const hasGap = node.spacing.gap !== undefined;
      const hasChildMargins = node.children.some(
        (c) =>
          c.spacing.marginBottom !== undefined ||
          c.spacing.marginTop !== undefined ||
          c.spacing.marginVertical !== undefined ||
          c.spacing.margin !== undefined
      );
      if (node.children.length < 2) continue;
      if (!hasGap && !hasChildMargins) {
        opportunities.push({
          node,
          severity: 'low',
          description: `Container "${node.componentName}" (line ${node.lineNumber}) has ${node.children.length} children with no gap and no child margins. Children are tightly packed.`,
          suggestion: `Consider adding gap: 16 to the container for consistent spacing between children.`,
        });
      }
    }

    return opportunities;
  }

  // ─── Style Pollution ───────────────────────────────────────

  private detectStylePollution(graph: SemanticLayoutGraph): StylePollution[] {
    const pollution: StylePollution[] = [];
    const rawPollution = this.analyzer.findStylePollution(graph);

    for (const node of rawPollution) {
      const marginProps: string[] = [];
      if (node.spacing.margin !== undefined) marginProps.push(`margin: ${node.spacing.margin}`);
      if (node.spacing.marginBottom !== undefined) marginProps.push(`marginBottom: ${node.spacing.marginBottom}`);
      if (node.spacing.marginTop !== undefined) marginProps.push(`marginTop: ${node.spacing.marginTop}`);
      if (node.spacing.marginVertical !== undefined) marginProps.push(`marginVertical: ${node.spacing.marginVertical}`);

      const isBaseComponent = /[\\/]_components[\\/]/.test(node.filePath) ||
        /[\\/]ui[\\/]/.test(node.filePath);

      pollution.push({
        node,
        severity: isBaseComponent ? 'high' : 'medium',
        description: isBaseComponent
          ? `Base component "${node.componentName}" (line ${node.lineNumber}) defines outer spacing (${marginProps.join(', ')}). Base components MUST NOT define margins — orchestration belongs to parent containers.`
          : `Component "${node.componentName}" (line ${node.lineNumber}) defines outer spacing (${marginProps.join(', ')}). Consider moving to parent container.`,
        suggestion: isBaseComponent
          ? `Remove ${marginProps.join(', ')} from "${node.componentName}" and let parent containers define spacing via gap/padding.`
          : `Move ${marginProps.join(', ')} from "${node.componentName}" to the parent container's layout logic.`,
      });
    }

    return pollution;
  }

  // ─── Margin Stacking ───────────────────────────────────────

  private detectMarginStacking(graph: SemanticLayoutGraph): MarginStacking[] {
    const stacking: MarginStacking[] = [];
    const rawStacks = this.analyzer.findMarginStacking(graph);

    for (const stack of rawStacks) {
      stacking.push({
        parent: stack.parent,
        child: stack.child,
        totalSpacing: stack.totalSpacing,
        severity: stack.totalSpacing > 24 ? 'medium' : 'low',
      });
    }

    return stacking;
  }

  // ─── List Item Issues ──────────────────────────────────────

  private detectListItemIssues(graph: SemanticLayoutGraph): ListItemIssue[] {
    const issues: ListItemIssue[] = [];
    const rawIssues = this.analyzer.findMissingLastItemGuards(graph);

    for (const node of rawIssues) {
      issues.push({
        node,
        severity: 'medium',
        description: `List item "${node.componentName}" (line ${node.lineNumber}) has marginBottom but no last-item guard. The last item will have unnecessary bottom spacing.`,
        suggestion: `Add a last-item guard: style={[styles.item, index === items.length - 1 && styles.lastItem]} where lastItem has marginBottom: 0.`,
      });
    }

    return issues;
  }

  // ─── Health Score ──────────────────────────────────────────

  private calculateHealthScore(
    gapCount: number,
    pollutionCount: number,
    stackingCount: number,
    listIssuesCount: number,
    tokenDeviationCount: number,
    rhythmCount: number,
    proximityCount: number,
    contextualGapCount: number,
    boundaryCount: number,
    groupingCount: number,
    terminalPaddingCount: number,
    totalNodes: number
  ): number {
    if (totalNodes === 0) return 100;

    const totalIssues = gapCount + pollutionCount + stackingCount + listIssuesCount +
      tokenDeviationCount + rhythmCount + proximityCount +
      contextualGapCount + boundaryCount + groupingCount + terminalPaddingCount;

    const issueRatio = totalIssues / totalNodes;

    const score = Math.max(0, Math.min(100, Math.round(100 - issueRatio * 50)));

    return score;
  }
}
