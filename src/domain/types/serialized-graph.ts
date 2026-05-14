// ============================================================
// serialized-graph.ts — Serialized Semantic Layout Graph schema
// for cross-commit regression detection and CI integration.
//
// v1.0.0 — Initial release. Enables:
//   1. Persistent snapshots of the Semantic Layout Graph
//   2. Cross-commit diffing (regression detection)
//   3. Batch audit aggregation for CI
//   4. Cross-project consistency comparison
//
// The serialized format avoids circular references by storing
// children as an explicit edge list. Each node carries its
// parentId for convenience, but the edges array is the source
// of truth for parent-child relationships.
// ============================================================

import type { TruncationInfo } from '../../engine/vein/types.js';

// ─── Serialized Graph ─────────────────────────────────────────

/**
 * A serialized snapshot of the Semantic Layout Graph.
 * Designed to be written to .rhizome/ files and committed to git.
 */
export interface SerializedGraph {
  /** Metadata about the snapshot */
  metadata: SerializedMetadata;
  /** Flat map of all nodes (keyed by node ID) */
  nodes: Record<string, SerializedNode>;
  /** Explicit parent-child relationships */
  edges: SerializedEdge[];
  /** Aggregated analysis details */
  details: SerializedDetails;
}

// ─── Metadata ─────────────────────────────────────────────────

export interface SerializedMetadata {
  /** Absolute path to the analyzed file */
  filePath: string;
  /** ISO 8601 timestamp of when the snapshot was taken */
  timestamp: string;
  /** Git commit hash at analysis time (or "unknown") */
  commitHash: string;
  /** Rhizophora version that produced this snapshot */
  rhizophoraVersion: string;
  /** Schema version for forward compatibility */
  analysisVersion: string;
  /** Whether the analysis was truncated */
  truncated: boolean;
  /** Truncation details (if truncated) */
  truncationInfo?: TruncationInfo;
}

// ─── Serialized Node ──────────────────────────────────────────

/**
 * A flattened, serializable representation of a LayoutNode.
 * The `children` array is intentionally empty in serialized form;
 * use the `edges` array to reconstruct parent-child relationships.
 */
export interface SerializedNode {
  /** Unique node ID (matches the key in the nodes map) */
  id: string;
  /** Component name (e.g., "DashboardScreen", "View") */
  componentName: string;
  /** Tag name (e.g., "View", "Text", "ScrollView") */
  tagName: string;
  /** File path where this component is defined */
  filePath: string;
  /** Line number in the source file */
  lineNumber: number;
  /** Spacing tokens (margin, padding, gap) */
  spacing: SerializedSpacing;
  /** Layout properties (flex, position, dimensions) */
  layout: SerializedLayout;
  /** Whether this is a primitive (View, Text, etc.) */
  isPrimitive: boolean;
  /** Whether this is a custom component */
  isCustomComponent: boolean;
  /** Parent node ID (null for root) */
  parentId: string | null;
  /** Whether this component has an onLayout handler */
  hasOnLayout: boolean;
  /** Whether this is a list item (from .map()) */
  isListItem: boolean;
  /** Pollution score (0 = clean) */
  pollutionScore: number;
  /** Token deviations found on this node */
  tokenDeviations: SerializedTokenDeviation[];
  /** Whether this is a slot component (transparent container) */
  isSlot: boolean;
  /** Context hook calls (e.g., "useStation", "useAuth") */
  contextCalls: string[];
}

export interface SerializedSpacing {
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

export interface SerializedLayout {
  flexDirection?: string;
  justifyContent?: string;
  alignItems?: string;
  position?: string;
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
  width?: number | string;
  height?: number | string;
  flex?: number;
  zIndex?: number;
}

export interface SerializedTokenDeviation {
  property: string;
  value: number;
  suggestion: string;
}

// ─── Edges ────────────────────────────────────────────────────

export interface SerializedEdge {
  parentId: string;
  childId: string;
}

// ─── Details ──────────────────────────────────────────────────

/**
 * Aggregated analysis details extracted from the InferenceResult.
 * Provides a high-level summary without needing to re-parse the tree.
 */
export interface SerializedDetails {
  /** Complexity profile */
  complexityProfile: SerializedComplexityProfile;
  /** Overall health score (0-100) */
  healthScore: number;
  /** Violation counts by category */
  violations: SerializedViolationCounts;
}

export interface SerializedComplexityProfile {
  /** Complexity grade */
  grade: 'SIMPLE' | 'MODERATE' | 'COMPLEX' | 'OVERCOMPLICATED';
  /** Total number of components in the tree */
  totalComponents: number;
  /** Maximum nesting depth */
  maxDepth: number;
  /** Number of container nodes (have children) */
  containers: number;
  /** Number of leaf nodes (no children) */
  leaves: number;
  /** Container-to-leaf ratio */
  containerLeafRatio: number;
  /** Number of unique custom components */
  uniqueCustomComponents: number;
  /** Number of slot components */
  slots: number;
  /** Number of list items */
  listItems: number;
  /** Number of absolutely-positioned elements */
  absolutePositioned: number;
  /** Number of onLayout handlers */
  onLayoutHandlers: number;
}

export interface SerializedViolationCounts {
  contextualGapViolations: number;
  boundaryViolations: number;
  terminalPaddingViolations: number;
  groupingSuggestions: number;
  tokenDeviations: number;
  gapOpportunities: number;
  stylePollution: number;
  marginStacking: number;
  listItemIssues: number;
  rhythmViolations: number;
  proximityIssues: number;
}

// ─── Graph Diff ───────────────────────────────────────────────

/**
 * The result of comparing two SerializedGraph snapshots.
 * Reports structural changes, spacing changes, and violation changes.
 */
export interface GraphDiff {
  /** Metadata about the comparison */
  metadata: DiffMetadata;
  /** Structural changes (nodes added/removed) */
  structural: StructuralDiff;
  /** Spacing changes on nodes that exist in both snapshots */
  spacingChanges: SpacingChange[];
  /** Violation count changes */
  violationChanges: ViolationCountChange;
  /** Health score change */
  healthScoreChange: HealthScoreChange;
  /** Complexity grade change */
  complexityChange: ComplexityChange;
}

export interface DiffMetadata {
  /** File path that was analyzed */
  filePath: string;
  /** Before snapshot metadata */
  before: { commitHash: string; timestamp: string };
  /** After snapshot metadata */
  after: { commitHash: string; timestamp: string };
}

export interface StructuralDiff {
  /** Nodes present in 'after' but not in 'before' */
  added: NodeSummary[];
  /** Nodes present in 'before' but not in 'after' */
  removed: NodeSummary[];
  /** Total node count change */
  netChange: number;
}

export interface NodeSummary {
  id: string;
  componentName: string;
  tagName: string;
  lineNumber: number;
}

export interface SpacingChange {
  nodeId: string;
  componentName: string;
  property: string;
  before: number | undefined;
  after: number | undefined;
  /** Human-readable description */
  description: string;
}

export interface ViolationCountChange {
  before: SerializedViolationCounts;
  after: SerializedViolationCounts;
  /** Per-category deltas (positive = introduced, negative = resolved) */
  deltas: Record<keyof SerializedViolationCounts, number>;
  /** Total violation count change */
  netChange: number;
}

export interface HealthScoreChange {
  before: number;
  after: number;
  delta: number;
}

export interface ComplexityChange {
  before: string;
  after: string;
  changed: boolean;
}
