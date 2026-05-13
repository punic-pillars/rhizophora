// ============================================================
// scanner.ts — Static analysis for React Context detection
// Scans source files for createContext/useContext/Provider patterns
// to discover state propagation paths invisible to SharedValue tracing
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { ContextLink } from '../../../domain/types/index.js';

export class ContextScanner {
  /**
   * Scan a project directory for React Context patterns.
   * Discovers createContext() calls, useContext() consumers,
   * custom hook wrappers (e.g., useHeaderContext), and Provider
   * JSX usage to build a map of context-based state propagation paths.
   *
   * @param projectRoot - Absolute path to the project root
   * @returns Array of ContextLink objects describing discovered context relationships
   */
  scan(projectRoot: string): ContextLink[] {
    const contextLinks: ContextLink[] = [];
    const tsxFiles = this.collectFiles(projectRoot);

    // Phase 1: Find all createContext() calls and their files
    const contextDefinitions = this.findContextDefinitions(tsxFiles);

    // Phase 2: Find all useContext() calls AND custom hook wrappers
    const contextUsages = this.findContextUsages(tsxFiles, contextDefinitions);

    // Phase 3: Find Provider JSX usage to identify provider components
    const providerUsages = this.findProviderUsages(tsxFiles, contextDefinitions);

    // Phase 4: Merge into ContextLink objects
    for (const [contextName, def] of contextDefinitions) {
      const consumers = contextUsages.get(contextName) ?? [];
      const providers = providerUsages.get(contextName) ?? [];

      // Exclude the definition file itself from consumers (it contains the
      // raw useContext() call inside the custom hook wrapper, not a real consumer)
      const externalConsumers = consumers.filter((c) => c.file !== def.file);

      // Extract propagated properties by examining the value passed to Provider
      const propagatedProperties = this.extractPropagatedProperties(providers);

      contextLinks.push({
        contextName,
        providerComponent: providers.length > 0 ? providers[0].providerComponent : undefined,
        consumerComponents: [...new Set(externalConsumers.map((c) => c.consumerComponent))],
        propagatedProperties,
        mechanism: 'react-context',
        providerFile: def.file,
        consumerFiles: [...new Set(externalConsumers.map((c) => c.file))],
      });
    }

    return contextLinks;
  }

  // ─── File Collection ───────────────────────────────────────

