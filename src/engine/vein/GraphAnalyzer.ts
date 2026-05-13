// ============================================================
// GraphAnalyzer.ts — Analysis logic for the Semantic Layout Graph.
// Detects gap opportunities, style pollution, margin stacking,
// missing last-item guards, and orphan padding.
//
// v1.0.0 "Refactored Vein" — Extracted from SemanticLayoutGraph.ts
// v1.0.1 "Anchor Threshold Fix" — Added padding-as-gap detection
//   and orphan padding detection for micro-containers.
// v2.0.0 "Visual Semantic Orchestration" — Added:
//   - Contextual gap violations (Intra/Inter section rules)
//   - Boundary rule violations (last child marginBottom)
//   - Rule of Three grouping suggestions
//   - SemanticScorer integration for proximity-based analysis
// v2.1.0 "Run-Length Cluster Encoding" — Replaced fixed Rule of
//   Three window with run-length encoding for variable-length
//   semantic clusters and sub-cluster detection.
// ============================================================

import type { LayoutNode, RhythmViolation, ProximityIssue, ContextualGapViolation, BoundaryViolation, GroupingSuggestion, TerminalPaddingViolation } from './types.js';
import type { SemanticLayoutGraph } from './SemanticLayoutGraph.js';
import { SemanticScorer } from './SemanticScorer.js';

// ─── Analysis Result Types ────────────────────────────────────

export interface GapOpportunity {
  node: LayoutNode;
  suggestion: string;
}

export interface MarginStackResult {
  parent: LayoutNode;
  child: LayoutNode;
  totalSpacing: number;
}

export interface PaddingIssue {
  node: LayoutNode;
  property: string;
  value: number;
  description: string;
}

// ─── Analyzer ─────────────────────────────────────────────────

export class GraphAnalyzer {
  private scorer: SemanticScorer;

  constructor() {
    this.scorer = new SemanticScorer();
  }

  /**
   * Find nodes that have margin/padding but no gap (gap opportunities).
   * v1.0.1: Also detects containers using padding as a gap substitute.
   */
  findGapOpportunities(graph: SemanticLayoutGraph): GapOpportunity[] {
    const opportunities: GapOpportunity[] = [];

    for (const node of graph.getContainerNodes()) {
      // Skip row containers — they're often intentionally gapless
      if (node.layout.flexDirection === 'row') continue;

      const hasGap = node.spacing.gap !== undefined;
      const hasChildMargins = node.children.some(
        (child) =>
          child.spacing.marginBottom !== undefined ||
          child.spacing.marginTop !== undefined ||
          child.spacing.marginVertical !== undefined ||
          child.spacing.margin !== undefined
      );

      if (!hasGap && hasChildMargins) {
        opportunities.push({
          node,
          suggestion: `Replace child margins with parent gap. Container "${node.componentName}" (line ${node.lineNumber}) has ${node.children.length} children using margins instead of parent gap.`,
        });
      }

      // v1.0.1: Detect padding used as a gap substitute
      const hasPadding = node.spacing.padding !== undefined ||
        node.spacing.paddingVertical !== undefined ||
        node.spacing.paddingHorizontal !== undefined;
      if (!hasGap && hasPadding && hasChildMargins) {
        opportunities.push({
          node,
          suggestion: `Container "${node.componentName}" (line ${node.lineNumber}) uses padding for spacing but has children with margins. Consider replacing with gap for consistent inter-child spacing.`,
        });
      }
    }

    return opportunities;
  }

  /**
   * Find style pollution: custom components with hardcoded margins.
   * Skips slot components (they're transparent containers).
   */
  findStylePollution(graph: SemanticLayoutGraph): LayoutNode[] {
    return graph.getAllNodes().filter(
      (n) =>
        n.isCustomComponent &&
        !n.isSlot &&
        (n.spacing.margin !== undefined ||
          n.spacing.marginBottom !== undefined ||
          n.spacing.marginTop !== undefined ||
          n.spacing.marginVertical !== undefined)
    );
  }

  /**
   * Find margin stacking: parent padding + child margins.
   */
  findMarginStacking(graph: SemanticLayoutGraph): MarginStackResult[] {
    const stacks: MarginStackResult[] = [];

    for (const parent of graph.getContainerNodes()) {
      const parentPadding = parent.spacing.padding ?? parent.spacing.paddingVertical ?? 0;
      if (parentPadding <= 0) continue;

      for (const child of parent.children) {
        const childMargin =
          child.spacing.marginBottom ??
          child.spacing.marginVertical ??
          child.spacing.margin ??
          0;
        if (childMargin > 0) {
          stacks.push({
            parent,
            child,
            totalSpacing: parentPadding + childMargin,
          });
        }
      }
    }

    return stacks;
  }

  /**
   * Find list items missing last-item guards.
   */
  findMissingLastItemGuards(graph: SemanticLayoutGraph): LayoutNode[] {
    return graph.getAllNodes().filter(
      (n) =>
        n.isListItem &&
        (n.spacing.marginBottom !== undefined || n.spacing.margin !== undefined)
    );
  }

