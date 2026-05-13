#!/usr/bin/env node
// ============================================================
// cli.ts — Rhizophora CLI entry point
// v0.1.0 — First public release. CI/CD integration for
//   performance checks (bridge crossings, render traps,
//   SharedValue lineage, boundary gaps).
//
// Usage:
//   npx rhizophora-cli --ci <file1.tsx> [file2.tsx ...]
//   npx rhizophora-cli --ci --paired-files <file1.tsx> <file2.tsx> [...]
//
// Exit codes:
//   0 — All checks passed (no issues found)
//   1 — Issues found (bridge crossings, render traps, etc.)
//
// JSON output mode (for CI parsing):
//   npx rhizophora-cli --ci --json <file1.tsx> [...]
// ============================================================

import { BridgeCrossingDetector } from './engine/BridgeCrossingDetector.js';
import { RenderTrapDetector } from './engine/RenderTrapDetector.js';
import { SharedValueLineageTracer } from './engine/SharedValueLineageTracer.js';
import { BoundaryGapDetector } from './engine/BoundaryGapDetector.js';
import { existsSync } from 'node:fs';

interface CIResult {
  file: string;
  bridgeCrossings: number;
  renderTraps: number;
  sharedValueIssues: number;
  boundaryGaps: number;
  passed: boolean;
  details: string[];
}

function printUsage(): void {
  console.error(`
Rhizophora v0.1.0 — Architectural X-Ray for React Native

Usage:
  npx rhizophora-cli --ci <file1.tsx> [file2.tsx ...]
  npx rhizophora-cli --ci --json <file1.tsx> [...]
  npx rhizophora-cli --ci --paired-files <file1.tsx> <file2.tsx> [...]

Options:
  --ci             Run in CI mode (exit with code 1 on failures)
  --json           Output results as JSON (for CI pipeline parsing)
  --paired-files   Compare two files side-by-side (e.g., header + page)
  --help           Show this help message

Exit codes:
  0  All checks passed
  1  Issues found (bridge crossings, render traps, etc.)
`);
}