  private collectFiles(root: string): string[] {
    const results: string[] = [];
    const walkDir = (dir: string) => {
      try {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            walkDir(fullPath);
          } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
            results.push(fullPath);
          }
        }
      } catch {
        // Permission denied or doesn't exist
      }
    };
    walkDir(root);
    return results;
  }

  // ─── Phase 1: Find createContext() calls ───────────────────

  private findContextDefinitions(
    files: string[]
  ): Map<string, { file: string; variableName: string }> {
    const definitions = new Map<string, { file: string; variableName: string }>();

    // Pattern 1: const XxxContext = createContext<Type>(defaultValue)
    // Pattern 2: const XxxContext = React.createContext<Type>(defaultValue)
    const contextDefRegex =
      /(?:const|let|var)\s+(\w+Context)\s*=\s*(?:React\.)?createContext\s*<([^>]*)>\s*\(([^)]*)\)/g;

    // Pattern 3: export const XxxContext = createContext...
    const exportContextDefRegex =
      /export\s+(?:const|let|var)\s+(\w+Context)\s*=\s*(?:React\.)?createContext\s*<([^>]*)>\s*\(([^)]*)\)/g;

    for (const file of files) {
      const source = fs.readFileSync(file, 'utf-8');

      // Reset regex state
      contextDefRegex.lastIndex = 0;
      exportContextDefRegex.lastIndex = 0;

      let match: RegExpExecArray | null;

      while ((match = exportContextDefRegex.exec(source)) !== null) {
        const contextName = match[1];
        if (!definitions.has(contextName)) {
          definitions.set(contextName, { file, variableName: contextName });
        }
      }

      while ((match = contextDefRegex.exec(source)) !== null) {
        const contextName = match[1];
        if (!definitions.has(contextName)) {
          definitions.set(contextName, { file, variableName: contextName });
        }
      }
    }

    return definitions;
  }

  // ─── Phase 2: Find useContext() calls + custom hook wrappers ─

  private findContextUsages(
    files: string[],
    definitions: Map<string, { file: string; variableName: string }>
  ): Map<string, Array<{ consumerComponent: string; file: string }>> {
    const usages = new Map<string, Array<{ consumerComponent: string; file: string }>>();

    // Pattern 1: useContext(XxxContext) or useContext<Type>(XxxContext)
    const useContextRegex = /useContext\s*<[^>]*>\s*\(\s*(\w+Context)\s*\)|useContext\s*\(\s*(\w+Context)\s*\)/g;

    // Pattern 2: Custom hook wrappers like useHeaderContext that internally
    // call useContext(XxxContext). We detect these by finding exported
    // functions named useXxx that contain useContext(XxxContext) in their body.
    // Build a map: contextName → set of custom hook names
    const customHookMap = this.findCustomHookWrappers(files, definitions);

    for (const file of files) {
      const source = fs.readFileSync(file, 'utf-8');
      useContextRegex.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = useContextRegex.exec(source)) !== null) {
        const contextName = match[1] ?? match[2];
        if (!contextName || !definitions.has(contextName)) continue;

        // Try to determine the consumer component name from the file
        const consumerComponent = this.inferComponentName(source, file);

        if (!usages.has(contextName)) {
          usages.set(contextName, []);
        }
        usages.get(contextName)!.push({ consumerComponent, file });
      }

      // Also check for custom hook usage (import and call useXxxContext)
      const customHooksForFile = this.findCustomHookCalls(source, customHookMap);
      for (const { contextName, hookName } of customHooksForFile) {
        const consumerComponent = this.inferComponentName(source, file);
        if (!usages.has(contextName)) {
          usages.set(contextName, []);
        }
        usages.get(contextName)!.push({ consumerComponent, file });
      }
    }

    return usages;
  }

  /**
   * Find custom hook wrappers that internally call useContext(XxxContext).
   * E.g., `export const useHeaderContext = () => { const ctx = useContext(HeaderContext); ... }`
   * Returns a Map: contextName → Set of custom hook names (e.g., "useHeaderContext")
   */
  private findCustomHookWrappers(
    files: string[],
    definitions: Map<string, { file: string; variableName: string }>
  ): Map<string, Set<string>> {
    const hookMap = new Map<string, Set<string>>();

    // Pattern: export const useXxx = ... useContext(XxxContext) ...
    // or: export function useXxx() { ... useContext(XxxContext) ... }
    const customHookRegex = /useContext\s*<[^>]*>\s*\(\s*(\w+Context)\s*\)|useContext\s*\(\s*(\w+Context)\s*\)/g;

    for (const file of files) {
      const source = fs.readFileSync(file, 'utf-8');
      customHookRegex.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = customHookRegex.exec(source)) !== null) {
        const contextName = match[1] ?? match[2];
        if (!contextName || !definitions.has(contextName)) continue;

        // Look for exported hooks in this file that wrap the context
        // Pattern: export const useXxx = ... or export function useXxx
        const hookNameMatch = source.match(/export\s+(?:const\s+(\w+)\s*=|function\s+(\w+))/);
        const hookName = hookNameMatch?.[1] ?? hookNameMatch?.[2];
        if (hookName && hookName.startsWith('use')) {
          if (!hookMap.has(contextName)) {
            hookMap.set(contextName, new Set());
          }
          hookMap.get(contextName)!.add(hookName);
        }
      }
    }

    return hookMap;
  }

  /**
   * Scan a source file for calls to custom hook wrappers.
   * E.g., `useHeaderContext()` in DynamicHeader.tsx
   */
  private findCustomHookCalls(
    source: string,
    customHookMap: Map<string, Set<string>>
  ): Array<{ contextName: string; hookName: string }> {
    const results: Array<{ contextName: string; hookName: string }> = [];

    for (const [contextName, hookNames] of customHookMap) {
      for (const hookName of hookNames) {
        // Pattern: hookName() or hookName(args)
        const hookCallRegex = new RegExp(`\\b${hookName}\\s*\\(`, 'g');
        hookCallRegex.lastIndex = 0;
        if (hookCallRegex.test(source)) {
          results.push({ contextName, hookName });
        }
      }
    }

    return results;
  }

  // ─── Phase 3: Find Provider JSX usage ──────────────────────

  private findProviderUsages(
    files: string[],
    definitions: Map<string, { file: string; variableName: string }>
  ): Map<string, Array<{ providerComponent: string; file: string; valueExpression: string }>> {
    const providers = new Map<string, Array<{ providerComponent: string; file: string; valueExpression: string }>>();

    // Pattern: <XxxContext.Provider value={...}>
    // Uses a brace-depth counter to handle nested objects like {{ a, b, c }}
    const providerStartRegex = /<(\w+Context)\.Provider\s+value\s*=\s*\{/g;

    for (const file of files) {
      const source = fs.readFileSync(file, 'utf-8');
      providerStartRegex.lastIndex = 0;

      let match: RegExpExecArray | null;
      while ((match = providerStartRegex.exec(source)) !== null) {
        const contextName = match[1];
        if (!definitions.has(contextName)) continue;

        // Extract the full value expression by counting brace depth
        const startIndex = providerStartRegex.lastIndex; // position after the opening {
        let depth = 1;
        let endIndex = startIndex;

        while (depth > 0 && endIndex < source.length) {
          const char = source[endIndex];
          if (char === '{') depth++;
          else if (char === '}') depth--;
          endIndex++;
        }

        // The value expression is between the opening { and the matching closing }
        const valueExpression = source.slice(startIndex, endIndex - 1).trim();

        // Verify this is actually a closing > after the value
        // (skip whitespace and check for >)
        let afterValue = endIndex;
        while (afterValue < source.length && (source[afterValue] === ' ' || source[afterValue] === '\n' || source[afterValue] === '\r' || source[afterValue] === '\t')) {
          afterValue++;
        }
        if (source[afterValue] !== '>') continue; // Not a proper Provider JSX closing

        // Infer the provider component name (the function/component that wraps with Provider)
        const providerComponent = this.inferComponentName(source, file);

        if (!providers.has(contextName)) {
          providers.set(contextName, []);
        }
        providers.get(contextName)!.push({ providerComponent, file, valueExpression });
      }
    }

    return providers;
  }

  // ─── Phase 4: Extract propagated properties ────────────────

  private extractPropagatedProperties(
    providers: Array<{ providerComponent: string; file: string; valueExpression: string }>
  ): string[] {
    const properties = new Set<string>();

    for (const provider of providers) {
      const expr = provider.valueExpression;

      // Pattern 1: value={{ prop1, prop2, ... }} (object shorthand)
      // Pattern 2: value={{ prop1: val1, prop2: val2, ... }}
      // Pattern 3: value={someObject} (single object reference)

      // Try to extract object literal properties
      if (expr.startsWith('{') && expr.endsWith('}')) {
        const inner = expr.slice(1, -1).trim();
        // Match property names: propName, propName: value, or ...spread
        const propRegex = /(\w+)\s*(?::|,|\s*})/g;
        let propMatch: RegExpExecArray | null;
        while ((propMatch = propRegex.exec(inner)) !== null) {
          const propName = propMatch[1];
          // Skip if it's a spread operator
          if (propName !== '...') {
            properties.add(propName);
          }
        }
      } else {
        // Single object reference — we can't statically know its properties
        // But we can note the reference name
        properties.add(expr);
      }
    }

    return [...properties];
  }

  // ─── Helpers ────────────────────────────────────────────────

  /**
   * Infer the component name from a source file.
   * Tries: export default function Xxx, export function Xxx,
   * function Xxx, const Xxx: React.FC, const Xxx = () =>,
   * or falls back to the filename.
   */
  private inferComponentName(source: string, filePath: string): string {
    // Pattern 1: export default function ComponentName
    const defaultExportFn = source.match(/export\s+default\s+function\s+(\w+)/);
    if (defaultExportFn) return defaultExportFn[1];

    // Pattern 2: export function ComponentName
    const exportFn = source.match(/export\s+function\s+(\w+)/);
    if (exportFn) return exportFn[1];

    // Pattern 3: function ComponentName (last one is likely the main export)
    const fnMatch = source.match(/function\s+(\w+)/g);
    if (fnMatch && fnMatch.length > 0) {
      return fnMatch[fnMatch.length - 1].replace('function ', '');
    }

    // Pattern 4: export const ComponentName: React.FC<Props> = ...
    const exportConstFC = source.match(/export\s+const\s+(\w+)\s*:\s*React\.FC/);
    if (exportConstFC) return exportConstFC[1];

    // Pattern 5: const ComponentName: React.FC<Props> = ...
    const constFC = source.match(/const\s+(\w+)\s*:\s*React\.FC/);
    if (constFC) return constFC[1];

    // Pattern 6: const ComponentName = () =>
    const constArrow = source.match(/const\s+(\w+)\s*=\s*(?:\([^)]*\)|[^=])\s*=>/);
    if (constArrow) return constArrow[1];

    // Fallback: use filename without extension
    const fileName = path.basename(filePath, path.extname(filePath));
    // Convert kebab-case/snake_case to PascalCase
    return fileName
      .split(/[-_]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }
}
