// ============================================================
// hook-resolver.ts — Cross-file hook resolution and hook chaining
// v0.10.0: Resolves custom hook definitions from imported files,
// performs hook chaining (recursive resolution of hooks that
// call other hooks), and caches results for performance.
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { HookDefinition } from './detector.js';

// ─── v0.10.0: Cache for cross-file hook analysis results
// Key: resolved file path, Value: hook definitions map
const crossFileHookCache = new Map<string, Map<string, HookDefinition>>();

// ─── Known React built-in hooks — filtered out from hook propagation tracing
const REACT_BUILT_IN_HOOKS = new Set([
  'useState', 'useEffect', 'useRef', 'useCallback', 'useMemo',
  'useContext', 'useReducer', 'useImperativeHandle', 'useLayoutEffect',
  'useDebugValue', 'useDerivedValue', 'useAnimatedStyle', 'useSharedValue',
  'useAnimatedProps', 'useAnimatedReaction', 'useWorkletCallback',
  'useEvent', 'useHandler', 'useFocusEffect', 'useNavigation',
  'useRoute', 'useTheme', 'useTranslation', 'useDispatch',
  'useSelector', 'useStore',
]);

/**
 * v0.10.0: Resolve cross-file custom hook definitions by following
 * import statements. Analyzes imported hook files for useState/useEffect/setState
 * and merges results into the local hook definitions map.
 *
 * Also performs hook chaining: if a resolved hook calls another custom hook,
 * recursively resolve that hook too.
 */
export function resolveCrossFileHooks(
  filePath: string,
  source: string,
  localHooks: Map<string, HookDefinition>
): void {
  const dir = path.dirname(filePath);

  // Find all relative imports
  const importRegex = /from\s+['"](\.[^'"]+)['"]/g;
  let importMatch: RegExpExecArray | null;

  while ((importMatch = importRegex.exec(source)) !== null) {
    const importPath = importMatch[1];
    const resolvedPath = path.resolve(dir, importPath);

    // Try common extensions
    const extensions = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts'];
    for (const ext of extensions) {
      const fullPath = resolvedPath.endsWith(ext)
        ? resolvedPath
        : resolvedPath + ext;

      if (fs.existsSync(fullPath)) {
        // Check cache first
        if (crossFileHookCache.has(fullPath)) {
          const cached = crossFileHookCache.get(fullPath)!;
          for (const [hookName, def] of cached) {
            if (!localHooks.has(hookName)) {
              localHooks.set(hookName, def);
            }
          }
          break;
        }

        try {
          const importedSource = fs.readFileSync(fullPath, 'utf-8');
          const importedHooks = scanHookDefinitions(importedSource);

          // v0.10.0: Hook chaining — recursively resolve hooks that
          // the imported hooks call internally
          resolveHookChaining(fullPath, importedSource, importedHooks);

          // Cache the results
          crossFileHookCache.set(fullPath, new Map(importedHooks));

          // Merge into local hooks
          for (const [hookName, def] of importedHooks) {
            if (!localHooks.has(hookName)) {
              localHooks.set(hookName, def);
            }
          }
        } catch {
          // Silently skip unreadable files
        }
        break; // Found a valid file, stop trying extensions
      }
    }
  }
}

/**
 * v0.10.0: Hook chaining — recursively resolve custom hooks that are
 * called inside other custom hooks. For example, if useMyHook() calls
 * useTheirHook(), we resolve useTheirHook() too.
 */
