// ============================================================
// VenousPropagator.ts — Pure recursive component tree walker.
// Builds the Semantic Layout Graph by walking JSX trees and
// delegating to specialized modules for style extraction,
// component resolution, and slot detection.
//
// v1.0.0 "Refactored Vein" — Simplified to pure tree walker.
//   Style extraction → StyleExtractor
//   Component resolution → ComponentResolver
//   Slot detection → SlotDetector
//   JSX helpers → JSXHelpers
// ============================================================

import * as path from 'path';
import { parseFile } from './ASTParser.js';
import { extractStyle } from './StyleExtractor.js';
import { detectSlot } from './SlotDetector.js';
import { ComponentResolver } from './ComponentResolver.js';
import {
  getJSXTagName,
  getJSXChildren,
  getOpeningElement,
  hasJSXAttribute,
} from './JSXHelpers.js';
import { SemanticLayoutGraph } from './SemanticLayoutGraph.js';
import { KNOWN_LEAF_PRIMITIVES, RN_ANIMATED_PRIMITIVES } from '../../constants.js';
import type { TSESTree } from '@typescript-eslint/typescript-estree';
import type { ParsedFile, ResolvedComponent } from './types.js';

type JSXElement = TSESTree.JSXElement;
type JSXFragment = TSESTree.JSXFragment;
type JSXOpeningElement = TSESTree.JSXOpeningElement;
type JSXChild = TSESTree.JSXChild;
type JSXExpressionContainer = TSESTree.JSXExpressionContainer;
type CallExpression = TSESTree.CallExpression;
type MemberExpression = TSESTree.MemberExpression;

const RN_PRIMITIVES = KNOWN_LEAF_PRIMITIVES;

// ─── Options ──────────────────────────────────────────────────

export interface PropagationOptions {
  /** Design tokens for validation (e.g., [4, 8, 12, 16, 24, 32]) */
  designTokens?: number[];
  /** Maximum depth to recurse (prevents infinite loops) */
  maxDepth?: number;
  /** Files already visited (prevents circular imports) */
  visitedFiles?: Set<string>;
}

// ─── Propagator ───────────────────────────────────────────────

export class VenousPropagator {
  private graph: SemanticLayoutGraph;
  private options: Required<PropagationOptions>;
  private fileCache: Map<string, ParsedFile>;
  private componentResolver: ComponentResolver;

  constructor(options: PropagationOptions = {}) {
    this.graph = new SemanticLayoutGraph();
    this.fileCache = new Map();
    this.componentResolver = new ComponentResolver(this.fileCache);
    this.options = {
      designTokens: options.designTokens ?? [],
      maxDepth: options.maxDepth ?? 10,
      visitedFiles: options.visitedFiles ?? new Set(),
    };
  }

  /**
   * Propagate from an entry-point file and build the full graph.
   */
  propagate(filePath: string): SemanticLayoutGraph {
    this.graph = new SemanticLayoutGraph();
    this.options.visitedFiles = new Set();

    const absolutePath = path.resolve(filePath);
    const parsed = this.parseFileWithCache(absolutePath);
    if (!parsed) return this.graph;

    const components = Array.from(parsed.exportedComponents.values());
    if (components.length === 0) return this.graph;

    const rootComponent = components[0];
    const rootLineNumber = rootComponent.node.loc?.start.line ?? 0;
    this.walkComponent(rootComponent, null, parsed, 0, rootLineNumber);

    return this.graph;
  }

  /**
   * Get the built graph.
   */
  getGraph(): SemanticLayoutGraph {
    return this.graph;
  }

  // ─── Walking ───────────────────────────────────────────────

  private walkComponent(
    component: ResolvedComponent,
    parentId: string | null,
    parentParsed: ParsedFile,
    depth: number,
    lineNumber: number = 0
  ): string | null {
    if (depth > this.options.maxDepth) return null;
    if (!component.returnJSX) return null;

    const nodeId = this.graph.createNode({
      componentName: component.name,
      tagName: component.name,
      filePath: component.filePath,
      lineNumber,
      isCustomComponent: true,
    });

    if (parentId) {
      this.graph.addChild(parentId, nodeId);
    }

    this.walkJSX(component.returnJSX, nodeId, parentParsed, depth + 1, false);

    return nodeId;
  }

