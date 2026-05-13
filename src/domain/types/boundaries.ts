// ============================================================
// boundaries.ts — Boundary gap types
// Extracted from schemas.ts during Phase A refactoring
// ============================================================

// ─── Boundary Gap ────────────────────────────────────────────
export interface BoundaryGap {
  severity: 'high' | 'medium' | 'low';
  category: 'missing-offset' | 'magic-number' | 'missing-onlayout' | 'zero-height-child' | 'missing-safe-area-in-measurement' | 'unmeasured-list-component' | 'margin-stacking' | 'missing-last-item-guard' | 'style-pollution' | 'ghost-margin';
  description: string;
  location: string;
  suggestion: string;
  /** WI-1: Whether the target component's interface accepts onLayout */
  interfaceStatus?: 'has-onlayout' | 'missing-onlayout' | 'unknown';
  /** v0.4.1: Layout Influence Index (1-10) — higher = more impactful */
  influenceIndex?: number;
}

export interface BoundaryGapReport {
  filePath: string;
  gaps: BoundaryGap[];
  summary: string;
}
