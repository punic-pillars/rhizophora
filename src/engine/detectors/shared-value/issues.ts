// ============================================================
// issues.ts — SharedValue issue generation logic
// Generates all 10+ issue types for SharedValue lineage analysis:
//   HIGH: Direct JSX usage, dead code
//   MEDIUM: Mutated but not consumed, setTimeout mutation,
//          non-worklet mutations, broken context chain
//   LOW: Prop propagation, context propagation, context consumer
//        with no usage, derived-only consumption, never-mutated
// ============================================================

import {
  SharedValueInfo,
  SharedValueIssue,
  ContextPropagationSite,
  ContextConsumerSite,
} from '../../../domain/types/index.js';

/**
 * Generate all issues for a single SharedValue based on its lifecycle analysis.
 * Called once per SharedValue declaration found in the file.
 */
export function generateIssues(
  sv: SharedValueInfo,
  contextPropagationSites: ContextPropagationSite[],
  contextConsumerSites: ContextConsumerSite[],
  hasSetTimeoutMutation: boolean
): SharedValueIssue[] {
  const issues: SharedValueIssue[] = [];
  const name = sv.name;

  // Compute combined consumption flag from individual consumption properties
  const isConsumed = sv.isConsumedByAnimatedStyle || sv.isConsumedByDerivedValue || sv.isConsumedByAnimatedReaction || sv.isConsumedByAnimatedProps;

  // HIGH: Direct JSX usage (root cause of the header height bug)
  if (sv.isUsedDirectlyInJSX) {
    issues.push({
      severity: 'high',
      sharedValue: name,
      description: `SharedValue "${name}" is used directly in a JSX style/attribute instead of via useAnimatedStyle. This means the UI will NOT update when the SharedValue changes.`,
      location: `JSX attribute referencing "${name}" without .value`,
      suggestion: `Wrap in useAnimatedStyle:\n  const ${name}Style = useAnimatedStyle(() => ({ height: ${name}.value }));\n  <Animated.View style={${name}Style} />`,
    });
  }

  // HIGH: Created but neither mutated nor consumed (dead code)
  if (!sv.isMutated && !isConsumed && !sv.isUsedDirectlyInJSX) {
    issues.push({
      severity: 'high',
      sharedValue: name,
      description: `SharedValue "${name}" is declared but never mutated or consumed. This is dead code.`,
      location: `const ${name} = useSharedValue(${sv.initialValue})`,
      suggestion: `Remove the unused SharedValue "${name}", or wire it up with mutations and consumption via useAnimatedStyle/useDerivedValue.`,
    });
  }

  // MEDIUM: Mutated but never consumed by ANY valid site
  if (sv.isMutated && !isConsumed && !sv.isUsedDirectlyInJSX) {
    issues.push({
      severity: 'medium',
      sharedValue: name,
      description: `SharedValue "${name}" is mutated (${sv.mutationSites.length} site(s)) but never consumed by useAnimatedStyle, useDerivedValue, useAnimatedReaction, or useAnimatedProps. The mutations have no visual effect.`,
      location: `${sv.mutationSites.length} mutation(s) found, 0 consumption sites`,
      suggestion: `Add a useAnimatedStyle to consume "${name}.value":\n  const ${name}Style = useAnimatedStyle(() => ({ height: ${name}.value }));`,
    });
  }

  // MEDIUM: setTimeout mutation (v3.2)
  if (hasSetTimeoutMutation) {
    issues.push({
      severity: 'medium',
      sharedValue: name,
      description: `SharedValue "${name}" is mutated inside setTimeout(). This runs on the JS thread and can cause thread desynchronization with the UI thread.`,
      location: `setTimeout(() => { ${name}.value = ... })`,
      suggestion: `Replace setTimeout with Reanimated's withDelay for UI-thread-safe delayed mutations:\n  ${name}.value = withDelay(delay, withTiming(targetValue));\nOr use runOnUI(() => { ${name}.value = ... })() to execute on the UI thread.`,
    });
  }

  // v0.4.1: MEDIUM: Non-worklet mutations (JS-thread pressure)
  if (sv.isMutatedOutsideWorklet && !hasSetTimeoutMutation) {
    issues.push({
      severity: 'medium',
      sharedValue: name,
      description: `SharedValue "${name}" is mutated outside a worklet context (${sv.nonWorkletMutationSites.length} site(s)). These mutations run on the JS thread, causing frame drops and UI thread desynchronization.`,
      location: `${sv.nonWorkletMutationSites.length} non-worklet mutation(s) found`,
      suggestion: `Move mutations inside a worklet context (useAnimatedStyle, useDerivedValue, or runOnUI):\n  runOnUI(() => { ${name}.value = newValue; })();`,
    });
  }

  // v0.4.1: LOW: Prop propagation (SharedValue passed to child)
  if (sv.propPropagationSites.length > 0) {
    for (const site of sv.propPropagationSites) {
      issues.push({
        severity: 'low',
        sharedValue: name,
        description: `Prop Propagation: "${name}" is passed to ${site}. The lineage "breaks" at the component boundary — you must audit the child component for SharedValue consumption.`,
        location: site,
        suggestion: `In the child component, check if "${name}" is consumed via useAnimatedStyle or passed further down. If the child doesn't consume it, the value has no visual effect.`,
      });
    }
  }

  // v0.9.0: LOW: Context Propagation (SharedValue placed into Context)
  if (contextPropagationSites.length > 0) {
    for (const site of contextPropagationSites) {
      issues.push({
        severity: 'low',
        sharedValue: name,
        description: `Context Propagation: "${name}" is placed into ${site.contextName}Context.Provider. The lineage continues in consumer components that call useContext(${site.contextName}Context).`,
        location: `<${site.contextName}Context.Provider value={{ ${name} }}> (line ${site.lineNumber})`,
        suggestion: `Audit all components consuming ${site.contextName}Context to verify "${name}" is consumed via useAnimatedStyle. Use the contextRegistry option for cross-file resolution.`,
      });
    }
  }

  // v0.9.0: MEDIUM: Broken Context Chain — SharedValue in Context but no consumer found
  if (contextPropagationSites.length > 0 && contextConsumerSites.length === 0) {
    issues.push({
      severity: 'medium',
      sharedValue: name,
      description: `Broken Context Chain: "${name}" is placed into ${contextPropagationSites[0].contextName}Context.Provider but no useContext consumer for this SharedValue was found in this file. The value may be orphaned if no child component consumes it.`,
      location: `<${contextPropagationSites[0].contextName}Context.Provider value={{ ${name} }}> (line ${contextPropagationSites[0].lineNumber})`,
      suggestion: `Verify that a child component calls useContext(${contextPropagationSites[0].contextName}Context) and consumes "${name}". If the context is consumed in another file, pass a contextRegistry to the tracer for cross-file resolution.`,
    });
  }

  // v0.9.0: INFO: Context Consumer detected
  if (contextConsumerSites.length > 0) {
    for (const site of contextConsumerSites) {
      if (site.usagePatterns.length === 0) {
        issues.push({
          severity: 'low',
          sharedValue: name,
          description: `Context Consumer: "${name}" is accessed via useContext(${site.contextName}Context) but no usage pattern (useAnimatedStyle, mutation, etc.) was detected for it. The value may be destructured but unused.`,
          location: `const { ${name} } = useContext(${site.contextName}Context) (line ${site.lineNumber})`,
          suggestion: `Verify that "${name}" is consumed via useAnimatedStyle or used in a mutation. If unused, remove the destructured property.`,
        });
      }
    }
  }

  // LOW: Consumed only by useDerivedValue, not useAnimatedStyle (v4.0)
  if (sv.isConsumedByDerivedValue && !sv.isConsumedByAnimatedStyle && !sv.isUsedDirectlyInJSX) {
    issues.push({
      severity: 'low',
      sharedValue: name,
      description: `SharedValue "${name}" is consumed by useDerivedValue but not directly by useAnimatedStyle. This is valid — the derived value is what drives the style. Verify that the derived value is correctly consumed.`,
      location: `useDerivedValue references "${name}.value"`,
      suggestion: `Ensure the derived value from useDerivedValue is consumed by a useAnimatedStyle:\n  const derived = useDerivedValue(() => ${name}.value * 2);\n  const style = useAnimatedStyle(() => ({ height: derived.value }));`,
    });
  }

  // LOW: Initial value never changes (not necessarily wrong, but worth noting)
  if (!sv.isMutated && isConsumed) {
    issues.push({
      severity: 'low',
      sharedValue: name,
      description: `SharedValue "${name}" is consumed but never mutated. Its value never changes from the initial ${sv.initialValue}.`,
      location: `const ${name} = useSharedValue(${sv.initialValue})`,
      suggestion: `If "${name}" never changes, consider using a regular constant instead of useSharedValue. If it should change, add mutation sites.`,
    });
  }

  return issues;
}