  private walkJSX(
    jsx: JSXElement | JSXFragment,
    parentId: string,
    parsed: ParsedFile,
    depth: number,
    isListItem: boolean
  ): void {
    if (depth > this.options.maxDepth) return;

    if (jsx.type === 'JSXFragment') {
      for (const child of jsx.children) {
        this.walkJSXChild(child, parentId, parsed, depth, isListItem);
      }
      return;
    }

    // JSXElement
    const opening = getOpeningElement(jsx);
    const tagName = getJSXTagName(opening);
    const lineNumber = opening.loc?.start.line ?? 0;

    const isCustom = /^[A-Z]/.test(tagName) && !RN_PRIMITIVES.has(tagName) && !RN_ANIMATED_PRIMITIVES.has(tagName);
    const isPrimitive = RN_PRIMITIVES.has(tagName) || RN_ANIMATED_PRIMITIVES.has(tagName);

    // Extract style properties via StyleExtractor (single pass)
    const { spacing, layout } = extractStyle(opening, parsed);

    const hasOnLayout = hasJSXAttribute(opening, 'onLayout');

    const nodeId = this.graph.createNode({
      componentName: tagName,
      tagName,
      filePath: parsed.filePath,
      lineNumber,
      spacing,
      layout,
      isPrimitive,
      isCustomComponent: isCustom,
      hasOnLayout,
      isListItem,
    });

    this.graph.addChild(parentId, nodeId);

    // If custom component, resolve and walk into it
    if (isCustom) {
      const resolved = this.componentResolver.resolveComponent(
        tagName,
        parsed,
        new Set<string>()
      );
      if (resolved && resolved.name === tagName) {
        const isSlot = detectSlot(resolved);
        if (isSlot) {
          this.graph.setSlot(nodeId);
        }

        const resolvedParsed = this.parseFileWithCache(resolved.filePath);
        if (resolvedParsed) {
          this.walkComponent(resolved, nodeId, resolvedParsed, depth + 1, lineNumber);
        } else {
          this.walkComponent(resolved, nodeId, parsed, depth + 1, lineNumber);
        }

        // Slot components render {props.children} — the consumer's children
        // must also be walked so their styles are captured in the graph.
        // Without this, magic numbers inside slot children go undetected.
        if (isSlot) {
          for (const child of getJSXChildren(jsx)) {
            this.walkJSXChild(child, nodeId, parsed, depth, isListItem);
          }
        }

        return;
      }
    }

    // Walk children
    for (const child of getJSXChildren(jsx)) {
      this.walkJSXChild(child, nodeId, parsed, depth, isListItem);
    }
  }

  private walkJSXChild(
    child: JSXChild,
    parentId: string,
    parsed: ParsedFile,
    depth: number,
    isListItem: boolean
  ): void {
    if (child.type === 'JSXElement') {
      this.walkJSX(child, parentId, parsed, depth, isListItem);
    } else if (child.type === 'JSXFragment') {
      this.walkJSX(child, parentId, parsed, depth, isListItem);
    } else if (child.type === 'JSXExpressionContainer') {
      const expr = (child as JSXExpressionContainer).expression;
      if (expr.type === 'CallExpression') {
        const callExpr = expr as CallExpression;
        if (callExpr.callee.type === 'MemberExpression') {
          const member = callExpr.callee as MemberExpression;
          if (member.property.type === 'Identifier' && member.property.name === 'map') {
            const callback = callExpr.arguments[0];
            if (callback && (callback.type === 'ArrowFunctionExpression' || callback.type === 'FunctionExpression')) {
              const fnBody = (callback as any).body;
              if (fnBody.type === 'JSXElement') {
                this.walkJSX(fnBody, parentId, parsed, depth, true);
              } else if (fnBody.type === 'BlockStatement') {
                for (const stmt of fnBody.body) {
                  if (stmt.type === 'ReturnStatement' && (stmt as any).argument?.type === 'JSXElement') {
                    this.walkJSX((stmt as any).argument, parentId, parsed, depth, true);
                  }
                }
              }
            }
          }
        }
      }
    }
  }

  // ─── File Cache ────────────────────────────────────────────

  private parseFileWithCache(filePath: string): ParsedFile | null {
    if (this.fileCache.has(filePath)) return this.fileCache.get(filePath)!;
    try {
      const parsed = parseFile(filePath);
      this.fileCache.set(filePath, parsed);
      return parsed;
    } catch {
      return null;
    }
  }
}
