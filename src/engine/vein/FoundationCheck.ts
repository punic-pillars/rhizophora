// ============================================================
// FoundationCheck.ts — Pure decorator that checks for downstream
// layout pollution before allowing semantic/rhythm analysis.
//
// The "Foundation Check" ensures a clean spacing architecture
// exists before suggesting semantic grouping or rhythm scaling.
// If children use hardcoded margins instead of parent-controlled
// gaps, the branch is considered "polluted" and semantic/rhythm
// analysis is suppressed with a HIGH severity blocker message.
//
// This is a pure predicate — it queries existing LayoutNode
// spacing data and requires zero changes to ASTParser or
// GraphAnalyzer.
//
// v1.1.0 "Visual Semantic Orchestration"
// v2.2.0 "Ghost Margin Detection" — Added hasCumulativePaddingBoundary()
//   to detect last-child paddingBottom that overlaps with parent
//   paddingBottom, creating redundant boundary spacing.
// ============================================================

import type { LayoutNode } from './types.js';

/**
 * Check if a container node has downstream margin pollution.
 *
 * A container is "polluted" if:
 *   1. It does NOT use `gap` for inter-child spacing
 *   2. Its children use hardcoded margins (marginBottom, marginTop,
 *      marginVertical, margin, marginLeft, marginRight, marginHorizontal)
 *
 * When polluted, semantic grouping or rhythm scaling suggestions
 * would only encapsulate bad patterns — the margins should be
 * removed and replaced with parent-controlled gap first.
 *
 * @param container - The container node to check
 * @returns true if the container has downstream margin pollution
 */
export function hasChildMarginPollution(container: LayoutNode): boolean {
  // If parent already uses gap, spacing architecture is clean
  if (container.spacing.gap !== undefined) return false;

  // Check if ANY child uses hardcoded margins
  return container.children.some(
    (child) =>
      child.spacing.margin !== undefined ||
      child.spacing.marginBottom !== undefined ||
      child.spacing.marginTop !== undefined ||
      child.spacing.marginVertical !== undefined ||
      child.spacing.marginHorizontal !== undefined ||
      child.spacing.marginLeft !== undefined ||
      child.spacing.marginRight !== undefined
  );
}

/**
 * v2.2.0: Check if a container has cumulative boundary padding
 * ("Ghost Margin").
 *
 * A "ghost margin" occurs when the last child of a container has
 * paddingBottom that overlaps with the parent container's own
 * paddingBottom. This creates redundant boundary spacing that
 * makes the screen edge appear inconsistent.
 *
 * Example:
 *   <View style={{ paddingBottom: 16 }}>   ← parent padding
 *     <View style={{ paddingBottom: 16 }}>  ← last child padding
 *       ...content...
 *     </View>
 *   </View>
 *   → Total bottom spacing = 32px (redundant)
 *
 * @param container - The container node to check
 * @returns An object describing the ghost margin, or null if clean
 */
export interface GhostMarginResult {
  container: LayoutNode;
  lastChild: LayoutNode;
  parentPaddingBottom: number;
  childPaddingBottom: number;
  totalCumulative: number;
}

/**
 * v2.2.0: Detect cumulative boundary padding between a container
 * and its last child.
 *
 * @param container - The container node to check
 * @returns A GhostMarginResult if cumulative padding detected, null otherwise
 */
export function hasCumulativePaddingBoundary(container: LayoutNode): GhostMarginResult | null {
  if (container.children.length === 0) return null;

  const lastChild = container.children[container.children.length - 1];

  // Get parent's bottom padding
  const parentPaddingBottom =
    container.spacing.paddingBottom ??
    container.spacing.paddingVertical ??
    container.spacing.padding;

  // Get last child's bottom padding
  const childPaddingBottom =
    lastChild.spacing.paddingBottom ??
    lastChild.spacing.paddingVertical ??
    lastChild.spacing.padding;

  // Both must have explicit padding values
  if (parentPaddingBottom === undefined || childPaddingBottom === undefined) return null;

  // Both must be > 0
  if (parentPaddingBottom <= 0 || childPaddingBottom <= 0) return null;

  // Flag if both have padding — this creates cumulative boundary spacing
  return {
    container,
    lastChild,
    parentPaddingBottom,
    childPaddingBottom,
    totalCumulative: parentPaddingBottom + childPaddingBottom,
  };
}

/**
 * Generate a HIGH severity blocker message for a polluted container.
 *
 * @param componentName - The name of the polluted container
 * @returns Formatted blocker message string
 */
export function formatFoundationBlocker(componentName: string): string {
  return (
    `[BLOCKED] Layout Pollution: Cannot suggest semantic grouping or rhythm scaling for \`${componentName}\`.\n` +
    `   Reason: Immediate children are using hardcoded margins instead of parent-controlled gaps.\n` +
    `   Action: Run detect_boundary_gaps and fix spacing architecture before performing semantic optimization.`
  );
}