  /**
   * v1.0.1: Find orphan padding — containers with padding values that
   * serve no clear purpose (no gap, no child margins, single child).
   */
  findOrphanPadding(graph: SemanticLayoutGraph): PaddingIssue[] {
    const issues: PaddingIssue[] = [];

    for (const node of graph.getAllNodes()) {
      const paddingValue = node.spacing.padding ?? node.spacing.paddingVertical ?? node.spacing.paddingHorizontal;
      if (paddingValue === undefined) continue;

      const hasGap = node.spacing.gap !== undefined;
      const hasChildMargins = node.children.some(
        (c) =>
          c.spacing.marginBottom !== undefined ||
          c.spacing.marginTop !== undefined ||
          c.spacing.marginVertical !== undefined ||
          c.spacing.margin !== undefined
      );

      if (!hasGap && !hasChildMargins) {
        const propName = node.spacing.padding !== undefined ? 'padding' :
          node.spacing.paddingVertical !== undefined ? 'paddingVertical' : 'paddingHorizontal';
        issues.push({
          node,
          property: propName,
          value: paddingValue,
          description: `Container "${node.componentName}" (line ${node.lineNumber}) has ${propName}: ${paddingValue} but no gap or child margins. This padding may be a magic number.`,
        });
      }
    }

    return issues;
  }

  // ═══════════════════════════════════════════════════════════════
  // v1.1.0: Rhythm Hierarch (legacy — kept for backward compat)
  // ═══════════════════════════════════════════════════════════════

  /**
   * v1.1.0 "Rhythm Hierarch": Find containers where child gap >= parent gap.
   * Kept for backward compatibility. v2.0.0 consumers should use
   * findContextualGapViolations() instead.
   */
  findRhythmViolations(graph: SemanticLayoutGraph): RhythmViolation[] {
    const violations: RhythmViolation[] = [];

    for (const parent of graph.getContainerNodes()) {
      if (parent.isSlot) continue;
      if (parent.layout.flexDirection === 'row') continue;

      const parentGap = parent.spacing.gap;
      if (parentGap === undefined) continue;

      for (const child of parent.children) {
        if (child.children.length === 0) continue;
        if (child.isSlot) continue;

        const childGap = child.spacing.gap;
        if (childGap === undefined) continue;

        if (childGap >= parentGap) {
          violations.push({
            parent,
            child,
            parentGap,
            childGap,
            severity: childGap === parentGap ? 'high' : 'medium',
            description: `Container "${parent.componentName}" (line ${parent.lineNumber}) has gap: ${parentGap} but child "${child.componentName}" (line ${child.lineNumber}) also has gap: ${childGap}. Inner spacing must be strictly less than outer spacing for visual hierarchy.`,
            suggestion: `Reduce child gap from ${childGap} to ${Math.max(4, Math.floor(parentGap / 2))} (or another value < ${parentGap}) to create a clear visual hierarchy where inner elements are tighter than outer sections.`,
          });
        }
      }
    }

    return violations;
  }

  // ═══════════════════════════════════════════════════════════════
  // v2.0.0: Contextual Gap Violations (Pillar 2A + 2B)
  // ═══════════════════════════════════════════════════════════════

