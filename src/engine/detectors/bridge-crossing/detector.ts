// ============================================================
// detector.ts — Core BridgeCrossingDetector class
// UI Thread Guardian: scans .tsx/.jsx files for useState/useEffect
// inside onScroll, onLayout, onAnimated, gesture handlers, and
// worklet functions. These "bridge crossings" block the UI thread
// and cause jank.
//
// v0.9.0: Added Hook Propagation — detects custom hook calls
//   inside handlers that may contain indirect setState/useState calls.
// v0.10.0: Added cross-file hook resolution, hook chaining, and
//   extended handler coverage.
// ============================================================

import * as fs from 'fs';
import { BridgeCrossing, BridgeCrossingReport } from '../../../domain/types/index.js';
import { getLineNumber, extractContext } from '../../utils/SourceLocationUtils.js';
import { resolveCrossFileHooks } from './hook-resolver.js';

// ─── v0.9.0: Known React built-in hooks — these are filtered out
// from hook propagation tracing since they don't cause indirect
// bridge crossings (they manage state/effects internally).
const REACT_BUILT_IN_HOOKS = new Set([
  'useState',
  'useEffect',
  'useRef',
  'useCallback',
  'useMemo',
  'useContext',
  'useReducer',
  'useImperativeHandle',
  'useLayoutEffect',
  'useDebugValue',
  'useDerivedValue',
  'useAnimatedStyle',
  'useSharedValue',
  'useAnimatedProps',
  'useAnimatedReaction',
  'useWorkletCallback',
  'useEvent',
  'useHandler',
  'useFocusEffect',
  'useNavigation',
  'useRoute',
  'useTheme',
  'useTranslation',
  'useDispatch',
  'useSelector',
  'useStore',
]);

// ─── v0.10.0: Extended handler patterns — covers scroll events,
// momentum events, and gesture handler lifecycle events.
const HANDLER_PATTERNS = [
  'onScroll',
  'onLayout',
  'onAnimated',
  'onGestureEvent',
  'onStart',
  'onUpdate',
  'onEnd',
  'onScrollBeginDrag',
  'onScrollEndDrag',
  'onMomentumScrollBegin',
  'onMomentumScrollEnd',
  'onBegin',
  'onActivated',
  'onTouchesDown',
  'onTouchesMove',
  'onTouchesUp',
  'onPanGesture',
];

/**
 * v0.9.0: Definition of a custom hook's internal state management.
 * Used by BridgeCrossingDetector to detect indirect bridge crossings.
 */
export interface HookDefinition {
  /** Whether the hook contains useState calls */
  hasUseState: boolean;
  /** Whether the hook contains useEffect calls */
  hasUseEffect: boolean;
  /** Whether the hook contains setState calls (setXxx) */
  hasSetState: boolean;
  /** Names of setter functions found in the hook */
  setterNames: string[];
}