function resolveHookChaining(
  filePath: string,
  source: string,
  hooks: Map<string, HookDefinition>
): void {
  const dir = path.dirname(filePath);

  // For each hook definition, scan its body for calls to other custom hooks
  for (const [hookName, def] of hooks) {
    // Find the hook's body
    const hookRegex = new RegExp(`(?:const\\s+${hookName}\\s*=\\s*(?:\\([^)]*\\)\\s*)?=>|function\\s+${hookName}\\s*\\()`);
    const hookMatch = hookRegex.exec(source);
    if (!hookMatch) continue;

    // Extract the body
    const sigEnd = hookMatch.index + hookMatch[0].length;
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
        bodyStart = i + 2;
        foundBody = true;
        break;
      }
    }
    if (!foundBody) continue;

    if (depth > 0) {
      let pos = bodyStart;
      while (depth > 0 && pos < source.length) {
        if (source[pos] === '{') depth++;
        else if (source[pos] === '}') depth--;
        pos++;
      }
      const body = source.substring(bodyStart, pos - 1);

      // Scan for calls to other custom hooks
      const hookCallRegex = /use([A-Z]\w+)\s*\(/g;
      let callMatch: RegExpExecArray | null;
      while ((callMatch = hookCallRegex.exec(body)) !== null) {
        const calledHookName = `use${callMatch[1]}`;
        if (REACT_BUILT_IN_HOOKS.has(calledHookName)) continue;
        if (hooks.has(calledHookName)) continue; // Already resolved

        // Try to find this hook in the same file first
        const calledHookDef = findHookInSource(source, calledHookName);
        if (calledHookDef) {
          hooks.set(calledHookName, calledHookDef);
          // Recursively resolve this hook's dependencies too
          resolveHookChaining(filePath, source, hooks);
        } else {
          // Try to resolve from imports
          const importRegex = /from\s+['"](\.[^'"]+)['"]/g;
          let importMatch: RegExpExecArray | null;
          while ((importMatch = importRegex.exec(source)) !== null) {
            const importPath = importMatch[1];
            const resolvedPath = path.resolve(dir, importPath);
            const extensions = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts'];
            for (const ext of extensions) {
              const fullPath = resolvedPath.endsWith(ext)
                ? resolvedPath
                : resolvedPath + ext;
              if (fs.existsSync(fullPath)) {
                try {
                  const importedSource = fs.readFileSync(fullPath, 'utf-8');
                  const importedHookDef = findHookInSource(importedSource, calledHookName);
                  if (importedHookDef) {
                    hooks.set(calledHookName, importedHookDef);
                    // Recursively resolve this hook's dependencies
                    resolveHookChaining(fullPath, importedSource, hooks);
                  }
                } catch {
                  // Silently skip
                }
                break;
              }
            }
          }
        }
      }
    }
  }
}

/**
 * v0.10.0: Find a specific hook definition in source text.
 * Returns the HookDefinition or undefined if not found.
 */
function findHookInSource(source: string, hookName: string): HookDefinition | undefined {
  const hookRegex = new RegExp(`(?:const\\s+${hookName}\\s*=\\s*(?:\\([^)]*\\)\\s*)?=>|function\\s+${hookName}\\s*\\()`);
  const match = hookRegex.exec(source);
  if (!match) return undefined;

  const sigEnd = match.index + match[0].length;
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
      bodyStart = i + 2;
      foundBody = true;
      break;
    }
  }
  if (!foundBody) return undefined;

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

    const setStateRegex = /\b(set[A-Z]\w+)\s*\(/g;
    let setMatch: RegExpExecArray | null;
    while ((setMatch = setStateRegex.exec(body)) !== null) {
      def.hasSetState = true;
      def.setterNames.push(setMatch[1]);
    }

    return def;
  }

  return undefined;
}

/**
 * Scan the source for custom hook definitions and analyze
 * their internal state management to detect indirect bridge crossings.
 *
 * A "custom hook" is any function named useXxx that is defined in the file.
 * We scan its body for useState, useEffect, and setState calls.
 *
 * Returns a map of hook name → HookDefinition with flags for each crossing type.
 */
function scanHookDefinitions(source: string): Map<string, HookDefinition> {
  const hooks = new Map<string, HookDefinition>();

  const hookDeclRegex = /(?:const\s+(use[A-Z]\w+)\s*=\s*(?:\([^)]*\)\s*)?=>|function\s+(use[A-Z]\w+)\s*\()/g;
  let match: RegExpExecArray | null;

  while ((match = hookDeclRegex.exec(source)) !== null) {
    const hookName = match[1] || match[2];
    if (!hookName) continue;
    if (REACT_BUILT_IN_HOOKS.has(hookName)) continue;

    const sigEnd = match.index + match[0].length;
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
        bodyStart = i + 2;
        foundBody = true;
        break;
      }
    }
    if (!foundBody) continue;

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