  /**
   * v2.0.0: Find contextual gap violations using the Dynamic Rhythm Hierarch.
   *
   * Validates gaps based on Proximity Score between consecutive siblings:
   *
   * A. Intra-Section Rule (Score > 6):
   *    Target Gap = 8px. Flag if actual gap > 8px → "Loose Rhythm"
   *
   * B. Inter-Section Rule (Score < 4 OR Divider detected):
   *    Target Gap = 16px. Flag if actual gap < 16px → "Section Collision"
   *
   * C. Score 4-6: Neutral zone — no flag (transitional spacing)
   *
   * v2.2.0: Added "Stuck Section" pre-check — flags any 0-gap between
   * two custom components regardless of proximity score. This catches
   * the "formSection ↔ buttonWrapper" pattern where siblings are
   * visually congested with no explicit gap.
   *
   * v2.3.1: Added two filters:
   *   1. Non-visual components (StatusBar, LinearGradient) and
   *      absolutely-positioned elements are excluded from gap audits.
   *   2. Functional-Role Proximity Capping: siblings with different
   *      functional roles (e.g., "input" vs "action") have their
   *      effective proximity score capped at 3, ensuring they get
   *      Inter-Section (16px) spacing even if lexical/prop/visual
   *      scores are high.
   */
  findContextualGapViolations(graph: SemanticLayoutGraph): ContextualGapViolation[] {
    const violations: ContextualGapViolation[] = [];

    // v2.3.1: Known non-visual components that should be excluded from gap audits
    const NON_VISUAL_COMPONENTS = ['StatusBar', 'LinearGradient'];

    for (const container of graph.getContainerNodes()) {
      if (container.isSlot) continue;
      if (container.layout.flexDirection === 'row') continue;

      const children = container.children;
      if (children.length < 2) continue;

      // v2.3.1: Filter out absolutely-positioned and non-visual children
      const visibleChildren = children.filter(
        (c) => c.layout.position !== 'absolute' && !NON_VISUAL_COMPONENTS.includes(c.componentName)
      );
      if (visibleChildren.length < 2) continue;

      // Determine the gap between consecutive children
      // Use container's gap if set, otherwise infer from child margins
      const containerGap = container.spacing.gap;

      for (let i = 0; i < visibleChildren.length - 1; i++) {
        const childA = visibleChildren[i];
        const childB = visibleChildren[i + 1];

        // Compute proximity score between the two siblings
        const score = this.scorer.computeScore(childA, childB, graph);

        // v2.3.1: Functional-Role Proximity Capping
        // If two siblings have different functional roles (e.g., "form" vs "action"),
        // cap the effective score to 3 so they get Inter-Section (16px) spacing.
        // This prevents the tool from forcing 8px gaps between distinct functional blocks.
        const roleA = this.inferFunctionalRole(childA);
        const roleB = this.inferFunctionalRole(childB);
        let effectiveScore = score.total;
        if (roleA !== roleB && roleA !== 'other' && roleB !== 'other') {
          effectiveScore = Math.min(effectiveScore, 3);
        }

        // Determine actual gap between these two siblings
        const actualGap = this.inferGapBetween(container, childA, childB, containerGap);

        // Check for divider between siblings (HR, Divider component)
        const hasDivider = this.isDividerComponent(childA) || this.isDividerComponent(childB);

        // ── v2.2.0: Stuck Section Pre-check ─────────────────────
        // If two custom components have 0px gap between them, flag it
        // as a section-collision regardless of proximity score.
        // This catches the "formSection stuck to buttonWrapper" pattern.
        // EXCEPTION: Form-Input pairs are handled by the v2.2.1 heuristic
        // below, which suggests 8px instead of 16px.
        //
        // v2.3.0: Zero-Gap Bond Scaling — if the proximity score is
        // between 4 and 6 (neutral zone), suggest 8px (Medium Bond /
        // Token 2) instead of 16px (Separation / Token 4). This
        // prevents over-separating siblings that have moderate semantic
        // affinity (e.g., a section title and its content area).
        if (actualGap === 0 && childA.isCustomComponent && childB.isCustomComponent) {
          // Skip stuck-section for form-input pairs — handled below
          if (this.isFormInputPair(childA, childB)) {
            // Fall through to form-input-pair handler
          } else {
            // v2.3.0: Scale target gap based on proximity score
            const targetGap = (score.total >= 4 && score.total <= 6) ? 8 : 16;
            violations.push({
              container,
              childA,
              childB,
              actualGap: 0,
              targetGap,
              proximityScore: score.total,
              violationType: 'section-collision',
              severity: 'high',
              description: `Stuck Section: <${childA.componentName}> and <${childB.componentName}> have 0px gap between them. These sections are visually congested with no breathing room.`,
              suggestion: `Add gap: ${targetGap} between <${childA.componentName}> and <${childB.componentName}> (or wrap in a parent container with gap: ${targetGap}) to create a clear visual separation between functional areas.`,
            });
            continue; // Skip other rules — stuck section is the most severe
          }
        }
        // ── v2.2.1: Form-Input Pair Heuristic ────────────────────
        // If a Text/Label component precedes a FormInput component,
        // the gap should be 8px (Medium Bond / Token 2) rather than
        // 16px (Separation / Token 4). Assign a virtual proximity of
        // 4 to place it in the neutral zone, then suggest 8px.
        //
        // This prevents the Inter-Section Rule from suggesting 16px
        // for label-to-input gaps, which would visually separate
        // functionally coupled form elements.
        if (this.isFormInputPair(childA, childB)) {
          const targetGap = 8;
          if (actualGap < targetGap) {
            violations.push({
              container,
              childA,
              childB,
              actualGap,
              targetGap,
              proximityScore: 4, // Virtual proximity — neutral zone
              violationType: 'section-collision',
              severity: actualGap === 0 ? 'high' : 'medium',
              description: `Label-Input Bond: <${childA.componentName}> precedes <${childB.componentName}> with ${actualGap}px gap. Form labels and inputs should be tightly coupled at ${targetGap}px.`,
              suggestion: `Increase gap between <${childA.componentName}> and <${childB.componentName}> from ${actualGap}px to ${targetGap}px (Token 2) to create a medium bond between label and input.`,
            });
          }
          continue; // Skip other rules — form-input pair is handled
        }

        // ── Intra-Section Rule (Score > 6) ──────────────────────
        // v2.3.1: Uses effectiveScore (which may be capped by functional-role proximity)
        if (effectiveScore > 6) {
          const targetGap = 8;
          if (actualGap > targetGap) {
            violations.push({
              container,
              childA,
              childB,
              actualGap,
              targetGap,
              proximityScore: effectiveScore,
              violationType: 'loose-rhythm',
              severity: actualGap > targetGap * 2 ? 'high' : 'medium',
              description: `Loose Rhythm: <${childA.componentName}> and <${childB.componentName}> have Proximity Score ${effectiveScore} (highly related) but gap is ${actualGap}px. Intra-section elements should be tight at ${targetGap}px.`,
              suggestion: `Reduce gap between these related siblings from ${actualGap}px to ${targetGap}px (Token 2) to visually group them as a cohesive section.`,
            });
          }
        }

        // ── Inter-Section Rule (Score < 4 OR Divider) ───────────
        // v2.3.1: Uses effectiveScore (which may be capped by functional-role proximity)
        if (effectiveScore < 4 || hasDivider) {
          const targetGap = 16;
          if (actualGap < targetGap) {
            violations.push({
              container,
              childA,
              childB,
              actualGap,
              targetGap,
              proximityScore: effectiveScore,
              violationType: 'section-collision',
              severity: actualGap < targetGap / 2 ? 'high' : 'medium',
              description: `Section Collision: <${childA.componentName}> and <${childB.componentName}> have Proximity Score ${effectiveScore} (unrelated) but gap is only ${actualGap}px. Inter-section elements need clear cognitive breaks at ${targetGap}px.`,
              suggestion: `Increase gap between these unrelated siblings from ${actualGap}px to ${targetGap}px (Token 4) to create a clear visual separation between functional areas.`,
            });
          }
        }

        // Score 4-6: Neutral zone — no flag
      }
    }

    return violations;
  }