export class BridgeCrossingDetector {
  /**
   * Scan a .tsx/.jsx file for bridge crossings.
   */
  detect(filePath: string): BridgeCrossingReport {
    const source = fs.readFileSync(filePath, 'utf-8');
    const crossings: BridgeCrossing[] = [];

    // ─── v0.9.0: Pre-scan for custom hook definitions ────────
    // Build a map of hook name → { hasUseState, hasUseEffect, hasSetState }
    // This allows us to detect indirect crossings when a handler calls a hook.
    const hookDefinitions = this.scanHookDefinitions(source);

    // ─── v0.10.0: Resolve cross-file hooks ───────────────────
    // Follow imports to find external custom hook definitions
    // and merge them into the local hook definitions map.
    resolveCrossFileHooks(filePath, source, hookDefinitions);

    // ─── 1. Find all handler attributes with brace bodies ─────
    // Build regex from the extended handler patterns list
    const handlerRegex = new RegExp(`(${HANDLER_PATTERNS.join('|')})\\s*=\\s*\\{`, 'g');
    let match: RegExpExecArray | null;

    while ((match = handlerRegex.exec(source)) !== null) {
      const handlerName = match[1];
      const bodyStart = match.index + match[0].length;

      // Extract the handler body by brace-matching
      let depth = 1;
      let pos = bodyStart;
      while (depth > 0 && pos < source.length) {
        const ch = source[pos];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        pos++;
      }
      const body = source.substring(bodyStart, pos - 1);

      // Determine severity based on handler type
      const severity: 'high' | 'medium' =
        (handlerName === 'onScroll' || handlerName === 'onLayout')
          ? 'high'
          : 'medium';

      // ── Scan for useState ──────────────────────────────────
      const useStateRegex = /\buseState\s*\(/g;
      let stateMatch: RegExpExecArray | null;
      while ((stateMatch = useStateRegex.exec(body)) !== null) {
        const lineNumber = getLineNumber(source, match.index + stateMatch.index);
        crossings.push({
          severity,
          handler: handlerName,
          culprit: 'useState',
          lineContext: extractContext(body, stateMatch.index, 60),
          lineNumber,
          suggestion: severity === 'high'
            ? `Move useState outside of ${handlerName}. Use useRef or SharedValues for animation-related state, or lift state up to the component body.`
            : `Consider moving useState outside of ${handlerName} to avoid unnecessary re-renders during animations.`,
        });
      }

      // ── Scan for useEffect ─────────────────────────────────
      const useEffectRegex = /\buseEffect\s*\(/g;
      while ((stateMatch = useEffectRegex.exec(body)) !== null) {
        const lineNumber = getLineNumber(source, match.index + stateMatch.index);
        crossings.push({
          severity,
          handler: handlerName,
          culprit: 'useEffect',
          lineContext: extractContext(body, stateMatch.index, 60),
          lineNumber,
          suggestion: severity === 'high'
            ? `Move useEffect outside of ${handlerName}. Effects inside event handlers are almost always a bug — use useAnimatedStyle or runOnJS for worklet-to-JS communication.`
            : `Consider moving useEffect outside of ${handlerName} to avoid side-effect cascades during animations.`,
        });
      }

      // ── Scan for setState calls ────────────────────────────
      // Match: setXxx(...) where Xxx is a capitalized state setter
      const setStateRegex = /\b(set[A-Z]\w+)\s*\(/g;
      while ((stateMatch = setStateRegex.exec(body)) !== null) {
        const lineNumber = getLineNumber(source, match.index + stateMatch.index);
        crossings.push({
          severity,
          handler: handlerName,
          culprit: stateMatch[1],
          lineContext: extractContext(body, stateMatch.index, 60),
          lineNumber,
          suggestion: severity === 'high'
            ? `Replace ${stateMatch[1]}() inside ${handlerName} with a SharedValue mutation. Direct setState calls in UI-thread handlers cause layout thrashing.`
            : `Consider replacing ${stateMatch[1]}() with a SharedValue mutation to avoid re-render cascades.`,
        });
      }

      // ── v0.9.0: Scan for custom hook calls (Hook Propagation) ──
      // Detect calls to custom hooks inside handlers that may contain
      // indirect setState/useState/useEffect calls.
      const hookCallRegex = /use([A-Z]\w+)\s*\(/g;
      while ((stateMatch = hookCallRegex.exec(body)) !== null) {
        const hookName = `use${stateMatch[1]}`;
        // Skip React built-in hooks
        if (REACT_BUILT_IN_HOOKS.has(hookName)) continue;

        // Check if this hook is defined in the file and contains crossings
        const hookDef = hookDefinitions.get(hookName);
        if (!hookDef) {
          // Hook is imported from another file — we can't trace it
          // But we can flag it as a potential indirect crossing
          const lineNumber = getLineNumber(source, match.index + stateMatch.index);
          crossings.push({
            severity,
            handler: handlerName,
            culprit: `${hookName} (external)`,
            lineContext: extractContext(body, stateMatch.index, 60),
            lineNumber,
            suggestion: `Custom hook "${hookName}" is called inside ${handlerName}. This hook is imported from another file and may contain indirect setState/useState calls. Audit "${hookName}" for bridge crossings.`,
          });
          continue;
        }

        // Hook is defined locally — report its internal crossings
        if (hookDef.hasUseState) {
          const lineNumber = getLineNumber(source, match.index + stateMatch.index);
          crossings.push({
            severity,
            handler: handlerName,
            culprit: `${hookName} → useState`,
            lineContext: extractContext(body, stateMatch.index, 60),
            lineNumber,
            suggestion: `Custom hook "${hookName}" (called inside ${handlerName}) contains useState. This creates an indirect bridge crossing. Refactor "${hookName}" to use SharedValues instead of useState, or move the hook call outside the handler.`,
          });
        }
        if (hookDef.hasUseEffect) {
          const lineNumber = getLineNumber(source, match.index + stateMatch.index);
          crossings.push({
            severity,
            handler: handlerName,
            culprit: `${hookName} → useEffect`,
            lineContext: extractContext(body, stateMatch.index, 60),
            lineNumber,
            suggestion: `Custom hook "${hookName}" (called inside ${handlerName}) contains useEffect. This creates an indirect bridge crossing. Refactor "${hookName}" to avoid effects, or move the hook call outside the handler.`,
          });
        }
        if (hookDef.hasSetState) {
          const lineNumber = getLineNumber(source, match.index + stateMatch.index);
          crossings.push({
            severity,
            handler: handlerName,
            culprit: `${hookName} → ${hookDef.setterNames.join('/')}`,
            lineContext: extractContext(body, stateMatch.index, 60),
            lineNumber,
            suggestion: `Custom hook "${hookName}" (called inside ${handlerName}) contains setState calls (${hookDef.setterNames.join(', ')}). This creates an indirect bridge crossing. Refactor "${hookName}" to use SharedValues, or move the hook call outside the handler.`,
          });
        }
      }
    }

    // ─── 2. Scan worklet functions ────────────────────────────
    // Pattern: 'worklet' function declarations
    const workletRegex = /'worklet'\s*;?\s*\n?\s*(?:const\s+\w+\s*=\s*)?(?:function\s*)?\(/g;
    while ((match = workletRegex.exec(source)) !== null) {
      const bodyStart = match.index + match[0].length;

      // Extract worklet body by brace-matching
      let depth = 1;
      let pos = bodyStart;
      while (depth > 0 && pos < source.length) {
        const ch = source[pos];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        pos++;
      }
      const body = source.substring(bodyStart, pos - 1);

      // Worklets run on the UI thread — any setState/useState/useEffect is a crossing
      const workletSetStateRegex = /\b(set[A-Z]\w+)\s*\(/g;
      let wsMatch: RegExpExecArray | null;
      while ((wsMatch = workletSetStateRegex.exec(body)) !== null) {
        const lineNumber = getLineNumber(source, match.index + wsMatch.index);
        crossings.push({
          severity: 'high',
          handler: 'worklet',
          culprit: wsMatch[1],
          lineContext: extractContext(body, wsMatch.index, 60),
          lineNumber,
          suggestion: `Worklet functions run on the UI thread. Use runOnJS(${wsMatch[1]})() to call ${wsMatch[1]} on the JS thread, or use SharedValues for UI-thread-safe state.`,
        });
      }
    }

    // ─── Summary ─────────────────────────────────────────────
    const highCount = crossings.filter((c) => c.severity === 'high').length;
    const mediumCount = crossings.filter((c) => c.severity === 'medium').length;

    let summary: string;
    if (highCount > 0) {
      summary = `⚠️  Found ${highCount} high-severity bridge crossing(s) that block the UI thread and cause jank.`;
    } else if (mediumCount > 0) {
      summary = `🔶 Found ${mediumCount} medium-severity bridge crossing(s) that may cause performance issues.`;
    } else {
      summary = `✅ No bridge crossings detected. All handlers are UI-thread safe.`;
    }

    return { filePath, crossings, summary };
  }

  /**
   * v0.9.0: Scan the source for custom hook definitions and analyze
   * their internal state management to detect indirect bridge crossings.
   *
   * A "custom hook" is any function named useXxx that is defined in the file.
   * We scan its body for useState, useEffect, and setState calls.
   *
   * Returns a map of hook name → HookDefinition with flags for each crossing type.
   */
  scanHookDefinitions(source: string): Map<string, HookDefinition> {
    const hooks = new Map<string, HookDefinition>();

    // Pattern 1: const useMyHook = () => { ... }
    // Pattern 2: function useMyHook() { ... }
    // Pattern 3: export function useMyHook() { ... }
    const hookDeclRegex = /(?:const\s+(use[A-Z]\w+)\s*=\s*(?:\([^)]*\)\s*)?=>|function\s+(use[A-Z]\w+)\s*\()/g;
    let match: RegExpExecArray | null;

    while ((match = hookDeclRegex.exec(source)) !== null) {
      const hookName = match[1] || match[2];
      if (!hookName) continue;
      if (REACT_BUILT_IN_HOOKS.has(hookName)) continue;

      // Find the body start — skip past the function signature
      const sigEnd = match.index + match[0].length;
      // Find the opening brace of the function body
      let bodyStart = sigEnd;
      let depth = 0;
      let foundBody = false;
      for (let i = sigEnd; i < source.length; i++) {
        if (source[i] === '{') {
          bodyStart = i + 1;
          depth = 1;
          foundBody = true;
          break;
        }
        if (source[i] === '(') depth++;
        if (source[i] === ')') depth--;
        if (depth === 0 && source[i] === '=' && source[i + 1] === '>') {
          // Arrow function with implicit return — skip past the =>
          bodyStart = i + 2;
          foundBody = true;
          break;
        }
      }
      if (!foundBody) continue;

      // Extract the body by brace-matching
      if (depth > 0) {
        let pos = bodyStart;
        while (depth > 0 && pos < source.length) {
          if (source[pos] === '{') depth++;
          else if (source[pos] === '}') depth--;
          pos++;
        }
        const body = source.substring(bodyStart, pos - 1);

        const def: HookDefinition = {
          hasUseState: /\buseState\s*\(/.test(body),
          hasUseEffect: /\buseEffect\s*\(/.test(body),
          hasSetState: false,
          setterNames: [],
        };

        // Scan for setState calls
        const setStateRegex = /\b(set[A-Z]\w+)\s*\(/g;
        let setMatch: RegExpExecArray | null;
        while ((setMatch = setStateRegex.exec(body)) !== null) {
          def.hasSetState = true;
          def.setterNames.push(setMatch[1]);
        }

        hooks.set(hookName, def);
      }
    }

    return hooks;
  }
}