function main(): void {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help')) {
    printUsage();
    process.exit(0);
  }

  const isCI = args.includes('--ci');
  const isJSON = args.includes('--json');
  const isPairedFiles = args.includes('--paired-files');

  // Collect file paths (filter out flags)
  const filePaths = args.filter((a) => !a.startsWith('--'));

  if (filePaths.length === 0) {
    console.error('❌ No files specified. Provide at least one .tsx/.jsx file path.');
    printUsage();
    process.exit(1);
  }

  // Validate files exist
  const validFiles = filePaths.filter((f) => {
    if (!existsSync(f)) {
      console.error(`⚠️  File not found: ${f}`);
      return false;
    }
    return true;
  });

  if (validFiles.length === 0) {
    console.error('❌ No valid files found. Exiting.');
    process.exit(1);
  }

  // Initialize engines
  const bridgeDetector = new BridgeCrossingDetector();
  const trapDetector = new RenderTrapDetector();
  const svTracer = new SharedValueLineageTracer();
  const boundaryDetector = new BoundaryGapDetector();

  const results: CIResult[] = [];
  let totalIssues = 0;

  // ── Paired Files Mode ──────────────────────────────────────
  if (isPairedFiles && validFiles.length >= 2) {
    // Process files in pairs: (0,1), (2,3), etc.
    for (let i = 0; i < validFiles.length - 1; i += 2) {
      const file1 = validFiles[i];
      const file2 = validFiles[i + 1];

      console.error(`\n📎 Paired Analysis: ${file1} ↔ ${file2}`);
      console.error('─'.repeat(60));

      // Analyze file 1
      const result1 = analyzeFile(file1, bridgeDetector, trapDetector, svTracer, boundaryDetector);
      results.push(result1);
      totalIssues += result1.bridgeCrossings + result1.renderTraps + result1.sharedValueIssues + result1.boundaryGaps;

      // Analyze file 2
      const result2 = analyzeFile(file2, bridgeDetector, trapDetector, svTracer, boundaryDetector);
      results.push(result2);
      totalIssues += result2.bridgeCrossings + result2.renderTraps + result2.sharedValueIssues + result2.boundaryGaps;

      // Cross-file comparison
      console.error(`\n🔗 Cross-File Comparison:`);
      console.error(`  File 1: ${file1}`);
      console.error(`  File 2: ${file2}`);
      console.error(`  Total Issues: ${result1.bridgeCrossings + result1.renderTraps + result1.sharedValueIssues + result1.boundaryGaps + result2.bridgeCrossings + result2.renderTraps + result2.sharedValueIssues + result2.boundaryGaps}`);
    }

    // Handle unpaired file (odd count)
    if (validFiles.length % 2 !== 0) {
      const lastFile = validFiles[validFiles.length - 1];
      console.error(`\n⚠️  Unpaired file: ${lastFile} (odd number of files)`);
      const result = analyzeFile(lastFile, bridgeDetector, trapDetector, svTracer, boundaryDetector);
      results.push(result);
      totalIssues += result.bridgeCrossings + result.renderTraps + result.sharedValueIssues + result.boundaryGaps;
    }
  } else {
    // Standard mode: process each file independently
    for (const filePath of validFiles) {
      const result = analyzeFile(filePath, bridgeDetector, trapDetector, svTracer, boundaryDetector);
      results.push(result);
      totalIssues += result.bridgeCrossings + result.renderTraps + result.sharedValueIssues + result.boundaryGaps;

      if (!isJSON) {
        const status = result.passed ? '✅ PASS' : '❌ FAIL';
        console.error(`\n${status}: ${filePath}`);
        console.error(`  Bridge Crossings: ${result.bridgeCrossings} | Render Traps: ${result.renderTraps} | SharedValue Issues: ${result.sharedValueIssues} | Boundary Gaps: ${result.boundaryGaps}`);
        if (result.details.length > 0) {
          console.error(`  Details:`);
          for (const d of result.details) {
            console.error(`    ${d}`);
          }
        }
      }
    }
  }

  // ── Output ─────────────────────────────────────────────────
  if (isJSON) {
    // Print JSON to stdout for pipeline parsing
    console.log(JSON.stringify({ results, totalIssues, passed: totalIssues === 0 }, null, 2));
  }

  if (!isJSON) {
    console.error(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.error(`📊 Summary: ${results.length} file(s) scanned, ${totalIssues} total issue(s)`);
    console.error(`   ${results.filter((r) => r.passed).length} passed, ${results.filter((r) => !r.passed).length} failed`);
    console.error('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  }

  // Exit with appropriate code
  if (isCI) {
    process.exit(totalIssues > 0 ? 1 : 0);
  }
}

/**
 * Analyze a single file with all detectors.
 */
function analyzeFile(
  filePath: string,
  bridgeDetector: BridgeCrossingDetector,
  trapDetector: RenderTrapDetector,
  svTracer: SharedValueLineageTracer,
  boundaryDetector: BoundaryGapDetector
): CIResult {
  const details: string[] = [];
  let bridgeCrossings = 0;
  let renderTraps = 0;
  let sharedValueIssues = 0;
  let boundaryGaps = 0;

  // ── 1. Bridge Crossings ──────────────────────────────────
  try {
    const bridgeReport = bridgeDetector.detect(filePath);
    bridgeCrossings = bridgeReport.crossings.length;
    if (bridgeCrossings > 0) {
      details.push(`⚠️  ${bridgeCrossings} bridge crossing(s) detected`);
      for (const c of bridgeReport.crossings) {
        details.push(`  [${c.severity}] ${c.handler} → ${c.culprit} (line ${c.lineNumber})`);
      }
    }
  } catch (e) {
    details.push(`  ⚠️  Bridge crossing scan failed: ${e}`);
  }

  // ── 2. Render Traps ──────────────────────────────────────
  try {
    const trapReport = trapDetector.detect(filePath);
    renderTraps = trapReport.traps.length;
    if (renderTraps > 0) {
      details.push(`⚠️  ${renderTraps} render trap(s) detected`);
      for (const t of trapReport.traps) {
        details.push(`  [${t.severity}] ${t.component} ← ${t.propType} (${t.propName}) line ${t.lineNumber}`);
      }
    }
  } catch (e) {
    details.push(`  ⚠️  Render trap scan failed: ${e}`);
  }

  // ── 3. SharedValue Issues ────────────────────────────────
  try {
    const svReport = svTracer.trace(filePath);
    sharedValueIssues = svReport.issues.length;
    if (sharedValueIssues > 0) {
      details.push(`⚠️  ${sharedValueIssues} SharedValue issue(s) detected`);
      for (const issue of svReport.issues) {
        details.push(`  [${issue.severity}] ${issue.sharedValue}: ${issue.description.substring(0, 80)}`);
      }
    }
  } catch (e) {
    details.push(`  ⚠️  SharedValue lineage scan failed: ${e}`);
  }

  // ── 4. Boundary Gaps ─────────────────────────────────────
  try {
    const gapReport = boundaryDetector.detect(filePath);
    boundaryGaps = gapReport.gaps.filter((g) => g.severity === 'high' || g.severity === 'medium').length;
    if (boundaryGaps > 0) {
      details.push(`⚠️  ${boundaryGaps} boundary gap(s) detected`);
      for (const g of gapReport.gaps) {
        if (g.severity !== 'low') {
          details.push(`  [${g.severity}] ${g.category}: ${g.description.substring(0, 80)}`);
        }
      }
    }
  } catch (e) {
    details.push(`  ⚠️  Boundary gap scan failed: ${e}`);
  }

  const total = bridgeCrossings + renderTraps + sharedValueIssues + boundaryGaps;
  const passed = total === 0;

  return {
    file: filePath,
    bridgeCrossings,
    renderTraps,
    sharedValueIssues,
    boundaryGaps,
    passed,
    details,
  };
}

main();
