// ============================================================
// render-traps.ts — Render trap types (React.memo Enforcer)
// Extracted from schemas.ts during Phase A refactoring
// ============================================================

// ─── Render Trap (Phase 2) ───────────────────────────────────
export interface RenderTrap {
  severity: 'high' | 'medium';
  component: string;
  propName: string;
  propType: 'inline-function' | 'inline-object' | 'inline-array';
  parentComponent: string;
  lineContext: string;
  lineNumber: number;
  suggestion: string;
}

export interface RenderTrapReport {
  filePath: string;
  traps: RenderTrap[];
  summary: string;
}
