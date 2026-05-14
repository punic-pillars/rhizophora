// ============================================================
// detector.ts — Thin orchestrator for gap detection.
// v0.6.0 "Vein Propagation" — All detection now delegates to
// the AST-driven Vein Propagation Engine. Legacy regex-based
// detectors have been removed.
// v0.8.1 — Removed legacy options (safeWrappers, heightVariableNames)
// and dead methods (createMarginInventory, validateGapOrchestration).
// ============================================================

import * as fs from 'fs';
import { BoundaryGapReport } from '../../../domain/types/index.js';
import { runVeinAnalysis } from '../../services/VeinAnalysisService.js';

export interface BoundaryGapDetectorOptions {
  mode?: 'all' | 'vein-propagation';
  designTokens?: number[];
}

export class BoundaryGapDetector {
  private options: Required<BoundaryGapDetectorOptions>;

  constructor(options: BoundaryGapDetectorOptions = {}) {
    this.options = {
      mode: options.mode ?? 'vein-propagation',
      designTokens: options.designTokens ?? [],
    };
  }

  /**
   * Detect boundary gaps in a single file.
   * v0.6.0: Delegates to Vein Propagation Engine for all modes.
   * v0.8.2: Passes mode through to VeinAnalysisService for proper filtering.
   */
  detect(filePath: string, mode?: 'all' | 'vein-propagation'): BoundaryGapReport {
    const activeMode = mode ?? this.options.mode;
    
    // Pass the mode through to VeinAnalysisService for proper filtering
    return runVeinAnalysis(filePath, {
      filePath,
      designTokens: this.options.designTokens,
      mode: activeMode,
    });
  }

  /**
   * v0.5.1: Batch audit — scan a directory recursively.
   * v0.6.0: Delegates to Vein Propagation Engine.
   */
  batchAudit(
    dirPath: string,
    mode: 'all' | 'vein-propagation'
  ): Array<{ file: string; gapCount: number; summary: string }> {
    const results: Array<{ file: string; gapCount: number; summary: string }> = [];
    
    if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
      return results;
    }

    const files = this.collectTsxFiles(dirPath);
    for (const file of files) {
      try {
        const report = runVeinAnalysis(file, { filePath: file, designTokens: this.options.designTokens });
        results.push({
          file,
          gapCount: report.gaps.length,
          summary: report.summary,
        });
      } catch {
        results.push({
          file,
          gapCount: -1,
          summary: 'Error analyzing file',
        });
      }
    }

    return results;
  }

  private collectTsxFiles(dirPath: string): string[] {
    const files: string[] = [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = `${dirPath}/${entry.name}`;
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        files.push(...this.collectTsxFiles(fullPath));
      } else if (entry.isFile() && (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts'))) {
        files.push(fullPath);
      }
    }
    return files;
  }
}
