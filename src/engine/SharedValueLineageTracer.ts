// ============================================================
// SharedValueLineageTracer.ts — Thin re-export
// Delegates to engine/detectors/shared-value/ sub-package.
// ============================================================

export {
  SharedValueLineageTracer,
} from './detectors/shared-value/index.js';
export type {
  TraceOptions,
  ContextRegistry,
  DelegatedSharedValue,
} from './detectors/shared-value/index.js';
