// ============================================================
// shared-values.ts — SharedValue lineage types
// Extracted from schemas.ts during Phase A refactoring
// ============================================================

// ─── Shared Value Lineage (Phase 2, v4.0, v0.4.1) ────────────
export interface SharedValueInfo {
  name: string;
  initialValue: number | string;
  isMutated: boolean;
  isConsumedByAnimatedStyle: boolean;
  /** v4.0: consumed via useDerivedValue (indirect consumption) */
  isConsumedByDerivedValue: boolean;
  /** v4.0: consumed via useAnimatedReaction (side-effect consumption) */
  isConsumedByAnimatedReaction: boolean;
  /** v4.0: consumed via useAnimatedProps (props consumption) */
  isConsumedByAnimatedProps: boolean;
  isUsedDirectlyInJSX: boolean;
  mutationSites: string[];
  consumptionSites: string[];
  /** v0.4.1: SharedValue passed as JSX prop to child components */
  propPropagationSites: string[];
  /** v0.4.1: Mutations happening outside worklet context (JS-thread pressure) */
  isMutatedOutsideWorklet: boolean;
  nonWorkletMutationSites: string[];
  /** v0.9.0: SharedValue placed into a React Context provider */
  contextPropagationSites: ContextPropagationSite[];
  /** v0.9.0: SharedValue consumed via useContext in this file */
  contextConsumerSites: ContextConsumerSite[];
}

/** v0.9.0: A SharedValue placed into a React Context provider */
export interface ContextPropagationSite {
  contextName: string;
  providerComponent?: string;
  propName: string;
  lineNumber: number;
  /** If true, the context provider was found in this file */
  isLocal: boolean;
}

/** v0.9.0: A SharedValue consumed via useContext */
export interface ContextConsumerSite {
  contextName: string;
  variableName: string;
  lineNumber: number;
  /** How the consumed value is used (e.g., '.value' in useAnimatedStyle, direct JSX) */
  usagePatterns: string[];
}

export interface SharedValueIssue {
  severity: 'high' | 'medium' | 'low';
  sharedValue: string;
  description: string;
  location: string;
  suggestion: string;
}

export interface SharedValueLineageReport {
  filePath: string;
  sharedValues: SharedValueInfo[];
  issues: SharedValueIssue[];
  summary: string;
}
