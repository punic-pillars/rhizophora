// ============================================================
// types.ts — Shared types for the Vein Propagation Engine.
// Single source of truth for all type definitions used across
// the vein modules. Eliminates circular dependencies and
// type duplication across ASTParser, SemanticLayoutGraph, etc.
//
// v1.0.0 "Refactored Vein" — Extracted from ASTParser.ts,
//   SemanticLayoutGraph.ts, and HeuristicInferenceEngine.ts
//   into a single shared types file.
// ============================================================

import type { TSESTree } from '@typescript-eslint/typescript-estree';

// ─── AST Types ────────────────────────────────────────────────

export interface ParsedFile {
  filePath: string;
  source: string;
  ast: TSESTree.Program;
  imports: Map<string, ImportInfo>;
  exportedComponents: Map<string, ComponentDef>;
  reExports: Map<string, ReExportInfo>;
}

export interface ImportInfo {
  sourcePath: string;
  resolvedPath: string | null;
  namedImports: string[];
  defaultImport: string | null;
}

export interface ComponentDef {
  name: string;
  node: TSESTree.FunctionDeclaration | TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;
  returnJSX: TSESTree.JSXElement | TSESTree.JSXFragment | null;
  filePath: string;
}

export interface ReExportInfo {
  sourcePath: string;
  resolvedPath: string | null;
  specifiers: ReExportSpecifier[];
  isWildcard: boolean;
}

export interface ReExportSpecifier {
  exportedName: string;
  localName: string;
}

// ─── Spacing & Layout ─────────────────────────────────────────

export interface SpacingTokens {
  marginTop?: number;
  marginBottom?: number;
  marginLeft?: number;
  marginRight?: number;
  marginVertical?: number;
  marginHorizontal?: number;
  margin?: number;
  padding?: number;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  paddingVertical?: number;
  paddingHorizontal?: number;
  gap?: number;
  rowGap?: number;
  columnGap?: number;
}

export interface LayoutProperties {
  flexDirection?: 'row' | 'column';
  justifyContent?: string;
  alignItems?: string;
  position?: 'relative' | 'absolute';
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  width?: number | string;
  height?: number | string;
  flex?: number;
  zIndex?: number;
}

// ─── Graph Node ───────────────────────────────────────────────

export interface LayoutNode {
  id: string;
  componentName: string;
  tagName: string;
  filePath: string;
  lineNumber: number;
  spacing: SpacingTokens;
  layout: LayoutProperties;
  isPrimitive: boolean;
  isCustomComponent: boolean;
  children: LayoutNode[];
  parentId: string | null;
  hasOnLayout: boolean;
  isListItem: boolean;
  pollutionScore: number;
  tokenDeviations: TokenDeviation[];
  isSlot: boolean;
  contextCalls: string[];
}

export interface TokenDeviation {
  property: string;
  value: number;
  suggestion: string;
}

// ─── Inference Types ──────────────────────────────────────────

export interface InferenceResult {
  gapOpportunities: GapOpportunity[];
  stylePollution: StylePollution[];
  marginStacking: MarginStacking[];
  listItemIssues: ListItemIssue[];
  tokenDeviations: TokenDeviation[];
  rhythmViolations: RhythmViolation[];
  proximityIssues: ProximityIssue[];
  /** v2.0.0: Contextual gap violations (replaces simple rhythm check) */
  contextualGapViolations: ContextualGapViolation[];
  /** v2.0.0: Boundary rule violations (last child marginBottom) */
  boundaryViolations: BoundaryViolation[];
  /** v2.0.0: Grouping suggestions from Rule of Three */
  groupingSuggestions: GroupingSuggestion[];
  /** v2.3.0: Terminal padding violations (last child redundant padding) */
  terminalPaddingViolations: TerminalPaddingViolation[];
  healthScore: number;
}

export interface GapOpportunity {
  node: LayoutNode;
  severity: 'high' | 'medium' | 'low';
  description: string;
  suggestion: string;
}

export interface StylePollution {
  node: LayoutNode;
  severity: 'high' | 'medium';
  description: string;
  suggestion: string;
}

export interface MarginStacking {
  parent: LayoutNode;
  child: LayoutNode;
  totalSpacing: number;
  severity: 'medium' | 'low';
}

export interface ListItemIssue {
  node: LayoutNode;
  severity: 'medium';
  description: string;
  suggestion: string;
}

// ─── v1.1.0: Rhythm Hierarch Types ────────────────────────────

export interface RhythmViolation {
  parent: LayoutNode;
  child: LayoutNode;
  parentGap: number;
  childGap: number;
  severity: 'high' | 'medium';
  description: string;
  suggestion: string;
}

// ─── v2.0.0: Contextual Gap Violation Types ───────────────────

/**
 * v2.0.0: A contextual gap violation replaces the simpler RhythmViolation.
 * It validates gaps based on the Proximity Score between siblings:
 *   - Intra-Section (Score > 6): Target gap = 8px, flag if > 8px
 *   - Inter-Section (Score < 4 OR Divider): Target gap = 16px, flag if < 16px
 */
export interface ContextualGapViolation {
  container: LayoutNode;
  childA: LayoutNode;
  childB: LayoutNode;
  actualGap: number;
  targetGap: number;
  proximityScore: number;
  violationType: 'loose-rhythm' | 'section-collision';
  severity: 'high' | 'medium';
  description: string;
  suggestion: string;
}

/**
 * v2.0.0: Boundary Rule violation — last child of a container
 * should have zero marginBottom (rely on container paddingBottom).
 */
export interface BoundaryViolation {
  container: LayoutNode;
  lastChild: LayoutNode;
  marginProperty: string;
  marginValue: number;
  severity: 'medium';
  description: string;
  suggestion: string;
}

// ─── v1.1.0: Semantic Proximity Types ─────────────────────────

export interface ProximityIssue {
  container: LayoutNode;
  siblings: LayoutNode[];
  sharedPrefix: string;
  severity: 'medium' | 'low';
  description: string;
  suggestion: string;
}

// ─── v2.0.0: Grouping Specialist (Rule of Three) Types ────────

/**
 * v2.0.0: A grouping suggestion from the Rule of Three.
 * Triggered when 3+ consecutive siblings have high proximity scores
 * but no shared parent wrapper.
 */
export interface GroupingSuggestion {
  container: LayoutNode;
  siblings: LayoutNode[];
  averageScore: number;
  severity: 'medium' | 'low';
  description: string;
  suggestion: string;
}

// ─── v2.3.0: Terminal Padding Violation Types ────────────────

/**
 * v2.3.0: A terminal padding violation occurs when the last child of a container
 * defines its own paddingBottom or marginBottom while the container already has
 * a gap or padding. This creates "Ghost Margin" layout pollution — redundant
 * boundary spacing that should be handled by the container alone.
 */
export interface TerminalPaddingViolation {
  container: LayoutNode;
  child: LayoutNode;
  property: string;
  value: number;
  severity: 'medium';
  description: string;
  suggestion: string;
}

// ─── Resolved Component ───────────────────────────────────────

export interface ResolvedComponent {
  name: string;
  returnJSX: TSESTree.JSXElement | TSESTree.JSXFragment | null;
  filePath: string;
  /** The AST node of the component function/arrow — used for enhanced slot detection */
  node?: TSESTree.FunctionDeclaration | TSESTree.ArrowFunctionExpression | TSESTree.FunctionExpression;
}

// ─── Style Extraction Result ──────────────────────────────────

export interface ExtractedStyles {
  spacing: SpacingTokens;
  layout: LayoutProperties;
}