  /**
   * Infer the effective gap between two consecutive siblings.
   *
   * Priority:
   *   1. Container's `gap` property (if set)
   *   2. Child A's marginBottom
   *   3. Child B's marginTop
   *   4. Child A's marginVertical
   *   5. Child A's margin
   *   6. Fallback: 0 (no gap detected)
   */
  private inferGapBetween(
    container: LayoutNode,
    childA: LayoutNode,
    _childB: LayoutNode,
    containerGap: number | undefined
  ): number {
    if (containerGap !== undefined) return containerGap;

    // Check child A's bottom margin
    if (childA.spacing.marginBottom !== undefined) return childA.spacing.marginBottom;
    if (childA.spacing.marginVertical !== undefined) return childA.spacing.marginVertical;
    if (childA.spacing.margin !== undefined) return childA.spacing.margin;

    // Check child B's top margin
    if (_childB.spacing.marginTop !== undefined) return _childB.spacing.marginTop;

    return 0;
  }

  /**
   * Check if a node is a divider component (HR, Divider, Separator).
   */
  private isDividerComponent(node: LayoutNode): boolean {
    const dividerNames = ['Divider', 'HR', 'Separator', 'Hr', 'divider'];
    return dividerNames.some(
      (name) =>
        node.componentName === name ||
        node.tagName === name ||
        node.componentName.endsWith(name)
    );
  }

  /**
   * v2.2.1: Check if two consecutive siblings form a label-input pair.
   *
   * A label-input pair is one Text/Label component followed by one Input
   * component (or vice versa). These are functionally coupled form elements
   * that should use an 8px "Medium Bond" rather than a 16px "Separation."
   *
   * Text-type patterns: Text, Label, Title, Caption, Heading, Subtitle,
   *   Description, HelperText, ErrorText, Header, Footer
   * Input-type patterns: FormInput, TextInput, Input, TextField, SearchBar,
   *   Picker, Select, Dropdown, Checkbox, Radio, Switch, Slider, TextArea
   */
  private isFormInputPair(a: LayoutNode, b: LayoutNode): boolean {
    const textPatterns = ['Text', 'Label', 'Title', 'Caption', 'Heading', 'Subtitle', 'Description', 'HelperText', 'ErrorText', 'Header', 'Footer'];
    const inputPatterns = ['Input', 'TextField', 'SearchBar', 'Picker', 'Select', 'Dropdown', 'Checkbox', 'Radio', 'Switch', 'Slider', 'FormInput', 'TextArea'];

    const isText = (name: string) => textPatterns.some((p) => name.includes(p));
    const isInput = (name: string) => inputPatterns.some((p) => name.includes(p));

    // Check both orderings: Text→Input or Input→Text
    return (isText(a.componentName) && isInput(b.componentName)) ||
           (isInput(a.componentName) && isText(b.componentName));
  }

  // ═══════════════════════════════════════════════════════════════
  // v2.0.0: Boundary Rule Violations (Pillar 2C)
  // ═══════════════════════════════════════════════════════════════

  /**
   * v2.0.0 "Boundary Rule": Find containers where the last child
   * has a marginBottom. The last child should rely on container
   * paddingBottom for a clean edge.
   *
   * v2.3.1: Skips absolutely-positioned and non-visual children
   * (StatusBar, LinearGradient) when determining the last child.
   */

  findBoundaryViolations(graph: SemanticLayoutGraph): BoundaryViolation[] {
    const violations: BoundaryViolation[] = [];

    // v2.3.1: Known non-visual components to exclude
    const NON_VISUAL_COMPONENTS = ['StatusBar', 'LinearGradient'];

    for (const container of graph.getContainerNodes()) {
      if (container.isSlot) continue;
      if (container.children.length === 0) continue;

      // v2.3.1: Find the last VISIBLE child (skip absolute + non-visual)
      const visibleChildren = container.children.filter(
        (c) => c.layout.position !== 'absolute' && !NON_VISUAL_COMPONENTS.includes(c.componentName)
      );
      if (visibleChildren.length === 0) continue;

      const lastChild = visibleChildren[visibleChildren.length - 1];

      // Check if last child has any form of bottom margin
      const marginProps: Array<{ prop: string; value: number }> = [];
      if (lastChild.spacing.marginBottom !== undefined) {
        marginProps.push({ prop: 'marginBottom', value: lastChild.spacing.marginBottom });
      }
      if (lastChild.spacing.marginVertical !== undefined) {
        marginProps.push({ prop: 'marginVertical', value: lastChild.spacing.marginVertical });
      }
      if (lastChild.spacing.margin !== undefined) {
        marginProps.push({ prop: 'margin', value: lastChild.spacing.margin });
      }

      if (marginProps.length > 0) {
        // Pick the most specific margin property
        const primary = marginProps[0];
        violations.push({
          container,
          lastChild,
          marginProperty: primary.prop,
          marginValue: primary.value,
          severity: 'medium',
          description: `Boundary Rule: Last child <${lastChild.componentName}> of container <${container.componentName}> (line ${container.lineNumber}) has ${primary.prop}: ${primary.value}. The last child should have zero bottom margin — rely on container paddingBottom for the screen edge.`,
          suggestion: `Remove ${primary.prop} from <${lastChild.componentName}> and ensure container <${container.componentName}> has appropriate paddingBottom instead.`,
        });
      }
    }

    return violations;
  }

