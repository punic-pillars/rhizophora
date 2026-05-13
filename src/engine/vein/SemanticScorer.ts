// ============================================================
// SemanticScorer.ts — The Semantic Scoring Engine (Pillar 1)
// Assigns a Proximity Score (0-10) to every sibling pair based
// on three weighted variables:
//   1. Lexical Similarity (40%) — component name / label fragments
//   2. Prop DNA (30%) — shared primary data props
//   3. Visual Category (30%) — same component type
//
// v2.0.0 "Visual Semantic Orchestration"
// ============================================================

import type { LayoutNode } from './types.js';
import type { SemanticLayoutGraph } from './SemanticLayoutGraph.js';

// ─── Score Result ─────────────────────────────────────────────

export interface SemanticScore {
  /** Overall proximity score 0-10 */
  total: number;
  /** Lexical similarity contribution (0-4) */
  lexical: number;
  /** Prop DNA contribution (0-3) */
  propDna: number;
  /** Visual category contribution (0-3) */
  visualCategory: number;
  /** Human-readable breakdown */
  breakdown: string[];
}

// ─── Scorer ───────────────────────────────────────────────────

export class SemanticScorer {
  /**
   * Compute the proximity score between two sibling nodes.
   *
   * @param a - First sibling node
   * @param b - Second sibling node
   * @param graph - The full layout graph (for context like parent container)
   * @returns A SemanticScore with breakdown
   */
  computeScore(a: LayoutNode, b: LayoutNode, _graph?: SemanticLayoutGraph): SemanticScore {
    const breakdown: string[] = [];

    // ── 1. Lexical Similarity (40% → 0-4 points) ──────────────
    const lexical = this.computeLexicalScore(a, b);
    if (lexical > 0) {
      breakdown.push(`Lexical: +${lexical.toFixed(1)} (name fragments match)`);
    }

    // ── 2. Prop DNA (30% → 0-3 points) ────────────────────────
    const propDna = this.computePropDnaScore(a, b);
    if (propDna > 0) {
      breakdown.push(`Prop DNA: +${propDna.toFixed(1)} (shared data props)`);
    }

    // ── 3. Visual Category (30% → 0-3 points) ─────────────────
    const visualCategory = this.computeVisualCategoryScore(a, b);
    if (visualCategory > 0) {
      breakdown.push(`Visual Category: +${visualCategory.toFixed(1)} (same component type)`);
    }

    const total = Math.min(10, Math.round((lexical + propDna + visualCategory) * 10) / 10);

    return {
      total,
      lexical,
      propDna,
      visualCategory,
      breakdown,
    };
  }

  /**
   * Lexical Similarity (0-4 points, 40% weight).
   *
   * Scoring:
   *   - Exact name match (same component used twice): +4
   *   - Long common prefix (>= 5 chars): +3
   *   - Medium common prefix (3-4 chars): +2
   *   - Short common prefix (2 chars): +1
   *   - No match: 0
   *
   * Also checks `label` prop if present in the node's context calls
   * or inferred from component name patterns.
   */
  private computeLexicalScore(a: LayoutNode, b: LayoutNode): number {
    const nameA = a.componentName;
    const nameB = b.componentName;

    // Exact match — same component used twice
    if (nameA === nameB) return 4;

    // Longest common prefix
    const prefix = this.longestCommonPrefix(nameA, nameB);

    if (prefix.length >= 5) return 3;
    if (prefix.length >= 3) return 2;
    if (prefix.length >= 2) return 1;

    // Fallback: check for shared word fragments (camelCase boundaries)
    // e.g., "StationInfo" and "StationAddress" share "Station"
    const wordsA = this.splitCamelCase(nameA);
    const wordsB = this.splitCamelCase(nameB);
    const sharedWords = wordsA.filter((w) => wordsB.includes(w) && w.length >= 3);

    if (sharedWords.length >= 2) return 3;
    if (sharedWords.length === 1) return 2;

    return 0;
  }

  /**
   * Prop DNA (0-3 points, 30% weight).
   *
   * Checks if siblings receive the same primary data prop.
   * Since we don't have full prop AST at the LayoutNode level,
   * we infer from:
   *   - Shared context calls (e.g., both use `useStation()`)
   *   - Shared naming patterns that imply data binding
   *     (e.g., both names contain "Item", "Card", "Row")
   *
   * Full prop analysis would require AST-level prop inspection
   * which is a future enhancement.
   */
  private computePropDnaScore(a: LayoutNode, b: LayoutNode): number {
    // Check shared context calls — strong indicator of shared data
    const sharedContexts = a.contextCalls.filter((ctx) => b.contextCalls.includes(ctx));
    if (sharedContexts.length >= 2) return 3;
    if (sharedContexts.length === 1) return 2;

    // Check naming patterns that imply data binding
    const dataIndicators = ['Item', 'Card', 'Row', 'Cell', 'Block', 'Tile', 'Badge', 'Chip'];
    const indicatorsA = dataIndicators.filter((ind) => a.componentName.includes(ind));
    const indicatorsB = dataIndicators.filter((ind) => b.componentName.includes(ind));
    const sharedIndicators = indicatorsA.filter((ind) => indicatorsB.includes(ind));

    if (sharedIndicators.length >= 2) return 2;
    if (sharedIndicators.length === 1) return 1;

    return 0;
  }

  /**
   * Visual Category (0-3 points, 30% weight).
   *
   * Checks if siblings are the same component type.
   * - Exact same component name: +3
   * - Same tag name (e.g., both are <ChartCard>): +3
   * - Same base category inferred from name suffix:
   *   e.g., "Header", "Footer", "Content", "Section", "List"
   */
  private computeVisualCategoryScore(a: LayoutNode, b: LayoutNode): number {
    // Exact same component name
    if (a.componentName === b.componentName) return 3;

    // Same tag name
    if (a.tagName === b.tagName) return 3;

    // Same category suffix
    const categorySuffixes = ['Header', 'Footer', 'Content', 'Section', 'List', 'Card', 'Button', 'Input', 'Label', 'Title', 'Text', 'Icon', 'Image', 'Avatar', 'Chip', 'Badge', 'Divider', 'Spacer'];

    const suffixA = categorySuffixes.find((s) => a.componentName.endsWith(s));
    const suffixB = categorySuffixes.find((s) => b.componentName.endsWith(s));

    if (suffixA && suffixB && suffixA === suffixB) return 2;

    // Partial match — both end with some category suffix (different ones)
    if (suffixA && suffixB) return 1;

    return 0;
  }

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
   * Split a camelCase/PascalCase string into words.
   * e.g., "StationAddressInfo" → ["Station", "Address", "Info"]
   */
  private splitCamelCase(name: string): string[] {
    return name
      .replace(/([A-Z])/g, ' $1')
      .trim()
      .split(/\s+/)
      .filter((w) => w.length > 0);
  }
}