/**
 * Generate a summary string for the SharedValue lineage report.
 */
export function generateSummary(
  sharedValuesCount: number,
  delegatedCount: number,
  highCount: number,
  mediumCount: number,
  lowCount: number
): string {
  if (sharedValuesCount === 0 && delegatedCount === 0) {
    return '✅ No useSharedValue declarations found in this file.';
  }

  if (highCount > 0) {
    return `⚠️  Found ${highCount} high-severity issue(s) (${mediumCount} medium, ${lowCount} low) across ${sharedValuesCount} SharedValue(s) and ${delegatedCount} delegated hook SharedValue(s).`;
  }

  if (mediumCount > 0) {
    return `🔶 Found ${mediumCount} medium-severity issue(s) (${lowCount} low) across ${sharedValuesCount} SharedValue(s) and ${delegatedCount} delegated hook SharedValue(s).`;
  }

  if (lowCount > 0) {
    return `ℹ️  Found ${lowCount} low-severity note(s) across ${sharedValuesCount} SharedValue(s) and ${delegatedCount} delegated hook SharedValue(s).`;
  }

  return `✅ All ${sharedValuesCount} SharedValue(s) are healthy: mutated, consumed (via useAnimatedStyle/useDerivedValue/useAnimatedReaction/useAnimatedProps), and not used directly in JSX.`;
}
