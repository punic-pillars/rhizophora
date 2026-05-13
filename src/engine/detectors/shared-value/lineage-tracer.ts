// ============================================================
// lineage-tracer.ts — Core SharedValueLineageTracer class
// Orchestrates the full SharedValue lifecycle analysis:
//   1. Declaration detection (useSharedValue)
//   2. Mutation tracking (.value =)
//   3. Consumption tracking (useAnimatedStyle, useDerivedValue,
//      useAnimatedReaction, useAnimatedProps)
//   4. Direct-JSX-usage bug pattern detection
//   5. Prop propagation detection (SharedValue passed as JSX prop)
//   6. Context propagation detection (SharedValue in Context.Provider)
//   7. Context consumer detection (useContext)
//   8. Delegated SharedValue detection (custom hooks)
//   9. Issue generation and summary
//
// v0.4.1: Added prop propagation and non-worklet mutation detection
// v0.9.0: Added Context Propagation and Context Consumer detection
// v0.10.0: Added custom hook SharedValue detection and auto-registry
// ============================================================

import * as fs from 'fs';
import {
  SharedValueInfo,
  SharedValueIssue,
  SharedValueLineageReport,
  ContextPropagationSite,
  ContextConsumerSite,
} from '../../../domain/types/index.js';
import { ContextRegistry, detectContextProviders, detectContextConsumers, resolveCrossFileContexts, autoDiscoverContexts } from './context-resolver.js';
import { DelegatedSharedValue, detectDelegatedSharedValues } from './delegated-values.js';
import { generateIssues, generateSummary } from './issues.js';

// Set of known worklet contexts where SharedValue mutations are UI-thread safe
const WORKLET_CONTEXTS = new Set([
  'useAnimatedStyle',
  'useDerivedValue',
  'useAnimatedReaction',
  'useAnimatedProps',
  'runOnUI',
]);

/**
 * v0.9.0: Options for the tracer, including an optional context registry
 * for cross-file resolution.
 */
export interface TraceOptions {
  /** v0.9.0: Pre-populated context registry for cross-file resolution */
  contextRegistry?: ContextRegistry;
  /** v0.9.0: If true, scan imported files for context providers (default: false) */
  resolveCrossFile?: boolean;
}