  // ═══════════════════════════════════════════════════════════════
  // v2.3.0: Terminal Padding Violations
  // ═══════════════════════════════════════════════════════════════

  /**
   * v2.3.0 "Terminal Padding Auditor": Find containers where the last child
   * defines its own paddingBottom or marginBottom while the container already
   * has a gap or padding. This creates "Ghost Margin" layout pollution —
   * redundant boundary spacing that should be handled by the container alone.
   *
   * The key insight: if a container has gap or padding, the last child's
   * bottom spacing is redundant — the container's own padding/gap already
   * provides the necessary boundary spacing.
   *
   * @param graph - The layout graph
   * @returns Terminal padding violations
   */
  findTerminalPaddingViolations(graph: SemanticLayoutGraph): TerminalPaddingViolation[] {
    const violations: TerminalPaddingViolation[] = [];

    // v2.3.1: Known non-visual components to exclude
    const NON_VISUAL_COMPONENTS = ['StatusBar', 'LinearGradient'];

    for (const container of graph.getContainerNodes()) {
      if (container.isSlot) continue;
      if (container.children.length === 0) continue;

      // Container must have gap or padding for terminal padding to be redundant
      const hasContainerSpacing =
        container.spacing.gap !== undefined ||
        container.spacing.padding !== undefined ||
        container.spacing.paddingVertical !== undefined ||
        container.spacing.paddingBottom !== undefined;

      if (!hasContainerSpacing) continue;

      // v2.3.1: Find the last VISIBLE child (skip absolute + non-visual)
      const visibleChildren = container.children.filter(
        (c) => c.layout.position !== 'absolute' && !NON_VISUAL_COMPONENTS.includes(c.componentName)
      );
      if (visibleChildren.length === 0) continue;

      const lastChild = visibleChildren[visibleChildren.length - 1];

      // Check if last child has any form of bottom padding or margin
      const terminalProps: Array<{ prop: string; value: number }> = [];

      // Check paddingBottom
      if (lastChild.spacing.paddingBottom !== undefined) {
        terminalProps.push({ prop: 'paddingBottom', value: lastChild.spacing.paddingBottom });
      }
      if (lastChild.spacing.paddingVertical !== undefined) {
        terminalProps.push({ prop: 'paddingVertical', value: lastChild.spacing.paddingVertical });
      }
      if (lastChild.spacing.padding !== undefined) {
        terminalProps.push({ prop: 'padding', value: lastChild.spacing.padding });
      }

      // Also check marginBottom (complementary to BoundaryRule which only checks margin)
      if (lastChild.spacing.marginBottom !== undefined) {
        terminalProps.push({ prop: 'marginBottom', value: lastChild.spacing.marginBottom });
      }
      if (lastChild.spacing.marginVertical !== undefined) {
        terminalProps.push({ prop: 'marginVertical', value: lastChild.spacing.marginVertical });
      }
      if (lastChild.spacing.margin !== undefined) {
        terminalProps.push({ prop: 'margin', value: lastChild.spacing.margin });
      }

      if (terminalProps.length > 0) {
        // Pick the most specific property
        const primary = terminalProps[0];
        violations.push({
          container,
          child: lastChild,
          property: primary.prop,
          value: primary.value,
          severity: 'medium',
          description: `Terminal Padding: Last child <${lastChild.componentName}> of container <${container.componentName}> (line ${container.lineNumber}) has ${primary.prop}: ${primary.value} but the container already has spacing (gap/padding). This creates redundant "Ghost Margin" boundary spacing.`,
          suggestion: `Remove ${primary.prop}: ${primary.value} from <${lastChild.componentName}>. The container <${container.componentName}> already handles boundary spacing via its own gap/padding.`,
        });
      }
    }

    return violations;
  }

  // ═══════════════════════════════════════════════════════════════
  // v1.1.0: Semantic Proximity (legacy — kept for backward compat)
  // ═══════════════════════════════════════════════════════════════

