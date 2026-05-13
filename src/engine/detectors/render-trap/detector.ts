// ============================================================
// detector.ts — React.memo Enforcer
// Scans .tsx/.jsx files for inline functions, inline objects,
// and inline arrays passed as props to React.memo() wrapped
// components. These create new references every render,
// completely defeating memoization.
//
// v4.0: Added deep hook data-flow tracing. Detects inline
// objects/functions passed to custom hooks (non-React built-in
// hooks) that may propagate to memoized children inside the
// hook. This catches traps that are invisible at the JSX level.
//
// v0.10.0: Added HOC unwrapping for export default memo(styled(X)),
//   memo(connect(...)(X)), memo(withNavigation(Comp)), etc.
// ============================================================

import * as fs from 'fs';
import { RenderTrap, RenderTrapReport } from '../../../domain/types/index.js';
import { getLineNumber, extractContext, findParentComponent } from '../../utils/SourceLocationUtils.js';

// ─── v4.0: Known React built-in hooks — these are filtered out
// from hook parameter tracing since they don't propagate to
// memoized children (they manage state/effects internally).
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

export class RenderTrapDetector {
  /**
   * Scan a .tsx/.jsx file for render traps.
   */
  detect(filePath: string): RenderTrapReport {
    const source = fs.readFileSync(filePath, 'utf-8');
    const traps: RenderTrap[] = [];

    // ─── 1. Find memoized component names ─────────────────────
    // Pattern: const CompName = React.memo(...) or const CompName = memo(...)
    // Also: export default React.memo(...) or export default memo(...)
    // v0.8.0: Fixed export-awareness — now correctly extracts the component
    // name from export default React.memo(ComponentName) by capturing the
    // argument passed to memo().
    const memoizedComponents = new Set<string>();

    // Pattern 1: const CompName = React.memo(...) or const CompName = memo(...)
    const memoDeclRegex = /const\s+(\w+)\s*=\s*(?:React\.)?memo\s*\(/g;
    let match: RegExpExecArray | null;

    while ((match = memoDeclRegex.exec(source)) !== null) {
      memoizedComponents.add(match[1]);
    }

    // Pattern 2: export default React.memo(ComponentName) or export default memo(ComponentName)
    // v0.8.0: Uses brace-matching to extract the argument name from memo(...)
    // v0.10.0: Added HOC unwrapping — handles memo(styled(X)), memo(connect(...)(X)),
    //   memo(withNavigation(Comp)), etc. by recursively extracting the inner component name.
    const exportMemoRegex = /export\s+default\s+(?:React\.)?memo\s*\(/g;
    while ((match = exportMemoRegex.exec(source)) !== null) {
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
      const argRaw = source.substring(argsStart, pos - 1).trim();
      // v0.10.0: Recursively unwrap HOC calls to find the inner component name
      // Handles: memo(styled(X)), memo(connect(...)(X)), memo(withNavigation(Comp))
      const innerName = this.unwrapHOC(argRaw);
      if (innerName && /^[A-Z]/.test(innerName)) {
        memoizedComponents.add(innerName);
      }
    }

    // Pattern 3: React.memo(function CompName(...) — inline memo with named function
    const inlineMemoRegex = /(?:React\.)?memo\s*\(\s*function\s+(\w+)/g;
    while ((match = inlineMemoRegex.exec(source)) !== null) {
      memoizedComponents.add(match[1]);
    }

    // Pattern 4 (v0.9.0): Export-Awareness — detect memoized components that are
    // exported via a separate export statement after declaration.
    // Handles:
    //   const Comp = React.memo(InnerComponent);
    //   export { Comp };           // Pattern 1 already catches 'Comp'
    //   export default Comp;       // Pattern 1 already catches 'Comp'
    //
    // The real gap this fills: detecting when a component is wrapped with memo()
    // via a variable that is then exported under a DIFFERENT name:
    //   const _Comp = React.memo(InnerComponent);
    //   export { _Comp as Comp };  // 'Comp' is memoized but not caught by Pattern 1
    //
    // Also handles: export { default as Comp } from './module' where the default
    // is memoized — but this is cross-file and out of scope for single-file analysis.
    // For now, Pattern 4 detects rename exports of already-memoized components.
    const renameExportRegex = /export\s*\{\s*(\w+)\s+as\s+(\w+)\s*\}/g;
    while ((match = renameExportRegex.exec(source)) !== null) {
      const sourceName = match[1];
      const exportedName = match[2];
      // If the source name is a memoized component, the exported name is also memoized
      if (memoizedComponents.has(sourceName)) {
        memoizedComponents.add(exportedName);
      }
    }

    if (memoizedComponents.size === 0) {
      return {
        filePath,
        traps: [],
        summary: '✅ No React.memo() components found in this file. Render trap scan skipped.',
      };
    }

    // ─── 2. For each memoized component, find its usages ─────
    // and check parent for inline props
    for (const compName of memoizedComponents) {
      // Find JSX usages: <CompName ...> or <CompName .../>
      const usageRegex = new RegExp(`<${compName}([^>]*)>`, 'g');

      while ((match = usageRegex.exec(source)) !== null) {
        const propsStr = match[1];
        const matchIndex = match.index;

        // ── TS type-annotation filter ─────────────────────────
        const beforeMatch = source.substring(Math.max(0, matchIndex - 10), matchIndex).trim();
        if (beforeMatch.endsWith(':') || beforeMatch.endsWith('):') || beforeMatch.endsWith('>:')) {
          continue;
        }
        const lineStart = source.lastIndexOf('\n', matchIndex) + 1;
        const lineBefore = source.substring(lineStart, matchIndex).trim();
        if (lineBefore.startsWith('import ') || lineBefore.startsWith('import{')) {
          continue;
        }
        const charBefore = matchIndex > 0 ? source[matchIndex - 1] : '';
        if (charBefore && /[a-zA-Z0-9_>)]/.test(charBefore)) {
          continue;
        }

        // ── Find the parent component name ────────────────────
        const parentName = findParentComponent(source, matchIndex);

        // ── Check for inline arrow functions ──────────────────
        // Pattern: onPress={() => ...}, onScroll={(e) => ...}, etc.
        const inlineFuncRegex = /(on[A-Z]\w+|render[A-Z]\w+)\s*=\s*\{\([^)]*\)\s*=>/g;
        let propMatch: RegExpExecArray | null;
        while ((propMatch = inlineFuncRegex.exec(propsStr)) !== null) {
          const lineNumber = getLineNumber(source, matchIndex + propMatch.index);
          traps.push({
            severity: 'high',
            component: compName,
            propName: propMatch[1],
            propType: 'inline-function',
            parentComponent: parentName || 'unknown',
            lineContext: extractContext(propsStr, propMatch.index, 50),
            lineNumber,
            suggestion: `Extract the inline function passed to "${propMatch[1]}" into a useCallback() hook:\n  const handle${propMatch[1].replace(/^on/, '')} = useCallback(() => { ... }, []);`,
          });
        }

        // ── Check for inline object literals ──────────────────
        // Pattern: style={{ ... }}, contentContainerStyle={{ ... }}, etc.
        // Must NOT be a single prop (that's just one style object)
        const inlineObjRegex = /(\w+)\s*=\s*\{\{/g;
        while ((propMatch = inlineObjRegex.exec(propsStr)) !== null) {
          // Skip if this is a self-closing brace pair {{ }}
          const afterOpen = propsStr.substring(propMatch.index + propMatch[0].length);
          if (afterOpen.startsWith('}}')) continue;

          const lineNumber = getLineNumber(source, matchIndex + propMatch.index);
          traps.push({
            severity: 'medium',
            component: compName,
            propName: propMatch[1],
            propType: 'inline-object',
            parentComponent: parentName || 'unknown',
            lineContext: extractContext(propsStr, propMatch.index, 50),
            lineNumber,
            suggestion: `Extract the inline object passed to "${propMatch[1]}" into a memoized value:\n  const ${propMatch[1]}Value = useMemo(() => ({ ... }), []);`,
          });
        }

        // ── Check for inline array literals ───────────────────
        // Pattern: data={[...]}, etc.
        const inlineArrRegex = /(\w+)\s*=\s*\{\[/g;
        while ((propMatch = inlineArrRegex.exec(propsStr)) !== null) {
          const lineNumber = getLineNumber(source, matchIndex + propMatch.index);
          traps.push({
            severity: 'medium',
            component: compName,
            propName: propMatch[1],
            propType: 'inline-array',
            parentComponent: parentName || 'unknown',
            lineContext: extractContext(propsStr, propMatch.index, 50),
            lineNumber,
            suggestion: `Extract the inline array passed to "${propMatch[1]}" into a memoized value:\n  const ${propMatch[1]}Value = useMemo(() => [ ... ], []);`,
          });
        }
      }
    }

    // ─── v4.0: Deep hook data-flow tracing ───────────────────
    // Detect inline objects/functions passed to custom hooks
    // that may propagate to memoized children inside the hook.
    // Pattern: useMyHook({ config: {} }) or useMyHook({ onEvent: () => {} })
    // Filter out React built-in hooks to avoid noise.
    const hookCallRegex = /use([A-Z]\w+)\s*\(\s*\{/g;
    while ((match = hookCallRegex.exec(source)) !== null) {
      const hookName = `use${match[1]}`;
      // Skip React built-in hooks
      if (REACT_BUILT_IN_HOOKS.has(hookName)) continue;

      const callStart = match.index + match[0].length - 1; // position of the opening {
      const lineNumber = getLineNumber(source, match.index);

      // Extract the object literal by brace-matching
      let depth = 1;
      let pos = callStart + 1;
      while (depth > 0 && pos < source.length) {
        const ch = source[pos];
        if (ch === '{') depth++;
        else if (ch === '}') depth--;
        pos++;
      }
      const objectBody = source.substring(callStart, pos);

      // Check for inline functions inside the hook config
      const inlineFuncInHook = /:\s*\([^)]*\)\s*=>/g;
      if (inlineFuncInHook.test(objectBody)) {
        traps.push({
          severity: 'medium',
          component: hookName,
          propName: 'hook-config',
          propType: 'inline-function',
          parentComponent: findParentComponent(source, match.index) || 'unknown',
          lineContext: extractContext(objectBody, 0, 60),
          lineNumber,
          suggestion: `The inline function passed to "${hookName}()" may be forwarded to a memoized child inside the hook. Extract it with useCallback:\n  const handleEvent = useCallback(() => { ... }, []);\n  ${hookName}({ onEvent: handleEvent });`,
        });
      }

      // Check for inline objects inside the hook config
      const inlineObjInHook = /:\s*\{/g;
      // Reset lastIndex
      inlineObjInHook.lastIndex = 0;
      if (inlineObjInHook.test(objectBody)) {
        traps.push({
          severity: 'medium',
          component: hookName,
          propName: 'hook-config',
          propType: 'inline-object',
          parentComponent: findParentComponent(source, match.index) || 'unknown',
          lineContext: extractContext(objectBody, 0, 60),
          lineNumber,
          suggestion: `The inline object passed to "${hookName}()" may be forwarded to a memoized child inside the hook. Extract it with useMemo:\n  const config = useMemo(() => ({ ... }), []);\n  ${hookName}(config);`,
        });
      }
    }

    // ─── Summary ─────────────────────────────────────────────
    const highCount = traps.filter((t) => t.severity === 'high').length;
    const mediumCount = traps.filter((t) => t.severity === 'medium').length;

    let summary: string;
    if (highCount > 0) {
      summary = `⚠️  Found ${highCount} high-severity render trap(s) (inline functions) that completely defeat React.memo. Also found ${mediumCount} medium-severity trap(s) (inline objects/arrays/hook-propagated).`;
    } else if (mediumCount > 0) {
      summary = `🔶 Found ${mediumCount} medium-severity render trap(s) (inline objects/arrays/hook-propagated) that may cause unnecessary re-renders.`;
    } else {
      summary = `✅ No render traps detected. All props to memoized components are stable references.`;
    }

    return { filePath, traps, summary };
  }

  /**
   * v0.10.0: Recursively unwrap HOC (Higher-Order Component) wrappers to find
   * the inner component name. Handles patterns like:
   *   styled(X)           → X
   *   connect(...)(X)     → X
   *   withNavigation(Comp) → Comp
   *   withStyles(withNavigation(Comp)) → Comp
   *
   * Returns the innermost component name, or the original string if no HOC pattern is found.
   */
  private unwrapHOC(expr: string): string {
    let current = expr.trim();

    // Loop to handle chained HOCs: withStyles(withNavigation(Comp))
    while (true) {
      // Pattern: xxxXxx(...) — a function call where the function name starts with lowercase
      // or is a known HOC pattern (styled, connect, inject, with*, etc.)
      const hocCallMatch = current.match(/^(?:[a-z][a-zA-Z0-9]*|with[A-Z][a-zA-Z0-9]*|connect|inject|enhance)\s*\(/);
      if (!hocCallMatch) break;

      // Find the matching closing paren for this HOC call
      const callStart = hocCallMatch[0].length;
      let depth = 1;
      let pos = callStart;
      while (depth > 0 && pos < current.length) {
        const ch = current[pos];
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        pos++;
      }

      // Check if there's a curried call after: connect(...)(X)
      const afterParen = current.substring(pos).trim();
      const curriedMatch = afterParen.match(/^\(/);
      if (curriedMatch) {
        // Skip the curried call's parens
        let curryDepth = 1;
        let curryPos = 1;
        while (curryDepth > 0 && curryPos < afterParen.length) {
          const ch = afterParen[curryPos];
          if (ch === '(') curryDepth++;
          else if (ch === ')') curryDepth--;
          curryPos++;
        }
        // The inner component is inside the curried call
        const innerRaw = afterParen.substring(1, curryPos - 1).trim();
        current = innerRaw;
      } else {
        // The inner component is the first argument of the HOC
        const innerRaw = current.substring(callStart, pos - 1).trim();
        current = innerRaw;
      }
    }

    return current;
  }
}

// ─── Helpers (moved to src/engine/utils/SourceLocationUtils.ts) ──
// getLineNumber, extractContext, and findParentComponent are now
// imported from the shared SourceLocationUtils module.