export class SharedValueLineageTracer {
  /**
   * Trace SharedValue lineage in a .tsx/.jsx file.
   * @param filePath Absolute path to the file to trace
   * @param options Optional configuration for cross-file resolution
   */
  trace(filePath: string, options?: TraceOptions): SharedValueLineageReport {
    const source = fs.readFileSync(filePath, 'utf-8');
    const sharedValues: SharedValueInfo[] = [];
    const issues: SharedValueIssue[] = [];

    // ─── Phase 0: Detect Context Providers in this file ──────
    // v0.9.0: Scan for <XxxContext.Provider value={{ svName, ... }}>
    // This runs BEFORE SharedValue detection so we can cross-reference.
    const localContextProviders = detectContextProviders(source);

    // ─── Phase 0b: Detect useContext consumers in this file ───
    // v0.9.0: Scan for const { xxx } = useContext(XxxContext)
    // and const value = useContext(XxxContext)
    const localContextConsumers = detectContextConsumers(source);

    // ─── Phase 0c: Resolve cross-file context providers ───────
    // v0.9.0: If options.contextRegistry is provided, merge with local providers
    // v0.10.0: Also auto-discover context providers from imports
    const mergedContextRegistry: ContextRegistry = { ...localContextProviders };
    if (options?.contextRegistry) {
      for (const [ctxName, svNames] of Object.entries(options.contextRegistry)) {
        if (!mergedContextRegistry[ctxName]) {
          mergedContextRegistry[ctxName] = [];
        }
        // Merge unique values
        for (const sv of svNames) {
          if (!mergedContextRegistry[ctxName].includes(sv)) {
            mergedContextRegistry[ctxName].push(sv);
          }
        }
      }
    }

    // ─── Phase 0d: Cross-file resolution via imports ──────────
    // v0.9.0: If resolveCrossFile is true, scan imported files for context providers
    // v0.10.0: Auto-discover context providers even without resolveCrossFile flag
    if (options?.resolveCrossFile) {
      resolveCrossFileContexts(filePath, source, mergedContextRegistry);
    }
    // v0.10.0: Always auto-discover context providers from imports
    autoDiscoverContexts(filePath, source, mergedContextRegistry);

    // ─── Phase 0e: v0.10.0 — Detect custom hooks that create SharedValues ──
    // Scan the file for custom hook definitions that contain useSharedValue
    const delegatedSharedValues = detectDelegatedSharedValues(source, filePath);

    // ─── 1. Find all useSharedValue declarations ──────────────
    // Pattern: const name = useSharedValue(initialValue)
    // Use brace-matching to handle nested parens in initial value expressions
    const svDeclRegex = /const\s+(\w+)\s*=\s*useSharedValue\s*\(/g;
    let match: RegExpExecArray | null;

    while ((match = svDeclRegex.exec(source)) !== null) {
      const name = match[1];
      const argsStart = match.index + match[0].length;

      // Extract the argument by paren-matching (handles nested parens)
      let depth = 1;
      let pos = argsStart;
      while (depth > 0 && pos < source.length) {
        const ch = source[pos];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        pos++;
      }
      const initialValueRaw = source.substring(argsStart, pos - 1).trim();

      // Parse the initial value (handle numbers, strings, booleans)
      let initialValue: number | string = 0;
      if (/^['"]/.test(initialValueRaw)) {
        initialValue = initialValueRaw.replace(/['"]/g, '');
      } else {
        const parsed = parseFloat(initialValueRaw);
        if (!isNaN(parsed)) {
          initialValue = parsed;
        } else {
          initialValue = initialValueRaw;
        }
      }

      // ── 2. Track mutations: name.value = ... ────────────────
      const mutationSites: string[] = [];
      const nonWorkletMutationSites: string[] = [];
      const mutationRegex = new RegExp(
        `${name}\\.value\\s*=\\s*([^;]+)`,
        'g'
      );
      let mutationMatch: RegExpExecArray | null;
      while ((mutationMatch = mutationRegex.exec(source)) !== null) {
        const rhs = mutationMatch[1].trim();
        const mutationIndex = mutationMatch.index;

        // Categorize the mutation type
        let mutationDesc: string;
        if (/withSpring|withTiming|withDecay|withSequence|withRepeat/.test(rhs)) {
          mutationDesc = `animated: ${rhs.substring(0, 60)}`;
        } else {
          mutationDesc = `direct: ${rhs.substring(0, 60)}`;
        }
        mutationSites.push(mutationDesc);

        // v0.4.1: Check if mutation is inside a worklet context
        if (!this.isInsideWorkletContext(source, mutationIndex)) {
          nonWorkletMutationSites.push(mutationDesc);
        }
      }

      // ── 3. Track consumption via useAnimatedStyle ───────────
      const consumptionSites: string[] = [];
      // Find useAnimatedStyle blocks that reference name.value
      // Use brace-matching to handle multi-line blocks with nested parens
      const animatedStyleStartRegex = /useAnimatedStyle\s*\(/g;
      let asMatch: RegExpExecArray | null;
      while ((asMatch = animatedStyleStartRegex.exec(source)) !== null) {
        const blockStart = asMatch.index + asMatch[0].length;
        // Extract the callback body by paren-matching
        let depth = 1;
        let pos = blockStart;
        while (depth > 0 && pos < source.length) {
          const ch = source[pos];
          if (ch === '(') depth++;
          else if (ch === ')') depth--;
          pos++;
        }
        const block = source.substring(asMatch.index, pos);
        const valueRefRegex = new RegExp(`${name}\\.value`, 'g');
        if (valueRefRegex.test(block)) {
          consumptionSites.push(`useAnimatedStyle: ${block.substring(0, 80)}`);
        }
      }

      // ── v4.0: Track consumption via useDerivedValue ─────────
      let isConsumedByDerivedValue = false;
      const derivedValueStartRegex = /useDerivedValue\s*\(/g;
      let dvMatch: RegExpExecArray | null;
      while ((dvMatch = derivedValueStartRegex.exec(source)) !== null) {
        const blockStart = dvMatch.index + dvMatch[0].length;
        let depth = 1;
        let pos = blockStart;
        while (depth > 0 && pos < source.length) {
          const ch = source[pos];
          if (ch === '(') depth++;
          else if (ch === ')') depth--;
          pos++;
        }
        const block = source.substring(dvMatch.index, pos);
        const valueRefRegex = new RegExp(`${name}\\.value`, 'g');
        if (valueRefRegex.test(block)) {
          isConsumedByDerivedValue = true;
          consumptionSites.push(`useDerivedValue: ${block.substring(0, 80)}`);
        }
      }

      // ── v4.0: Track consumption via useAnimatedReaction ─────
      let isConsumedByAnimatedReaction = false;
      const reactionStartRegex = /useAnimatedReaction\s*\(/g;
      let rMatch: RegExpExecArray | null;
      while ((rMatch = reactionStartRegex.exec(source)) !== null) {
        const blockStart = rMatch.index + rMatch[0].length;
        let depth = 1;
        let pos = blockStart;
        while (depth > 0 && pos < source.length) {
          const ch = source[pos];
          if (ch === '(') depth++;
          else if (ch === ')') depth--;
          pos++;
        }
        const block = source.substring(rMatch.index, pos);
        const valueRefRegex = new RegExp(`${name}\\.value`, 'g');
        if (valueRefRegex.test(block)) {
          isConsumedByAnimatedReaction = true;
          consumptionSites.push(`useAnimatedReaction: ${block.substring(0, 80)}`);
        }
      }

      // ── v4.0: Track consumption via useAnimatedProps ────────
      let isConsumedByAnimatedProps = false;
      const animatedPropsStartRegex = /useAnimatedProps\s*\(/g;
      let apMatch: RegExpExecArray | null;
      while ((apMatch = animatedPropsStartRegex.exec(source)) !== null) {
        const blockStart = apMatch.index + apMatch[0].length;
        let depth = 1;
        let pos = blockStart;
        while (depth > 0 && pos < source.length) {
          const ch = source[pos];
          if (ch === '(') depth++;
          else if (ch === ')') depth--;
          pos++;
        }
        const block = source.substring(apMatch.index, pos);
        const valueRefRegex = new RegExp(`${name}\\.value`, 'g');
        if (valueRefRegex.test(block)) {
          isConsumedByAnimatedProps = true;
          consumptionSites.push(`useAnimatedProps: ${block.substring(0, 80)}`);
        }
      }

      // ── 4. Check for direct JSX usage (THE BUG PATTERN) ────
      let isUsedDirectlyInJSX = false;
      const directUsageRegex = new RegExp(
        `style\\s*=\\s*\\{[^{}]*\\b${name}\\b(?!\\s*\\.)[^{}]*\\}`,
        'g'
      );
      if (directUsageRegex.test(source)) {
        isUsedDirectlyInJSX = true;
      }

      // Also check for name used in JSX attributes other than style
      const jsxDirectRegex = new RegExp(
        `=\\s*\\{[^{}]*\\b${name}\\b(?!\\s*\\.)[^{}]*\\}`,
        'g'
      );
      jsxDirectRegex.lastIndex = 0;
      if (jsxDirectRegex.test(source)) {
        const jsxMatch = jsxDirectRegex.exec(source);
        if (jsxMatch) {
          const matchIndex = jsxMatch.index;
          const beforeMatch = source.substring(Math.max(0, matchIndex - 20), matchIndex);
          if (!beforeMatch.trim().endsWith(':')) {
            isUsedDirectlyInJSX = true;
          }
        }
      }

      // ── v0.4.1: Detect prop propagation ─────────────────────
      // Check if the SharedValue is passed as a JSX prop to a child component
      // Pattern: <Child headerHeight={headerHeight}>
      const propPropagationSites: string[] = [];
      const propPropagationRegex = new RegExp(
        `<([A-Z][a-zA-Z0-9]*)[^>]*\\{${name}\\}[^>]*>`,
        'g'
      );
      let propMatch: RegExpExecArray | null;
      while ((propMatch = propPropagationRegex.exec(source)) !== null) {
        const childName = propMatch[1];
        // Extract the prop name
        const propContext = propMatch[0];
        const propNameMatch = propContext.match(/(\w+)\s*=\s*\{${name}\}/);
        const propName = propNameMatch ? propNameMatch[1] : 'unknown';
        propPropagationSites.push(`<${childName}> as {${propName}}`);
      }

      // ── v0.9.0: Detect Context Propagation ──────────────────
      // Check if this SharedValue is placed into a Context provider's value
      const contextPropagationSites: ContextPropagationSite[] = [];
      for (const [ctxName, svNames] of Object.entries(localContextProviders)) {
        if (svNames.includes(name)) {
          // Find the line number of the provider
          const providerRegex = new RegExp(`<${ctxName}Context\\.Provider`, 'g');
          const providerMatch = providerRegex.exec(source);
          const lineNumber = providerMatch
            ? source.substring(0, providerMatch.index).split('\n').length
            : 0;
          contextPropagationSites.push({
            contextName: ctxName,
            providerComponent: undefined,
            propName: name,
            lineNumber,
            isLocal: true,
          });
        }
      }

      // ── v0.9.0: Detect Context Consumer usage ───────────────
      // Check if any useContext consumer in this file references this SharedValue
      const contextConsumerSites: ContextConsumerSite[] = [];
      for (const consumer of localContextConsumers) {
        // Check if the consumed context exposes this SharedValue
        const exposedValues = mergedContextRegistry[consumer.contextName] || [];
        if (exposedValues.includes(name)) {
          // Check how the consumer variable is used
          const usagePatterns: string[] = [];
          const varName = consumer.variableName;

          // Check if consumed in useAnimatedStyle
          const uasRegex = new RegExp(`useAnimatedStyle\\s*\\([^)]*\\b${varName}\\.${name}\\b`, 'g');
          if (uasRegex.test(source)) {
            usagePatterns.push('useAnimatedStyle');
          }

          // Check if consumed in useDerivedValue
          const udvRegex = new RegExp(`useDerivedValue\\s*\\([^)]*\\b${varName}\\.${name}\\b`, 'g');
          if (udvRegex.test(source)) {
            usagePatterns.push('useDerivedValue');
          }

          // Check if used directly in JSX
          const jsxRegex = new RegExp(`\\b${varName}\\.${name}\\b[^)]*\\}`, 'g');
          if (jsxRegex.test(source)) {
            usagePatterns.push('direct-JSX');
          }

          // Check if used in .value assignment
          const mutRegex = new RegExp(`\\b${varName}\\.${name}\\.value\\s*=`, 'g');
          if (mutRegex.test(source)) {
            usagePatterns.push('mutation');
          }

          // Check if used in onLayout
          const layoutRegex = new RegExp(`onLayout\\s*=\\s*\\{[^}]*\\b${varName}\\.${name}\\b`, 'g');
          if (layoutRegex.test(source)) {
            usagePatterns.push('onLayout');
          }

          contextConsumerSites.push({
            contextName: consumer.contextName,
            variableName: consumer.variableName,
            lineNumber: consumer.lineNumber,
            usagePatterns,
          });
        }
      }

      // ── v3.2: Check for setTimeout mutations ────────────────
      const setTimeoutMutationRegex = new RegExp(
        `setTimeout\\s*\\([^)]*${name}\\.value\\s*=`,
        'g'
      );
      const hasSetTimeoutMutation = setTimeoutMutationRegex.test(source);

      const isMutated = mutationSites.length > 0;
      const isConsumedByAnimatedStyle = consumptionSites.some(s => s.startsWith('useAnimatedStyle'));
      const isConsumed = consumptionSites.length > 0;
      const isMutatedOutsideWorklet = nonWorkletMutationSites.length > 0;

      sharedValues.push({
        name,
        initialValue,
        isMutated,
        isConsumedByAnimatedStyle,
        isConsumedByDerivedValue,
        isConsumedByAnimatedReaction,
        isConsumedByAnimatedProps,
        isUsedDirectlyInJSX,
        mutationSites,
        consumptionSites,
        propPropagationSites,
        isMutatedOutsideWorklet,
        nonWorkletMutationSites,
        contextPropagationSites,
        contextConsumerSites,
      });

      // ── 5. Generate issues for this SharedValue ─────────────
      const svIssues = generateIssues(
        sharedValues[sharedValues.length - 1],
        contextPropagationSites,
        contextConsumerSites,
        hasSetTimeoutMutation
      );
      issues.push(...svIssues);
    }

    // ─── v0.10.0: Report delegated SharedValues from custom hooks ──
    if (delegatedSharedValues.length > 0) {
      for (const dsv of delegatedSharedValues) {
        const location = dsv.isLocal
          ? `Custom hook "${dsv.hookName}" in this file`
          : `Custom hook "${dsv.hookName}" in ${dsv.hookFile}`;
        issues.push({
          severity: 'low',
          sharedValue: dsv.name,
          description: `📤 Custom Hook Propagation: SharedValue "${dsv.name}" is created inside custom hook "${dsv.hookName}". The lineage originates in the hook definition, not in this file.`,
          location,
          suggestion: `Audit the hook "${dsv.hookName}" to verify "${dsv.name}" is properly mutated and consumed via useAnimatedStyle. The hook's return value should expose the SharedValue or an animated style for consumption.`,
        });
      }
    }

    // ─── Summary ─────────────────────────────────────────────
    const highCount = issues.filter((i) => i.severity === 'high').length;
    const mediumCount = issues.filter((i) => i.severity === 'medium').length;
    const lowCount = issues.filter((i) => i.severity === 'low').length;

    const summary = generateSummary(
      sharedValues.length,
      delegatedSharedValues.length,
      highCount,
      mediumCount,
      lowCount
    );

    return { filePath, sharedValues, issues, summary };
  }

  /**
   * v0.4.1: Check if a given position in the source is inside a worklet context.
   * A worklet context is one of: useAnimatedStyle, useDerivedValue,
   * useAnimatedReaction, useAnimatedProps, runOnUI.
   */
  private isInsideWorkletContext(source: string, position: number): boolean {
    // Walk backwards from the position to find the nearest enclosing worklet context
    const searchStart = Math.max(0, position - 2000);
    const before = source.substring(searchStart, position);

    for (const ctx of WORKLET_CONTEXTS) {
      // Find the last occurrence of the worklet context before the position
      const regex = new RegExp(`${ctx}\\s*\\(`, 'g');
      let ctxMatch: RegExpExecArray | null;
      let lastMatchIndex = -1;

      while ((ctxMatch = regex.exec(before)) !== null) {
        lastMatchIndex = ctxMatch.index;
      }

      if (lastMatchIndex >= 0) {
        // Check that the position is within the parens of this worklet context
        const afterCtx = before.substring(lastMatchIndex);
        let depth = 0;
        let inParens = false;
        for (let i = 0; i < afterCtx.length; i++) {
          const ch = afterCtx[i];
          if (ch === '(') { depth++; inParens = true; }
          else if (ch === ')') { depth--; if (depth === 0) break; }
        }
        if (depth > 0) {
          return true; // Position is inside this worklet context
        }
      }
    }

    return false;
  }
}