  /**
   * v1.1.0 "Semantic Proximity Auditor": Find sibling custom components
   * that share a common name prefix but are not wrapped in a shared container.
   */
  findProximityIssues(graph: SemanticLayoutGraph): ProximityIssue[] {
    const issues: ProximityIssue[] = [];

    for (const container of graph.getContainerNodes()) {
      if (container.isSlot) continue;

      const customChildren = container.children.filter((c) => c.isCustomComponent && !c.isSlot);
      if (customChildren.length < 2) continue;

      const namePairs: Array<{ a: LayoutNode; b: LayoutNode; prefix: string }> = [];

      for (let i = 0; i < customChildren.length - 1; i++) {
        const a = customChildren[i];
        const b = customChildren[i + 1];
        const prefix = this.longestCommonPrefix(a.componentName, b.componentName);

        if (prefix.length >= 3) {
          namePairs.push({ a, b, prefix });
        }
      }

      const groups = this.groupConsecutiveByPrefix(namePairs);

      for (const group of groups) {
        if (group.length >= 2) {
          const prefix = group[0].prefix;
          const siblings = group.map((p) => p.a).concat(group[group.length - 1].b);
          const uniqueSiblings = siblings.filter(
            (s, idx, arr) => arr.findIndex((x) => x.id === s.id) === idx
          );

          if (uniqueSiblings.length >= 2) {
            const siblingNames = uniqueSiblings.map((s) => s.componentName).join(', ');
            issues.push({
              container,
              siblings: uniqueSiblings,
              sharedPrefix: prefix,
              severity: uniqueSiblings.length >= 3 ? 'medium' : 'low',
              description: `Container "${container.componentName}" (line ${container.lineNumber}) has ${uniqueSiblings.length} semantically related siblings sharing the "${prefix}" prefix: ${siblingNames}. These should be wrapped in a shared container for cognitive grouping.`,
              suggestion: `Wrap ${siblingNames} in a <View> or <Section> container with a semantic name (e.g., "${prefix}Section") to improve visual grouping and layout orchestration.`,
            });
          }
        }
      }
    }

    return issues;
  }

  // ═══════════════════════════════════════════════════════════════
  // v2.1.0: Grouping Specialist — Run-Length Cluster Encoding
  // ═══════════════════════════════════════════════════════════════

  /**
   * v2.1.0 "Run-Length Cluster Encoding": Find consecutive siblings with high
   * proximity scores and detect sub-clusters within the run.
   *
   * Replaces the v2.0.0 fixed Rule of Three window with a run-length encoding
   * approach that:
   *   1. Finds the longest consecutive run of siblings with proximity score > 6
   *   2. Detects sub-clusters within the run using name-prefix matching
   *   3. Emits grouping suggestions per sub-cluster
   *
   * Trigger: 3+ consecutive siblings with average score > 6.
   * Suggestion: Wrap in a <Section> or <View> with gap: 8.
   * Constraint: Blocked if margin pollution detected on those children.
   *
   * @param graph - The layout graph
   * @param pollutedContainers - Set of container IDs that have margin pollution
   *   (from FoundationCheck). These are excluded from suggestions.
   */
  findGroupingSuggestions(
    graph: SemanticLayoutGraph,
    pollutedContainers?: Set<string>
  ): GroupingSuggestion[] {
    const suggestions: GroupingSuggestion[] = [];

    for (const container of graph.getContainerNodes()) {
      if (container.isSlot) continue;

      // Skip if container is polluted (margin pollution blocks grouping)
      if (pollutedContainers?.has(container.id)) continue;

      const customChildren = container.children.filter((c) => c.isCustomComponent && !c.isSlot);
      if (customChildren.length < 3) continue;

      // ── Step 1: Compute proximity scores for all consecutive pairs ──
      const pairScores: number[] = [];
      for (let i = 0; i < customChildren.length - 1; i++) {
        const score = this.scorer.computeScore(customChildren[i], customChildren[i + 1], graph);
        pairScores.push(score.total);
      }

      // ── Step 2: Find the longest run where every pair has score > 6 ──
      let runStart = -1;
      let runLength = 0;
      let bestRunStart = -1;
      let bestRunLength = 0;

      for (let i = 0; i < pairScores.length; i++) {
        if (pairScores[i] > 6) {
          if (runStart === -1) {
            runStart = i;
            runLength = 1;
          } else {
            runLength++;
          }

          // A run of N pairs means N+1 siblings
          if (runLength + 1 > bestRunLength) {
            bestRunStart = runStart;
            bestRunLength = runLength + 1; // convert pairs to sibling count
          }
        } else {
          runStart = -1;
          runLength = 0;
        }
      }

      // Need at least 3 siblings for a grouping suggestion
      if (bestRunLength < 3) continue;

      // ── Step 3: Extract the run's siblings ──
      const runSiblings = customChildren.slice(bestRunStart, bestRunStart + bestRunLength);

      // ── Step 4: Detect sub-clusters within the run using name-prefix matching ──
      const subClusters = this.detectSubClusters(runSiblings);

      // ── Step 5: Emit suggestions per sub-cluster ──
      for (const cluster of subClusters) {
        if (cluster.length < 2) continue;

        // Check if any of these children have margin pollution
        const hasPollution = cluster.some(
          (child) =>
            child.spacing.margin !== undefined ||
            child.spacing.marginBottom !== undefined ||
            child.spacing.marginTop !== undefined ||
            child.spacing.marginVertical !== undefined
        );

        if (hasPollution) continue;

        // Compute average score across the cluster
        let totalScore = 0;
        let pairCount = 0;
        for (let i = 0; i < cluster.length - 1; i++) {
          const idx = customChildren.indexOf(cluster[i]);
          if (idx >= 0 && idx < pairScores.length) {
            totalScore += pairScores[idx];
            pairCount++;
          }
        }
        const avgScore = pairCount > 0 ? totalScore / pairCount : 0;

        const siblingNames = cluster.map((s) => s.componentName).join(', ');
        suggestions.push({
          container,
          siblings: cluster,
          averageScore: Math.round(avgScore * 10) / 10,
          severity: cluster.length >= 3 ? 'medium' : 'low',
          description: `Semantic Cluster Detected: ${siblingNames} have average Proximity Score ${avgScore.toFixed(1)} but no shared parent wrapper.`,
          suggestion: `Wrap these ${cluster.length} elements in a <View> or <Section> container with gap: 8 to create a cohesive semantic group. Name suggestion: "${cluster[0].componentName}Section".`,
        });
      }
    }

    // ── Step 6: v2.2.0 — Functional Role Clustering ──────────────
    // Detect containers where siblings can be grouped by their functional
    // role (Input, Button, Link, Text, etc.) even when name prefixes don't match.
    // This catches the "FormInput + TouchableOpacity" pattern where generic
    // component names have low lexical similarity but clear functional roles.
    const functionalClusters = this.findFunctionalClusters(graph, pollutedContainers);
    suggestions.push(...functionalClusters);

    return suggestions;
  }

