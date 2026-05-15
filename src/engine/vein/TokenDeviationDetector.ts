// ============================================================
// TokenDeviationDetector.ts — Standalone design token validation.
// Checks all spacing values in the graph against a whitelist of
// allowed design token values.
//
// v1.0.0 "Refactored Vein" — Extracted from HeuristicInferenceEngine.ts
// ============================================================

import type { TokenDeviation } from './types.js';
import type { SemanticLayoutGraph } from './SemanticLayoutGraph.js';

// ─── Detector ─────────────────────────────────────────────────

export const DEFAULT_DESIGN_TOKENS = [4, 8, 12, 16, 24, 32];

export class TokenDeviationDetector {
  private designTokens: number[];

  constructor(designTokens: number[] = DEFAULT_DESIGN_TOKENS) {
    this.designTokens = designTokens;
  }

  /**
   * Detect spacing and dimension values that are not in the design token whitelist.
   * v2.4.0: Now also checks width, height, minWidth, minHeight, maxWidth, maxHeight
   * against the design token whitelist. These live on node.layout, not node.spacing.
   */
  detect(graph: SemanticLayoutGraph): TokenDeviation[] {
    const deviations: TokenDeviation[] = [];

    if (this.designTokens.length === 0) return deviations;

    for (const node of graph.getAllNodes()) {
      const spacing = node.spacing;
      const layout = node.layout;

      const checkValue = (property: string, value: number | undefined) => {
        if (value === undefined) return;
        if (!this.designTokens.includes(value)) {
          deviations.push({
            property: `${node.componentName}.${property}`,
            value,
            suggestion: `Replace ${property}: ${value} with a design token: ${this.designTokens.join(', ')}.`,
          });
        }
      };

      // Spacing properties
      checkValue('margin', spacing.margin);
      checkValue('marginTop', spacing.marginTop);
      checkValue('marginBottom', spacing.marginBottom);
      checkValue('marginLeft', spacing.marginLeft);
      checkValue('marginRight', spacing.marginRight);
      checkValue('marginVertical', spacing.marginVertical);
      checkValue('marginHorizontal', spacing.marginHorizontal);
      checkValue('padding', spacing.padding);
      checkValue('paddingTop', spacing.paddingTop);
      checkValue('paddingBottom', spacing.paddingBottom);
      checkValue('paddingVertical', spacing.paddingVertical);
      checkValue('paddingHorizontal', spacing.paddingHorizontal);
      checkValue('gap', spacing.gap);

      // v2.4.0: Dimension properties — only check numeric values
      if (typeof layout.width === 'number') checkValue('width', layout.width);
      if (typeof layout.height === 'number') checkValue('height', layout.height);
      if (typeof layout.minWidth === 'number') checkValue('minWidth', layout.minWidth);
      if (typeof layout.minHeight === 'number') checkValue('minHeight', layout.minHeight);
      if (typeof layout.maxWidth === 'number') checkValue('maxWidth', layout.maxWidth);
      if (typeof layout.maxHeight === 'number') checkValue('maxHeight', layout.maxHeight);
    }

    return deviations;
  }
}
