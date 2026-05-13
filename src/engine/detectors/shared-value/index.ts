// ============================================================
// index.ts — SharedValue Lineage sub-package barrel
// Re-exports the main SharedValueLineageTracer class and all
// supporting types for external consumption.
// ============================================================

export { SharedValueLineageTracer } from './lineage-tracer.js';
export type { TraceOptions } from './lineage-tracer.js';
export type { ContextRegistry } from './context-resolver.js';
export type { DelegatedSharedValue } from './delegated-values.js';