  /**
   * v2.2.0 "Functional Role Clustering": Group siblings by their semantic
   * functional role (e.g., Input-type, Action-type, Text-type) rather than
   * by name prefix similarity.
   *
   * This catches patterns like:
   *   <FormInput /> <FormInput /> <TouchableOpacity /> <TouchableOpacity />
   * where the first two are "input" role and the last two are "action" role,
   * suggesting they should be in separate sections.
   *
   * @param graph - The layout graph
   * @param pollutedContainers - Set of container IDs that have margin pollution
   * @returns Grouping suggestions for functional role clusters
   */
  private findFunctionalClusters(
    graph: SemanticLayoutGraph,
    pollutedContainers?: Set<string>
  ): GroupingSuggestion[] {
    const suggestions: GroupingSuggestion[] = [];

    for (const container of graph.getContainerNodes()) {
      if (container.isSlot) continue;
      if (pollutedContainers?.has(container.id)) continue;

      const customChildren = container.children.filter((c) => c.isCustomComponent && !c.isSlot);
      if (customChildren.length < 3) continue;

      // Assign a functional role to each child
      const roles = customChildren.map((child) => this.inferFunctionalRole(child));

      // Find consecutive runs of the same role (run-length encoding on roles)
      let roleRunStart = 0;
      for (let i = 1; i <= roles.length; i++) {
        if (i === roles.length || roles[i] !== roles[roleRunStart]) {
          const runLength = i - roleRunStart;

          // A run of 2+ same-role siblings is a potential cluster
          if (runLength >= 2) {
            const cluster = customChildren.slice(roleRunStart, i);

            // Check if any of these children have margin pollution
            const hasPollution = cluster.some(
              (child) =>
                child.spacing.margin !== undefined ||
                child.spacing.marginBottom !== undefined ||
                child.spacing.marginTop !== undefined ||
                child.spacing.marginVertical !== undefined
            );
            if (hasPollution) continue;

            // Only suggest if this cluster is NOT already covered by
            // the existing run-length encoding (i.e., the cluster's
            // average proximity score is low — meaning name-based
            // detection missed it)
            let totalScore = 0;
            let pairCount = 0;
            for (let j = 0; j < cluster.length - 1; j++) {
              const idx = customChildren.indexOf(cluster[j]);
              if (idx >= 0) {
                const score = this.scorer.computeScore(cluster[j], cluster[j + 1], graph);
                totalScore += score.total;
                pairCount++;
              }
            }
            const avgScore = pairCount > 0 ? totalScore / pairCount : 0;

            // Only emit if the proximity score is low (≤ 6) — meaning
            // the name-based run-length encoding missed this cluster
            if (avgScore > 6) continue;

            const roleLabel = roles[roleRunStart] || 'related';
            const siblingNames = cluster.map((s) => s.componentName).join(', ');
            suggestions.push({
              container,
              siblings: cluster,
              averageScore: Math.round(avgScore * 10) / 10,
              severity: cluster.length >= 3 ? 'medium' : 'low',
              description: `Functional Role Cluster Detected: ${cluster.length} ${roleLabel} components (${siblingNames}) form a consecutive group but lack a shared parent wrapper.`,
              suggestion: `Wrap these ${cluster.length} ${roleLabel} components in a <View> or <Section> container with gap: 8 to create a cohesive functional group. Name suggestion: "${roleLabel}Section".`,
            });
          }

          roleRunStart = i;
        }
      }
    }

    return suggestions;
  }

