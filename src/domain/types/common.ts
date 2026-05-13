// ============================================================
// common.ts — Shared common types used across all domains
// Extracted from schemas.ts during Phase A refactoring
// ============================================================

// ─── Bounds ───────────────────────────────────────────────────
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ─── Context Link (Phase 3) ──────────────────────────────────
export interface ContextLink {
  contextName: string;
  providerComponent?: string;
  consumerComponents: string[];
  propagatedProperties: string[];
  mechanism: 'react-context' | 'zustand' | 'redux' | 'prop-drilling';
  providerFile?: string;
  consumerFiles?: string[];
}

// ─── Structural Diagram ──────────────────────────────────────
export interface StructuralDiagram {
  filePath: string;
  diagram: string;
  styleSheet: Record<string, Record<string, string>>;
  animatedValues: Array<{ name: string; type: string; description: string }>;
  summary: string[];
}

// ─── Component Vision Config ─────────────────────────────────
export interface ComponentVisionConfig {
  /**
   * Component names that handle safe-area insets internally.
   * If a file contains one of these as a JSX wrapper, missing-offset
   * warnings are suppressed.
   */
  safeWrappers?: string[];

  /**
   * Height variable names to scan for offset references.
   * Default: ['collapsedHeight', 'expandedHeight', 'minimizedHeight', 'headerHeight']
   */
  heightVariableNames?: string[];

  /**
   * State names to scan for in Ground Truth return blocks.
   * Default: ['minimized', 'expanded', 'superExpanded', 'collapsed']
   */
  stateNames?: string[];

  /**
   * Props considered "standard" for component interaction scanning.
   * Props not in this list are flagged as DEVIATIONS.
   */
  standardProps?: string[];

  /**
   * Props explicitly flagged as "non-standard" for component interaction scanning.
   * These are always flagged as DEVIATIONS regardless of standardProps.
   */
  nonStandardKeys?: string[];

  /**
   * Files/patterns to ignore during scanning (glob patterns).
   */
  ignorePatterns?: string[];
}

/**
 * Load Component Vision config from a .component-vision.json file.
 * Searches upward from the given directory.
 * Uses dynamic import() for ESM compatibility.
 */
export async function loadConfig(startDir?: string): Promise<ComponentVisionConfig> {
  const { existsSync, readFileSync } = await import('node:fs');
  const { join, dirname } = await import('node:path');
  const dir = startDir || process.cwd();
  
  let current = dir;
  while (true) {
    const configPath = join(current, '.component-vision.json');
    if (existsSync(configPath)) {
      try {
        const raw = readFileSync(configPath, 'utf-8');
        return JSON.parse(raw) as ComponentVisionConfig;
      } catch {
        // Invalid JSON, continue searching
      }
    }
    const parent = dirname(current);
    if (parent === current) break; // Reached root
    current = parent;
  }
  return {}; // No config found
}
