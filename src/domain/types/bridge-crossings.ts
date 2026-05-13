// ============================================================
// bridge-crossings.ts — Bridge crossing types (UI Thread Guardian)
// Extracted from schemas.ts during Phase A refactoring
// ============================================================

// ─── Bridge Crossing (Phase 2) ───────────────────────────────
export interface BridgeCrossing {
  severity: 'high' | 'medium';
  handler: string;
  culprit: string;
  lineContext: string;
  lineNumber: number;
  suggestion: string;
}

export interface BridgeCrossingReport {
  filePath: string;
  crossings: BridgeCrossing[];
  summary: string;
}
