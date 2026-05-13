// ============================================================
// delegated-values.ts — Custom Hook SharedValue Detection
// v0.10.0: Traces SharedValues created inside custom hooks
// (useMySharedValue = () => { const sv = useSharedValue(0); ... })
// and reports them as "delegated" SharedValues.
//
// Also scans imported files for hooks that create SharedValues.
// ============================================================

import * as fs from 'fs';
import * as path from 'path';

/**
 * v0.10.0: Information about a SharedValue created inside a custom hook.
 */
export interface DelegatedSharedValue {
  /** The SharedValue name */
  name: string;
  /** The hook that creates it */
  hookName: string;
  /** File where the hook is defined */
  hookFile: string;
  /** Whether the hook is local or imported */
  isLocal: boolean;
}

/**
 * v0.10.0: Detect custom hooks defined in the file that create SharedValues.
 * A "delegated SharedValue" is one created inside a custom hook (useXxx)
 * rather than directly in a component. The tracer reports these so the user
 * knows the lineage originates in the hook, not the current file.
 *
 * Also scans imported files for hooks that create SharedValues.
 */
export function detectDelegatedSharedValues(source: string, filePath: string): DelegatedSharedValue[] {
  const delegated: DelegatedSharedValue[] = [];
  const dir = path.dirname(filePath);

  // Pattern: const useMyHook = () => { const sv = useSharedValue(0); ... }
  // Pattern: function useMyHook() { const sv = useSharedValue(0); ... }
  const hookDeclRegex = /(?:const\s+(use[A-Z]\w+)\s*=\s*(?:\([^)]*\)\s*)?=>|function\s+(use[A-Z]\w+)\s*\()/g;
  let match: RegExpExecArray | null;

  while ((match = hookDeclRegex.exec(source)) !== null) {
    const hookName = match[1] || match[2];
    if (!hookName) continue;

    // Find the hook body
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

      // Scan for useSharedValue inside the hook body
      const svInHookRegex = /const\s+(\w+)\s*=\s*useSharedValue\s*\(/g;
      let svMatch: RegExpExecArray | null;
      while ((svMatch = svInHookRegex.exec(body)) !== null) {
        delegated.push({
          name: svMatch[1],
          hookName,
          hookFile: filePath,
          isLocal: true,
        });
      }
    }
  }

  // Also scan imported files for hooks that create SharedValues
  const importRegex = /from\s+['"](\.[^'"]+)['"]/g;
  while ((match = importRegex.exec(source)) !== null) {
    const importPath = match[1];
    const resolvedPath = path.resolve(dir, importPath);
    const extensions = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts'];
    for (const ext of extensions) {
      const fullPath = resolvedPath.endsWith(ext)
        ? resolvedPath
        : resolvedPath + ext;
      if (fs.existsSync(fullPath)) {
        try {
          const importedSource = fs.readFileSync(fullPath, 'utf-8');
          // Scan for hook definitions in the imported file
          const importedHookRegex = /(?:const\s+(use[A-Z]\w+)\s*=\s*(?:\([^)]*\)\s*)?=>|function\s+(use[A-Z]\w+)\s*\()/g;
          let hookMatch: RegExpExecArray | null;
          while ((hookMatch = importedHookRegex.exec(importedSource)) !== null) {
            const hookName = hookMatch[1] || hookMatch[2];
            if (!hookName) continue;

            // Find the hook body
            const sigEnd = hookMatch.index + hookMatch[0].length;
            let bodyStart = sigEnd;
            let depth = 0;
            let foundBody = false;
            for (let i = sigEnd; i < importedSource.length; i++) {
              if (importedSource[i] === '{') {
                bodyStart = i + 1;
                depth = 1;
                foundBody = true;
                break;
              }
              if (importedSource[i] === '(') depth++;
              if (importedSource[i] === ')') depth--;
              if (depth === 0 && importedSource[i] === '=' && importedSource[i + 1] === '>') {
                bodyStart = i + 2;
                foundBody = true;
                break;
              }
            }
            if (!foundBody) continue;

            if (depth > 0) {
              let pos = bodyStart;
              while (depth > 0 && pos < importedSource.length) {
                if (importedSource[pos] === '{') depth++;
                else if (importedSource[pos] === '}') depth--;
                pos++;
              }
              const body = importedSource.substring(bodyStart, pos - 1);

              const svInHookRegex = /const\s+(\w+)\s*=\s*useSharedValue\s*\(/g;
              let svMatch: RegExpExecArray | null;
              while ((svMatch = svInHookRegex.exec(body)) !== null) {
                delegated.push({
                  name: svMatch[1],
                  hookName,
                  hookFile: fullPath,
                  isLocal: false,
                });
              }
            }
          }
        } catch {
          // Silently skip files that can't be read
        }
        break; // Found the file, no need to try other extensions
      }
    }
  }

  return delegated;
}
