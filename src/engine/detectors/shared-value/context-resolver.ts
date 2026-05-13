// ============================================================
// context-resolver.ts — React Context provider/consumer detection
// and cross-file context chain resolution for SharedValue tracing.
//
// v0.9.0: Context-Aware Traceability — detects SharedValues
//   placed into React Context providers, tracks useContext
//   consumers, and resolves cross-file context chains.
// v0.10.0: Auto-registry discovery — scans all relative imports
//   without requiring manual contextRegistry parameter.
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { ContextPropagationSite, ContextConsumerSite } from '../../../domain/types/index.js';

/**
 * v0.9.0: A registry of known Context providers and the SharedValues they expose.
 * Populated by scanning files and used for cross-file resolution.
 */
export interface ContextRegistry {
  /** contextName → list of SharedValue names exposed by that context */
  [contextName: string]: string[];
}

// ─── v0.10.0: Cache for cross-file context provider analysis
const crossFileContextCache = new Map<string, ContextRegistry>();

/**
 * Detect Context.Provider patterns in source code.
 * Returns a map of context names to the SharedValue names they expose.
 */
export function detectContextProviders(source: string): ContextRegistry {
  const registry: ContextRegistry = {};

  // Pattern: <XxxContext.Provider value={{ svName, ... }}>
  // Also handles: value={{ svName: svName, ... }}
  const providerRegex = /<(\w+)Context\.Provider\s+value=\{(\{[^}]*\})\}/g;
  let match: RegExpExecArray | null;

  while ((match = providerRegex.exec(source)) !== null) {
    const contextName = match[1];
    const valueObj = match[2];

    // Extract property names from the value object
    // Handles: { svName } and { svName: svName }
    const propRegex = /(\w+)\s*(?::\s*(\w+))?\s*,?/g;
    let propMatch: RegExpExecArray | null;

    while ((propMatch = propRegex.exec(valueObj)) !== null) {
      const propName = propMatch[1];
      // Skip non-SharedValue properties (React context often has non-SV values)
      // We include all properties — the caller can filter by checking if they're SharedValues
      if (!registry[contextName]) {
        registry[contextName] = [];
      }
      if (!registry[contextName].includes(propName)) {
        registry[contextName].push(propName);
      }
    }
  }

  return registry;
}

/**
 * Detect useContext consumers in source code.
 * Returns a list of context consumers with their variable names and line numbers.
 */
export function detectContextConsumers(source: string): ContextConsumerSite[] {
  const consumers: ContextConsumerSite[] = [];

  // Pattern 1: const { xxx } = useContext(XxxContext)
  const destructuredRegex = /const\s+\{([^}]+)\}\s*=\s*useContext\((\w+)Context\)/g;
  let match: RegExpExecArray | null;

  while ((match = destructuredRegex.exec(source)) !== null) {
    const props = match[1].split(',').map((p) => p.trim());
    const contextName = match[2];
    const lineNumber = source.substring(0, match.index).split('\n').length;

    for (const prop of props) {
      const [variableName] = prop.split(':').map((p) => p.trim());
      consumers.push({
        contextName,
        variableName,
        lineNumber,
        usagePatterns: [],
      });
    }
  }

  // Pattern 2: const value = useContext(XxxContext)
  const singleRegex = /const\s+(\w+)\s*=\s*useContext\((\w+)Context\)/g;
  while ((match = singleRegex.exec(source)) !== null) {
    const variableName = match[1];
    const contextName = match[2];
    const lineNumber = source.substring(0, match.index).split('\n').length;

    consumers.push({
      contextName,
      variableName,
      lineNumber,
      usagePatterns: [],
    });
  }

  return consumers;
}

/**
 * v0.9.0: Resolve cross-file context providers by scanning imported files.
 * This is the original cross-file resolution method, preserved for backward
 * compatibility when resolveCrossFile option is explicitly set.
 */
export function resolveCrossFileContexts(
  filePath: string,
  source: string,
  registry: ContextRegistry
): void {
  const dir = path.dirname(filePath);
  const importRegex = /from\s+['"](\.[^'"]+)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(source)) !== null) {
    const importPath = match[1];
    const resolvedPath = path.resolve(dir, importPath);
    const extensions = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts'];

    for (const ext of extensions) {
      const fullPath = resolvedPath.endsWith(ext)
        ? resolvedPath
        : resolvedPath + ext;

      if (fs.existsSync(fullPath)) {
        // Check cache first
        if (crossFileContextCache.has(fullPath)) {
          const cached = crossFileContextCache.get(fullPath)!;
          for (const [ctxName, svNames] of Object.entries(cached)) {
            if (!registry[ctxName]) {
              registry[ctxName] = [];
            }
            for (const sv of svNames) {
              if (!registry[ctxName].includes(sv)) {
                registry[ctxName].push(sv);
              }
            }
          }
        } else {
          try {
            const importedSource = fs.readFileSync(fullPath, 'utf-8');
            const providers = detectContextProviders(importedSource);
            crossFileContextCache.set(fullPath, providers);

            for (const [ctxName, svNames] of Object.entries(providers)) {
              if (!registry[ctxName]) {
                registry[ctxName] = [];
              }
              for (const sv of svNames) {
                if (!registry[ctxName].includes(sv)) {
                  registry[ctxName].push(sv);
                }
              }
            }
          } catch {
            // Silently skip files that can't be read
          }
        }
        break; // Found the file, no need to try other extensions
      }
    }
  }
}

/**
 * v0.10.0: Auto-discover context providers by scanning all relative imports
 * recursively. Builds a context registry mapping context names to the
 * SharedValues they expose, without requiring manual configuration.
 */
export function autoDiscoverContexts(
  filePath: string,
  source: string,
  registry: ContextRegistry
): void {
  const dir = path.dirname(filePath);
  const visited = new Set<string>();
  discoverContextsRecursive(filePath, dir, source, registry, visited);
}

/**
 * Recursively scan files for Context.Provider patterns that expose SharedValues.
 * Tracks visited files to avoid infinite loops from circular imports.
 */
function discoverContextsRecursive(
  originalFilePath: string,
  dir: string,
  source: string,
  registry: ContextRegistry,
  visited: Set<string>
): void {
  // Find all relative imports in the source
  const importRegex = /from\s+['"](\.[^'"]+)['"]/g;
  let match: RegExpExecArray | null;

  while ((match = importRegex.exec(source)) !== null) {
    const importPath = match[1];
    const resolvedPath = path.resolve(dir, importPath);
    const extensions = ['.tsx', '.ts', '.jsx', '.js', '/index.tsx', '/index.ts'];

    for (const ext of extensions) {
      const fullPath = resolvedPath.endsWith(ext)
        ? resolvedPath
        : resolvedPath + ext;

      if (fs.existsSync(fullPath) && !visited.has(fullPath)) {
        visited.add(fullPath);
        try {
          const importedSource = fs.readFileSync(fullPath, 'utf-8');

          // Detect context providers in the imported file
          const providers = detectContextProviders(importedSource);
          for (const [ctxName, svNames] of Object.entries(providers)) {
            if (!registry[ctxName]) {
              registry[ctxName] = [];
            }
            for (const sv of svNames) {
              if (!registry[ctxName].includes(sv)) {
                registry[ctxName].push(sv);
              }
            }
          }

          // Recurse into the imported file's imports
          discoverContextsRecursive(
            originalFilePath,
            path.dirname(fullPath),
            importedSource,
            registry,
            visited
          );
        } catch {
          // Silently skip files that can't be read
        }
        break; // Found the file, no need to try other extensions
      }
    }
  }
}