  /**
   * v2.2.0: Infer the functional role of a component based on its name.
   *
   * Role categories:
   *   - "input": FormInput, TextInput, Input, TextField, SearchBar, Picker, Select, Dropdown, Checkbox, Radio, Switch, Slider
   *   - "action": Button, TouchableOpacity, TouchableHighlight, Pressable, Link, IconButton, Fab, ActionButton
   *   - "text": Text, Label, Title, Heading, Paragraph, Caption, Subtitle, Description, ErrorText, HelperText
   *   - "image": Image, Avatar, Icon, Photo, Thumbnail, Illustration
   *   - "card": Card, Tile, Block, Panel, Section, Container, Box
   *   - "list": List, FlatList, SectionList, ScrollView, Table, Row, Cell, Item
   *   - "divider": Divider, Separator, HR, Spacer
   *   - "other": fallback
   */
  private inferFunctionalRole(node: LayoutNode): string {
    const name = node.componentName;

    // Input-type components
    const inputPatterns = ['Input', 'TextField', 'SearchBar', 'Picker', 'Select', 'Dropdown', 'Checkbox', 'Radio', 'Switch', 'Slider', 'FormInput', 'TextArea'];
    for (const pattern of inputPatterns) {
      if (name.includes(pattern)) return 'input';
    }

    // Action-type components
    const actionPatterns = ['Button', 'TouchableOpacity', 'TouchableHighlight', 'Pressable', 'Link', 'IconButton', 'Fab', 'ActionButton', 'SubmitBtn', 'LoginBtn'];
    for (const pattern of actionPatterns) {
      if (name.includes(pattern)) return 'action';
    }

    // Text-type components
    const textPatterns = ['Text', 'Label', 'Title', 'Heading', 'Paragraph', 'Caption', 'Subtitle', 'Description', 'ErrorText', 'HelperText', 'Header', 'Footer'];
    for (const pattern of textPatterns) {
      if (name.includes(pattern)) return 'text';
    }

    // Image-type components
    const imagePatterns = ['Image', 'Avatar', 'Icon', 'Photo', 'Thumbnail', 'Illustration', 'Svg'];
    for (const pattern of imagePatterns) {
      if (name.includes(pattern)) return 'image';
    }

    // Card-type components
    const cardPatterns = ['Card', 'Tile', 'Block', 'Panel', 'Section', 'Container', 'Box', 'Wrapper'];
    for (const pattern of cardPatterns) {
      if (name.includes(pattern)) return 'card';
    }

    // List-type components
    const listPatterns = ['List', 'FlatList', 'SectionList', 'ScrollView', 'Table', 'Row', 'Cell', 'Item'];
    for (const pattern of listPatterns) {
      if (name.includes(pattern)) return 'list';
    }

    // Divider-type components
    const dividerPatterns = ['Divider', 'Separator', 'HR', 'Spacer'];
    for (const pattern of dividerPatterns) {
      if (name.includes(pattern)) return 'divider';
    }

    return 'other';
  }
  /**
   * v2.1.0: Detect sub-clusters within a run of semantically related siblings.
   *
   * Uses name-prefix matching to identify natural groupings:
   * - Siblings sharing a common prefix >= 3 chars form a sub-cluster
   * - Consecutive siblings with the same component name form a sub-cluster
   * - Fallback: the entire run is one cluster
   */
  private detectSubClusters(siblings: LayoutNode[]): LayoutNode[][] {
    if (siblings.length === 0) return [];

    const clusters: LayoutNode[][] = [];
    let currentCluster: LayoutNode[] = [siblings[0]];

    for (let i = 1; i < siblings.length; i++) {
      const prev = siblings[i - 1];
      const curr = siblings[i];

      // Check if they share a common prefix >= 3 chars
      const prefix = this.longestCommonPrefix(prev.componentName, curr.componentName);
      const sameName = prev.componentName === curr.componentName;

      if (sameName || prefix.length >= 3) {
        // Same sub-cluster — extend
        currentCluster.push(curr);
      } else {
        // Different sub-cluster — start new
        clusters.push(currentCluster);
        currentCluster = [curr];
      }
    }

    // Don't forget the last cluster
    clusters.push(currentCluster);

    return clusters;
  }

  // ─── Helpers ─────────────────────────────────────────────────

  /**
   * Find the longest common prefix between two strings.
   */
  private longestCommonPrefix(a: string, b: string): string {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) {
      i++;
    }
    return a.substring(0, i);
  }

  /**
   * Group consecutive prefix pairs into clusters.
   */
  private groupConsecutiveByPrefix(
    pairs: Array<{ a: LayoutNode; b: LayoutNode; prefix: string }>
  ): Array<Array<{ a: LayoutNode; b: LayoutNode; prefix: string }>> {
    const groups: Array<Array<{ a: LayoutNode; b: LayoutNode; prefix: string }>> = [];

    let currentGroup: Array<{ a: LayoutNode; b: LayoutNode; prefix: string }> = [];

    for (const pair of pairs) {
      if (currentGroup.length === 0) {
        currentGroup.push(pair);
      } else {
        const lastPair = currentGroup[currentGroup.length - 1];
        if (lastPair.prefix === pair.prefix && lastPair.b.id === pair.a.id) {
          currentGroup.push(pair);
        } else {
          groups.push(currentGroup);
          currentGroup = [pair];
        }
      }
    }

    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }

    return groups;
  }
}
