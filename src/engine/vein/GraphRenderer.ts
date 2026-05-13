// ============================================================
// GraphRenderer.ts — ASCII tree rendering for the Semantic
// Layout Graph. Produces human-readable component tree output
// with spacing, layout, pollution, and slot annotations.
//
// v1.0.0 "Refactored Vein" — Extracted from SemanticLayoutGraph.ts
// ============================================================

import type { LayoutNode } from './types.js';
import type { SemanticLayoutGraph } from './SemanticLayoutGraph.js';

// ─── Renderer ─────────────────────────────────────────────────

export class GraphRenderer {
  /**
   * Render the graph as an ASCII tree.
   */
  renderAscii(graph: SemanticLayoutGraph): string {
    const root = graph.getRoot();
    if (!root) return '(empty graph)';

    const lines: string[] = [];
    this.renderNode(root, 0, lines, true);
    return lines.join('\n');
  }

  private renderNode(node: LayoutNode, depth: number, lines: string[], isLast: boolean): void {
    const indent = depth > 0 ? '  '.repeat(depth - 1) + (isLast ? '└─ ' : '├─ ') : '';
    const spacingInfo = this.formatSpacing(node);
    const layoutInfo = this.formatLayout(node);
    const pollution = node.pollutionScore > 0 ? ` ⚠️ pollution=${node.pollutionScore}` : '';
    const listMarker = node.isListItem ? ' 📋' : '';
    const slotMarker = node.isSlot ? ' 🔄' : '';

    lines.push(
      `${indent}<${node.tagName}>${spacingInfo}${layoutInfo}${pollution}${listMarker}${slotMarker} [line ${node.lineNumber}]`
    );

    for (let i = 0; i < node.children.length; i++) {
      this.renderNode(node.children[i], depth + 1, lines, i === node.children.length - 1);
    }
  }

  private formatSpacing(node: LayoutNode): string {
    const parts: string[] = [];
    if (node.spacing.margin !== undefined) parts.push(`m:${node.spacing.margin}`);
    if (node.spacing.marginTop !== undefined) parts.push(`mt:${node.spacing.marginTop}`);
    if (node.spacing.marginBottom !== undefined) parts.push(`mb:${node.spacing.marginBottom}`);
    if (node.spacing.padding !== undefined) parts.push(`p:${node.spacing.padding}`);
    if (node.spacing.gap !== undefined) parts.push(`gap:${node.spacing.gap}`);
    return parts.length > 0 ? ` [${parts.join(', ')}]` : '';
  }

  private formatLayout(node: LayoutNode): string {
    const parts: string[] = [];
    if (node.layout.flexDirection) parts.push(`dir:${node.layout.flexDirection}`);
    if (node.layout.position === 'absolute') parts.push('absolute');
    if (node.layout.flex !== undefined) parts.push(`flex:${node.layout.flex}`);
    return parts.length > 0 ? ` (${parts.join(', ')})` : '';
  }
}
