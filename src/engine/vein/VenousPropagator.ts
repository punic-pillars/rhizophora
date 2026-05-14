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
// v1.1.0 "Performance Guards" — Added maxFiles limit, timeout
//   guard, and file size guard integration.
// ============================================================

import * as path from 'path';
import * as fs from 'fs';
import { parseFile, DEFAULT_MAX_FILE_SIZE_KB } from './ASTParser.js';
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
import type { ParsedFile, ResolvedComponent, TruncationInfo } from './types.js';

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
  /**
   * v1.1.0: Maximum number of files to parse before truncating.
   * Prevents hangs on projects with deep import chains. Default: 20.
   */
  maxFiles?: number;
  /**
   * v1.1.0: Maximum file size in KB. Files larger than this are skipped.
   * Default: 500 KB.
   */
  maxFileSizeKB?: number;
  /**
   * v1.1.0: Timeout in milliseconds. Analysis stops after this duration.
   * Default: 10000 (10 seconds).
   */
  timeoutMs?: number;
}

// ─── Propagator ───────────────────────────────────────────────

export class VenousPropagator {
  private graph: SemanticLayoutGraph;
  private options: Required<PropagationOptions>;
  private fileCache: Map<string, ParsedFile>;
  private componentResolver: ComponentResolver;

  // v1.1.0: Performance tracking
  private filesParsed: number = 0;
  private filesSkippedSize: number = 0;
  private unresolvedComponents: number = 0;
  private startTime: number = 0;

  constructor(options: PropagationOptions = {}) {
    this.graph = new SemanticLayoutGraph();
    this.fileCache = new Map();
    this.componentResolver = new ComponentResolver(this.fileCache);
    this.options = {
      designTokens: options.designTokens ?? [],
      maxDepth: options.maxDepth ?? 10,
      visitedFiles: options.visitedFiles ?? new Set(),
      maxFiles: options.maxFiles ?? 20,
      maxFileSizeKB: options.maxFileSizeKB ?? DEFAULT_MAX_FILE_SIZE_KB,
      timeoutMs: options.timeoutMs ?? 10000,
    };
  }

  /**
   * Propagate from an entry-point file and build the full graph.
   */
  propagate(filePath: string): SemanticLayoutGraph {
    this.graph = new SemanticLayoutGraph();
    this.options.visitedFiles = new Set();
    this.filesParsed = 0;
    this.filesSkippedSize = 0;
    this.unresolvedComponents = 0;
    this.startTime = Date.now();

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
   * v1.1.0: Get truncation info for the last propagation run.
   */
  getTruncationInfo(): TruncationInfo {
    const elapsedMs = Date.now() - this.startTime;
    const maxFiles = this.options.maxFiles;
    return {
      truncated: this.filesParsed >= maxFiles || this.filesSkippedSize > 0 || this.unresolvedComponents > 0,
      filesParsed: this.filesParsed,
      maxFiles,
      filesSkippedSize: this.filesSkippedSize,
      unresolvedComponents: this.unresolvedComponents,
      timedOut: elapsedMs >= this.options.timeoutMs,
      elapsedMs,
    };
  }

  /**
   * v1.1.0: Check if any performance limit has been hit.
   */
  private isLimitHit(): boolean {
    if (this.filesParsed >= this.options.maxFiles) return true;
    if (Date.now() - this.startTime >= this.options.timeoutMs) return true;
    return false;
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
      // v1.1.0: Check performance limits before resolving
      if (this.isLimitHit()) {
        this.unresolvedComponents++;
        return;
      }

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

    // v1.1.0: Check performance limits before parsing
    if (this.isLimitHit()) {
      return null;
    }

    try {
      const parsed = parseFile(filePath, this.options.maxFileSizeKB);
      this.filesParsed++;
      this.fileCache.set(filePath, parsed);
      return parsed;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // v1.1.0: Track files skipped due to size
      if (message.startsWith('[SKIPPED]')) {
        this.filesSkippedSize++;
      }
      return null;
    }
  }
}
