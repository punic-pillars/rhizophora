// ============================================================
// SemanticLayoutGraph.ts — Pure graph data structure for the
// component tree with spacing token annotations.
//
// Each node is a component instance with its layout properties
// (margins, padding, gap, flexDirection). Edges represent
// parent-child relationships.
//
// v1.0.0 "Refactored Vein" — Simplified to pure data structure.
//   Analysis logic → GraphAnalyzer
//   ASCII rendering → GraphRenderer
//   Types → types.ts
// ============================================================

import type { LayoutNode, SpacingTokens, LayoutProperties, TokenDeviation } from './types.js';

// ─── Graph ────────────────────────────────────────────────────

export class SemanticLayoutGraph {
  private nodes: Map<string, LayoutNode> = new Map();
  private rootId: string | null = null;
  private nextId: number = 0;

  /**
   * Create a new node and add it to the graph.
   */
  createNode(params: {
    componentName: string;
    tagName: string;
    filePath: string;
    lineNumber: number;
    spacing?: SpacingTokens;
    layout?: LayoutProperties;
    isPrimitive?: boolean;
    isCustomComponent?: boolean;
    hasOnLayout?: boolean;
    isListItem?: boolean;
  }): string {
    const id = `node_${this.nextId++}`;
    const node: LayoutNode = {
      id,
      componentName: params.componentName,
      tagName: params.tagName,
      filePath: params.filePath,
      lineNumber: params.lineNumber,
      spacing: params.spacing || {},
      layout: params.layout || {},
      isPrimitive: params.isPrimitive ?? false,
      isCustomComponent: params.isCustomComponent ?? false,
      children: [],
      parentId: null,
      hasOnLayout: params.hasOnLayout ?? false,
      isListItem: params.isListItem ?? false,
      pollutionScore: 0,
      tokenDeviations: [],
      isSlot: false,
      contextCalls: [],
    };
    this.nodes.set(id, node);
    if (!this.rootId) this.rootId = id;
    return id;
  }

  /**
   * Add a child node to a parent.
   */
  addChild(parentId: string, childId: string): void {
    const parent = this.nodes.get(parentId);
    const child = this.nodes.get(childId);
    if (!parent || !child) return;
    parent.children.push(child);
    child.parentId = parentId;
  }

  /**
   * Get a node by ID.
   */
  getNode(id: string): LayoutNode | undefined {
    return this.nodes.get(id);
  }

  /**
   * Get the root node.
   */
  getRoot(): LayoutNode | undefined {
    return this.rootId ? this.nodes.get(this.rootId) : undefined;
  }

  /**
   * Get all nodes.
   */
  getAllNodes(): LayoutNode[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Get all leaf nodes (no children).
   */
  getLeafNodes(): LayoutNode[] {
    return this.getAllNodes().filter((n) => n.children.length === 0);
  }

  /**
   * Get all container nodes (have children).
   */
  getContainerNodes(): LayoutNode[] {
    return this.getAllNodes().filter((n) => n.children.length > 0);
  }

  /**
   * Get all nodes with a specific component name.
   */
  getNodesByComponent(name: string): LayoutNode[] {
    return this.getAllNodes().filter((n) => n.componentName === name);
  }

  /**
   * Get the depth of a node from root.
   */
  getDepth(nodeId: string): number {
    let depth = 0;
    let current = this.nodes.get(nodeId);
    while (current?.parentId) {
      depth++;
      current = this.nodes.get(current.parentId);
    }
    return depth;
  }

  /**
   * Mark a node as a slot (transparent container).
   * Slot components render {props.children} and should be treated
   * as transparent in the layout graph.
   */
  setSlot(nodeId: string): void {
    const node = this.nodes.get(nodeId);
    if (node) {
      node.isSlot = true;
    }
  }

  /**
   * Add a context call to a node.
   */
  addContextCall(nodeId: string, contextName: string): void {
    const node = this.nodes.get(nodeId);
    if (node && !node.contextCalls.includes(contextName)) {
      node.contextCalls.push(contextName);
    }
  }
}
