// ============================================================
// VeinToolService.ts — Shared cache + query methods for all
// Vein-powered MCP tools. Ensures the Vein Propagation pipeline
// runs only once per file, then all tools query the cached graph.
//
// v1.0.0 — Initial release for 6 new Vein-powered tools
// v2.0.0 — Upgraded rhythm/proximity audits to v2.0 contextual
//   gap violations, boundary violations, and Rule of Three.
// v1.1.0 "Performance Guards" — Pass truncation info through
//   the pipeline and report it in tool output.
// v1.2.0 "AnalysisContext" — Consolidated all cross-cutting
//   parameters into a single AnalysisContext interface.
//   Eliminated the PerformanceOptions type.
// ============================================================

import * as path from 'path';
import * as fs from 'fs';
import { VenousPropagator } from '../vein/VenousPropagator.js';
import { HeuristicInferenceEngine } from '../vein/HeuristicInferenceEngine.js';
import { GraphAnalyzer } from '../vein/GraphAnalyzer.js';
import { TokenDeviationDetector, DEFAULT_DESIGN_TOKENS } from '../vein/TokenDeviationDetector.js';
import { ComponentResolver } from '../vein/ComponentResolver.js';
import { parseFile } from '../vein/ASTParser.js';
import { hasChildMarginPollution, hasCumulativePaddingBoundary, formatFoundationBlocker } from '../vein/FoundationCheck.js';
import { SemanticScorer } from '../vein/SemanticScorer.js';
import type { SemanticLayoutGraph } from '../vein/SemanticLayoutGraph.js';
import type { InferenceResult, LayoutNode, ParsedFile, ResolvedComponent, TruncationInfo } from '../vein/types.js';
import type { AnalysisContext } from '../../domain/types/context.js';

// ─── Cache ────────────────────────────────────────────────────

interface CachedAnalysis {
  graph: SemanticLayoutGraph;
  inference: InferenceResult;
  parsed: ParsedFile;
  truncation: TruncationInfo;
}

interface CacheEntry {
  data: CachedAnalysis;
  mtimeMs: number;
}

const analysisCache = new Map<string, CacheEntry>();

/**
 * Get or build analysis for a file. Uses mtime-based cache invalidation
 * so edits to the file are automatically reflected without server restart.
 *
 * @param filePath - Path to the file to analyze
 * @param designTokens - Optional design token whitelist
 * @param forceRefresh - If true, bypass cache and re-analyze from scratch
 * @param ctx - Optional AnalysisContext with performance guards
 */
function getOrAnalyze(filePath: string, designTokens?: number[], forceRefresh = false, ctx?: AnalysisContext): CachedAnalysis {
  const absolutePath = path.resolve(filePath);
  const stats = fs.statSync(absolutePath);
  const cacheKey = `${absolutePath}::${designTokens?.join(',') ?? ''}::${ctx?.maxFiles}::${ctx?.maxFileSizeKB}::${ctx?.timeoutMs}::${ctx?.maxDepth}`;

  const cached = analysisCache.get(cacheKey);
  if (!forceRefresh && cached && cached.mtimeMs === stats.mtimeMs) {
    return cached.data;
  }

  const parsed = parseFile(absolutePath);

  const propagator = new VenousPropagator({
    designTokens,
    maxDepth: 10,
    maxFiles: ctx?.maxFiles,
    maxFileSizeKB: ctx?.maxFileSizeKB,
    timeoutMs: ctx?.timeoutMs,
  });

  const graph = propagator.propagate(absolutePath);
  const truncation = propagator.getTruncationInfo();

  const engine = new HeuristicInferenceEngine({
    designTokens,
  });

  const inference = engine.analyze(graph, truncation);

  const result = { graph, inference, parsed, truncation };
  analysisCache.set(cacheKey, { data: result, mtimeMs: stats.mtimeMs });
  return result;
}

/**
 * Get or analyze a file and return the raw graph + inference + truncation
 * for serialization purposes (snapshot_layout_graph tool).
 * This bypasses the BoundaryGapReport conversion and returns the raw data.
 */
export function getOrAnalyzeForSnapshot(ctx: AnalysisContext): {
  graph: SemanticLayoutGraph;
  inference: InferenceResult;
  truncation: TruncationInfo;
} {
  const { graph, inference, truncation } = getOrAnalyze(ctx.filePath, undefined, false, ctx);
  return { graph, inference, truncation };
}

/**
 * Clear the analysis cache entirely.
 */
export function clearCache(): void {
  analysisCache.clear();
}

// ─── Helper: Format truncation header ─────────────────────────

function formatTruncationHeader(truncation: TruncationInfo, filePath: string): string[] {
  const lines: string[] = [];
  if (truncation.truncated) {
    lines.push(`[TRUNCATED] ${filePath} — partial analysis`);
    lines.push(`  Files parsed: ${truncation.filesParsed}/${truncation.maxFiles}`);
    if (truncation.filesSkippedSize > 0) {
      lines.push(`  Files skipped (size): ${truncation.filesSkippedSize}`);
    }
    if (truncation.unresolvedComponents > 0) {
      lines.push(`  Unresolved components: ${truncation.unresolvedComponents}`);
    }
    if (truncation.timedOut) {
      lines.push(`  Timed out after ${truncation.elapsedMs}ms`);
    }
    lines.push(`  Health score is based on the resolved portion of the graph.`);
    lines.push('');
  }
  return lines;
}

// ─── Tool Queries ─────────────────────────────────────────────

/**
 * Get the full component tree as an ASCII diagram with annotations.
 */
export function getComponentTree(ctx: AnalysisContext): string {
  const { graph, inference, truncation } = getOrAnalyze(ctx.filePath, undefined, false, ctx);
  const engine = new HeuristicInferenceEngine();
  const tree = engine.renderAscii(graph);
  const lines: string[] = [];
  lines.push(`[COMPONENT-TREE] ${ctx.filePath}`);
  lines.push('');
  lines.push(...formatTruncationHeader(truncation, ctx.filePath));
  lines.push(tree);
  lines.push('');
  lines.push(`Health Score: ${inference.healthScore}/100`);
  return lines.join('\n');
}

/**
 * Get a screen complexity profile (BOM).
 */
export function getScreenProfile(ctx: AnalysisContext): string {
  const { graph, inference, truncation } = getOrAnalyze(ctx.filePath, undefined, false, ctx);
  const allNodes = graph.getAllNodes();
  const containers = graph.getContainerNodes();
  const leaves = graph.getLeafNodes();
  const customComponents = allNodes.filter((n) => n.isCustomComponent);
  const slots = allNodes.filter((n) => n.isSlot);
  const listItems = allNodes.filter((n) => n.isListItem);
  const absoluteNodes = allNodes.filter((n) => n.layout.position === 'absolute');
  const onLayoutNodes = allNodes.filter((n) => n.hasOnLayout);
  const root = graph.getRoot();
  const maxDepth = root ? Math.max(...allNodes.map((n) => graph.getDepth(n.id))) : 0;

  const lines: string[] = [];
  lines.push(`[SCREEN-PROFILE] ${ctx.filePath}`);
  lines.push('');
  lines.push(...formatTruncationHeader(truncation, ctx.filePath));
  lines.push(`  Total components: ${allNodes.length}`);
  lines.push(`  Unique custom components: ${customComponents.length}`);
  lines.push(`  Max nesting depth: ${maxDepth}`);
  lines.push(`  Container nodes: ${containers.length}`);
  lines.push(`  Leaf nodes: ${leaves.length}`);
  lines.push(`  Container/leaf ratio: ${containers.length > 0 ? (leaves.length / containers.length).toFixed(1) : 'N/A'}`);
  lines.push(`  Slot components (transparent): ${slots.length}`);
  lines.push(`  List items: ${listItems.length}`);
  lines.push(`  Absolute positioned: ${absoluteNodes.length}`);
  lines.push(`  onLayout handlers: ${onLayoutNodes.length}`);
  lines.push(`  Health score: ${inference.healthScore}/100`);

  // Complexity grade
  const score = inference.healthScore;
  let grade: string;
  if (score >= 90) grade = 'SIMPLE';
  else if (score >= 70) grade = 'MODERATE';
  else if (score >= 50) grade = 'COMPLEX';
  else grade = 'OVERCOMPLICATED';
  lines.push(`  Complexity grade: ${grade}`);

  return lines.join('\n');
}

/**
 * Trace a component's import chain from usage to source definition.
 */
export function getImportChain(ctx: AnalysisContext): string {
  const { parsed } = getOrAnalyze(ctx.filePath);
  const fileCache = new Map<string, ParsedFile>();
  fileCache.set(parsed.filePath, parsed);
  const resolver = new ComponentResolver(fileCache);

  const firstExport = parsed.exportedComponents.size > 0
    ? parsed.exportedComponents.values().next().value
    : null;
  const targetName = ctx.componentName || (firstExport?.name ?? null);

  if (!targetName) {
    return `[IMPORT-CHAIN] ${ctx.filePath}\n  No components found in file.`;
  }

  const lines: string[] = [];
  lines.push(`[IMPORT-CHAIN] ${targetName} in ${ctx.filePath}`);
  lines.push('');

  const visited = new Set<string>();
  let currentParsed = parsed;
  let currentName = targetName;
  let depth = 0;

  while (currentParsed) {
    const indent = '  '.repeat(depth);
    const localDef = currentParsed.exportedComponents.get(currentName);
    if (localDef) {
      const lineNum = localDef.node.loc?.start.line ?? '?';
      const fnType = localDef.node.type === 'ArrowFunctionExpression' ? 'arrow function' : 'function declaration';
      lines.push(`${indent}${currentName} defined in ${currentParsed.filePath} (line ${lineNum}, ${fnType})`);
      break;
    }

    let resolved: ResolvedComponent | null = null;
    for (const [, importInfo] of currentParsed.imports) {
      if (importInfo.namedImports.includes(currentName) || importInfo.defaultImport === currentName) {
        if (!importInfo.resolvedPath) continue;
        if (visited.has(importInfo.resolvedPath)) continue;
        visited.add(importInfo.resolvedPath);

        const nextParsed = parseFile(importInfo.resolvedPath);
        fileCache.set(importInfo.resolvedPath, nextParsed);

        const nextDef = nextParsed.exportedComponents.get(currentName);
        if (nextDef) {
          const lineNum = nextDef.node.loc?.start.line ?? '?';
          lines.push(`${indent}imported from '${importInfo.sourcePath}' → ${importInfo.resolvedPath} (line ${lineNum})`);
          currentParsed = nextParsed;
          resolved = nextDef;
          break;
        }

        const reExportResult = resolver.resolveViaReExports(currentName, nextParsed, visited, new Set());
        if (reExportResult) {
          lines.push(`${indent}imported from '${importInfo.sourcePath}' → re-export chain → ${reExportResult.filePath}`);
          currentParsed = parseFile(reExportResult.filePath);
          fileCache.set(reExportResult.filePath, currentParsed);
          currentName = reExportResult.name;
          resolved = reExportResult;
          break;
        }
      }
    }

    if (!resolved) {
      lines.push(`${indent}${currentName} — could not resolve further (external library or missing file)`);
      break;
    }

    depth++;
    if (depth > 10) {
      lines.push(`${indent}... max depth reached`);
      break;
    }
  }

  return lines.join('\n');
}

/**
 * Scan a file for spacing values not in the design token whitelist.
 */
export function getTokenDeviations(ctx: AnalysisContext): string {
  const { graph, truncation } = getOrAnalyze(ctx.filePath, ctx.designTokens, false, ctx);
  const tokens = ctx.designTokens ?? DEFAULT_DESIGN_TOKENS;
  const detector = new TokenDeviationDetector(tokens);
  const deviations = detector.detect(graph);

  const lines: string[] = [];
  lines.push(`[TOKEN-DEVIATIONS] ${ctx.filePath}`);
  lines.push(...formatTruncationHeader(truncation, ctx.filePath));
  lines.push(`  Design tokens: [${tokens.join(', ')}]`);

  if (deviations.length === 0) {
    lines.push('  [CLEAN] All spacing values use valid design tokens.');
    return lines.join('\n');
  }

  for (const d of deviations) {
    lines.push(`  ${d.property}: ${d.value} → ${d.suggestion}`);
  }

  lines.push(`  [SUMMARY] ${deviations.length} deviation(s) found.`);
  return lines.join('\n');
}

/**
 * Find .map() inside .map() — nested list anti-pattern.
 */
export function getNestedLists(ctx: AnalysisContext): string {
  const { graph, truncation } = getOrAnalyze(ctx.filePath, undefined, false, ctx);
  const allNodes = graph.getAllNodes();
  const listItems = allNodes.filter((n) => n.isListItem);

  const nested: Array<{ outer: LayoutNode; inner: LayoutNode }> = [];
  for (const item of listItems) {
    for (const child of item.children) {
      if (child.isListItem) {
        nested.push({ outer: item, inner: child });
      }
    }
  }

  const lines: string[] = [];
  lines.push(`[NESTED-LISTS] ${ctx.filePath}`);
  lines.push(...formatTruncationHeader(truncation, ctx.filePath));

  if (nested.length === 0) {
    lines.push('  [CLEAN] No nested .map() calls detected.');
    return lines.join('\n');
  }

  for (const n of nested) {
    lines.push(`  <${n.outer.tagName}> (line ${n.outer.lineNumber}) contains <${n.inner.tagName}> (line ${n.inner.lineNumber}) — nested list`);
    lines.push(`    Suggestion: Extract inner list into a separate component or use FlatList with nested sections.`);
  }

  lines.push(`  [SUMMARY] ${nested.length} nested list(s) found.`);
  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// v2.0.0: Rhythm Audit — Contextual Gap Violations + Boundary
// ═══════════════════════════════════════════════════════════════

/**
 * v2.0.0: Audit spacing rhythm — contextual gap validation.
 *
 * Replaces the v1.1.0 simple inner_gap < outer_gap check with
 * the Dynamic Rhythm Hierarch:
 *   - Intra-Section (Score > 6): Target 8px, flag if > 8px
 *   - Inter-Section (Score < 4): Target 16px, flag if < 16px
 *   - Boundary Rule: Last child must have zero marginBottom
 */
export function getRhythmAudit(ctx: AnalysisContext): string {
  const { graph, truncation } = getOrAnalyze(ctx.filePath, undefined, false, ctx);
  const analyzer = new GraphAnalyzer();

  // v2.0.0: Contextual gap violations
  const contextualViolations = analyzer.findContextualGapViolations(graph);
  // v2.0.0: Boundary violations
  const boundaryViolations = analyzer.findBoundaryViolations(graph);
  // v1.1.0: Legacy rhythm violations (kept for backward compat)
  const legacyViolations = analyzer.findRhythmViolations(graph);
  // v2.3.0: Terminal padding violations
  const terminalPaddingViolations = analyzer.findTerminalPaddingViolations(graph);

  const lines: string[] = [];
  lines.push(`[RHYTHM-AUDIT v2.3.0] ${ctx.filePath}`);
  lines.push(...formatTruncationHeader(truncation, ctx.filePath));
  lines.push(`  Rule: Dynamic Rhythm Hierarch — Intra-section tight (8px), Inter-section wide (16px), Boundary flush (0px)`);
  lines.push('');

  // ─── v2.1.0: Independent Foundation Scan ──────────────────────
  // Scan ALL containers for margin pollution, not just those with violations.
  // This ensures foundation blockers are emitted even when no violations
  // are detected (the "Rhythm Blindspot" fix).
  const blockedParents = new Set<string>();
  const allPollutedContainers = new Set<string>();
  for (const container of graph.getContainerNodes()) {
    if (hasChildMarginPollution(container)) {
      allPollutedContainers.add(container.id);
    }
  }

  // ─── v2.0.0: Contextual Gap Violations ───────────────────────
  const cleanContextual = contextualViolations.filter(
    (v) => !allPollutedContainers.has(v.container.id)
  );

  if (cleanContextual.length > 0) {
    lines.push(`  ── Contextual Gap Violations ──`);
    for (const cv of cleanContextual) {
      const typeLabel = cv.violationType === 'loose-rhythm' ? 'Loose Rhythm' : 'Section Collision';
      lines.push(`  [${typeLabel}] <${cv.childA.componentName}> <-> <${cv.childB.componentName}>`);
      lines.push(`     Proximity Score: ${cv.proximityScore} | Actual: ${cv.actualGap}px | Target: ${cv.targetGap}px`);
      lines.push(`     Fix: ${cv.suggestion}`);
    }
    lines.push('');
  }

  // ─── v2.0.0: Boundary Violations ─────────────────────────────
  if (boundaryViolations.length > 0) {
    lines.push(`  ── Boundary Rule Violations ──`);
    for (const bv of boundaryViolations) {
      lines.push(`  <${bv.lastChild.componentName}> in <${bv.container.componentName}> has ${bv.marginProperty}: ${bv.marginValue}`);
      lines.push(`     Fix: ${bv.suggestion}`);
    }
    lines.push('');
  }

  // ─── v2.2.0: Ghost Margin Detection (Cumulative Padding) ─────
  const ghostMargins: Array<{ container: LayoutNode; lastChild: LayoutNode; parentPadding: number; childPadding: number; total: number }> = [];
  for (const container of graph.getContainerNodes()) {
    const result = hasCumulativePaddingBoundary(container);
    if (result) {
      ghostMargins.push({
        container: result.container,
        lastChild: result.lastChild,
        parentPadding: result.parentPaddingBottom,
        childPadding: result.childPaddingBottom,
        total: result.totalCumulative,
      });
    }
  }
  if (ghostMargins.length > 0) {
    lines.push(`  ── Ghost Margins (Cumulative Padding) ──`);
    for (const gm of ghostMargins) {
      lines.push(`  <${gm.lastChild.componentName}> in <${gm.container.componentName}> has paddingBottom: ${gm.childPadding}px overlapping parent paddingBottom: ${gm.parentPadding}px (total: ${gm.total}px)`);
      lines.push(`     Fix: Remove paddingBottom from <${gm.lastChild.componentName}> and rely on parent paddingBottom: ${gm.parentPadding}px.`);
    }
    lines.push('');
  }

  // ─── v2.3.0: Terminal Padding Violations ─────────────────────
  const cleanTerminalPadding = terminalPaddingViolations.filter(
    (tpv) => !allPollutedContainers.has(tpv.container.id)
  );

  if (cleanTerminalPadding.length > 0) {
    lines.push(`  ── Terminal Padding Violations ──`);
    for (const tpv of cleanTerminalPadding) {
      lines.push(`  <${tpv.child.componentName}> in <${tpv.container.componentName}> has ${tpv.property}: ${tpv.value}px (container already has gap/padding)`);
      lines.push(`     Fix: ${tpv.suggestion}`);
    }
    lines.push('');
  }

  // ─── v1.1.0: Legacy Rhythm Violations ────────────────────────

  const cleanLegacy: typeof legacyViolations = [];
  for (const v of legacyViolations) {
    if (hasChildMarginPollution(v.parent)) {
      allPollutedContainers.add(v.parent.id);
    } else {
      cleanLegacy.push(v);
    }
  }

  if (cleanLegacy.length > 0) {
    lines.push(`  ── Legacy Rhythm Violations (v1) ──`);
    for (const v of cleanLegacy) {
      lines.push(`  <${v.parent.componentName}> gap:${v.parentGap} -> <${v.child.componentName}> gap:${v.childGap}`);
      lines.push(`     ${v.suggestion}`);
    }
    lines.push('');
  }

  // ─── v2.1.0: Deferred Analysis Preview ───────────────────────
  // Show what WOULD have been flagged if foundation blockers were resolved.
  // This gives users a complete roadmap: "Fix these margins to see these results."
  const deferredContextual = contextualViolations.filter(
    (v) => allPollutedContainers.has(v.container.id)
  );
  const deferredBoundary = boundaryViolations.filter(
    (bv) => allPollutedContainers.has(bv.container.id)
  );
  const deferredTerminalPadding = terminalPaddingViolations.filter(
    (tpv) => allPollutedContainers.has(tpv.container.id)
  );

  // Also collect polluted containers that have NO specific violations detected
  // but are still blocked — these represent "hidden" issues that will surface
  // once margins are fixed.
  const containersWithDeferred = new Set<string>();
  for (const cv of deferredContextual) containersWithDeferred.add(cv.container.id);
  for (const bv of deferredBoundary) containersWithDeferred.add(bv.container.id);
  for (const tpv of deferredTerminalPadding) containersWithDeferred.add(tpv.container.id);
  const silentlyBlockedContainers = [...allPollutedContainers].filter(
    (id) => !containersWithDeferred.has(id)
  );

  const hasDeferredItems = deferredContextual.length > 0 ||
    deferredBoundary.length > 0 ||
    deferredTerminalPadding.length > 0 ||
    silentlyBlockedContainers.length > 0;

  if (hasDeferredItems) {
    lines.push(`  ── [DEFERRED] Would be flagged after fixing margin pollution ──`);
    for (const cv of deferredContextual) {
      const typeLabel = cv.violationType === 'loose-rhythm' ? 'Loose Rhythm' : 'Section Collision';
      lines.push(`  [DEFERRED] [${typeLabel}] <${cv.childA.componentName}> <-> <${cv.childB.componentName}>`);
      lines.push(`     Proximity Score: ${cv.proximityScore} | Actual: ${cv.actualGap}px | Target: ${cv.targetGap}px`);
      lines.push(`     Fix: ${cv.suggestion}`);
    }
    for (const bv of deferredBoundary) {
      lines.push(`  [DEFERRED] <${bv.lastChild.componentName}> in <${bv.container.componentName}> has ${bv.marginProperty}: ${bv.marginValue}`);
      lines.push(`     Fix: ${bv.suggestion}`);
    }
    for (const tpv of deferredTerminalPadding) {
      lines.push(`  [DEFERRED] <${tpv.child.componentName}> in <${tpv.container.componentName}> has ${tpv.property}: ${tpv.value}px (terminal padding)`);
      lines.push(`     Fix: ${tpv.suggestion}`);
    }
    for (const containerId of silentlyBlockedContainers) {
      const container = graph.getNode(containerId);
      if (container) {
        lines.push(`  [DEFERRED] <${container.componentName}> — analysis blocked by margin pollution (no specific violations detected yet — run again after fixing margins)`);
      }
    }
    lines.push('');
  }

  // ─── Blockers ────────────────────────────────────────────────
  for (const containerId of allPollutedContainers) {
    const container = graph.getNode(containerId);
    if (container) {
      blockedParents.add(containerId);
      lines.push(`  [BLOCKED] ${formatFoundationBlocker(container.componentName)}`);
    }
  }

  if (blockedParents.size > 0) {
    lines.push('');
  }

  // ─── Summary ─────────────────────────────────────────────────
  const totalContextual = cleanContextual.length;
  const totalBoundary = boundaryViolations.length;
  const totalTerminalPadding = cleanTerminalPadding.length;
  const totalLegacy = cleanLegacy.length;
  const totalBlocked = blockedParents.size;
  const totalDeferred = deferredContextual.length + deferredBoundary.length + deferredTerminalPadding.length + silentlyBlockedContainers.length;

  if (totalContextual === 0 && totalBoundary === 0 && totalTerminalPadding === 0 && totalLegacy === 0 && totalBlocked === 0 && totalDeferred === 0) {
    lines.push('  [CLEAN] All containers respect the Dynamic Rhythm Hierarch.');
  } else {
    lines.push(`  [SUMMARY] ${totalContextual} contextual gap violation(s), ${totalBoundary} boundary violation(s), ${totalTerminalPadding} terminal padding violation(s), ${totalLegacy} legacy violation(s), ${totalBlocked} blocked by layout pollution, ${totalDeferred} deferred.`);
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════
// v2.0.0: Proximity Audit — Semantic Scoring + Rule of Three
// ═══════════════════════════════════════════════════════════════

/**
 * v2.0.0: Audit semantic proximity — scoring + grouping.
 *
 * Replaces the v1.1.0 simple prefix-matching with:
 *   - 3-variable Semantic Scoring (Lexical 40%, Prop DNA 30%, Visual 30%)
 *   - Rule of Three grouping suggestions
 *   - Foundation Check blocking
 */
export function getProximityAudit(ctx: AnalysisContext): string {
  const { graph, truncation } = getOrAnalyze(ctx.filePath, undefined, false, ctx);
  const analyzer = new GraphAnalyzer();
  const scorer = new SemanticScorer();

  // v1.1.0: Legacy prefix-based proximity issues
  const legacyIssues = analyzer.findProximityIssues(graph);
  // v2.0.0: Rule of Three grouping suggestions
  const pollutedContainers = new Set<string>();
  for (const container of graph.getContainerNodes()) {
    if (hasChildMarginPollution(container)) {
      pollutedContainers.add(container.id);
    }
  }
  const groupingSuggestions = analyzer.findGroupingSuggestions(graph, pollutedContainers);

  const lines: string[] = [];
  lines.push(`[PROXIMITY-AUDIT v2.0] ${ctx.filePath}`);
  lines.push(...formatTruncationHeader(truncation, ctx.filePath));
  lines.push(`  Rule: Semantic Scoring (Lexical 40% + Prop DNA 30% + Visual 30%) + Rule of Three`);
  lines.push('');

  // ─── Foundation Check ─────────────────────────────────────────
  const blockedContainers = new Set<string>();

  for (const pi of legacyIssues) {
    if (hasChildMarginPollution(pi.container)) {
      blockedContainers.add(pi.container.id);
    }
  }

  // ─── v2.0.0: Grouping Suggestions (Rule of Three) ────────────
  if (groupingSuggestions.length > 0) {
    lines.push(`  ── Grouping Suggestions (Rule of Three) ──`);
    for (const gs of groupingSuggestions) {
      const siblingNames = gs.siblings.map((s) => s.componentName).join(', ');
      lines.push(`  Container <${gs.container.componentName}> (line ${gs.container.lineNumber})`);
      lines.push(`     Semantic Cluster: ${siblingNames}`);
      lines.push(`     Average Proximity Score: ${gs.averageScore}/10`);
      lines.push(`     Fix: ${gs.suggestion}`);
    }
    lines.push('');
  }

  // ─── v2.0.0: Per-pair scoring breakdown ──────────────────────
  // Show scoring for sibling pairs in containers with custom children
  lines.push(`  ── Semantic Scoring Breakdown ──`);
  let scoredPairs = 0;
  for (const container of graph.getContainerNodes()) {
    if (container.isSlot) continue;
    const customChildren = container.children.filter((c) => c.isCustomComponent && !c.isSlot);
    if (customChildren.length < 2) continue;

    for (let i = 0; i < customChildren.length - 1; i++) {
      const a = customChildren[i];
      const b = customChildren[i + 1];
      const score = scorer.computeScore(a, b, graph);

      if (score.total > 0) {
        scoredPairs++;
        const breakdownStr = score.breakdown.join(' | ');
        lines.push(`  <${a.componentName}> ↔ <${b.componentName}>: ${score.total}/10`);
        lines.push(`     ${breakdownStr}`);
      }
    }
  }

  if (scoredPairs === 0) {
    lines.push(`  (No semantically related sibling pairs detected.)`);
  }
  lines.push('');

  // ─── v1.1.0: Legacy Proximity Issues ─────────────────────────
  const cleanLegacy = legacyIssues.filter(
    (pi) => !blockedContainers.has(pi.container.id)
  );

  if (cleanLegacy.length > 0) {
    lines.push(`  ── Legacy Proximity Issues (v1) ──`);
    for (const pi of cleanLegacy) {
      const siblingNames = pi.siblings.map((s) => s.componentName).join(', ');
      lines.push(`  Container <${pi.container.componentName}> (line ${pi.container.lineNumber})`);
      lines.push(`     Related siblings (prefix "${pi.sharedPrefix}"): ${siblingNames}`);
      lines.push(`     Fix: ${pi.suggestion}`);
    }
    lines.push('');
  }

  // ─── v2.1.0: Deferred Analysis Preview ───────────────────────
  // Show what grouping suggestions WOULD have been flagged if foundation
  // blockers were resolved. This gives users a complete roadmap.
  const deferredGrouping = groupingSuggestions.filter(
    (gs) => blockedContainers.has(gs.container.id)
  );

  if (deferredGrouping.length > 0) {
    lines.push(`  ── [DEFERRED] Would be flagged after fixing margin pollution ──`);
    for (const gs of deferredGrouping) {
      const siblingNames = gs.siblings.map((s) => s.componentName).join(', ');
      lines.push(`  [DEFERRED] Container <${gs.container.componentName}> (line ${gs.container.lineNumber})`);
      lines.push(`     Semantic Cluster: ${siblingNames}`);
      lines.push(`     Average Proximity Score: ${gs.averageScore}/10`);
      lines.push(`     Fix: ${gs.suggestion}`);
    }
    lines.push('');
  }

  // ─── Blockers ────────────────────────────────────────────────
  for (const containerId of blockedContainers) {
    const container = graph.getNode(containerId);
    if (container) {
      lines.push(`  [BLOCKED] ${formatFoundationBlocker(container.componentName)}`);
    }
  }

  if (blockedContainers.size > 0) {
    lines.push('');
  }

  // ─── Summary ─────────────────────────────────────────────────
  const totalGrouping = groupingSuggestions.length;
  const totalLegacy = cleanLegacy.length;
  const totalBlocked = blockedContainers.size;
  const totalDeferred = deferredGrouping.length;

  if (totalGrouping === 0 && totalLegacy === 0 && totalBlocked === 0 && totalDeferred === 0) {
    lines.push('  [CLEAN] No ungrouped semantically related siblings detected.');
  } else {
    lines.push(`  [SUMMARY] ${totalGrouping} grouping suggestion(s), ${totalLegacy} legacy proximity issue(s), ${totalBlocked} blocked by layout pollution, ${totalDeferred} deferred.`);
  }

  return lines.join('\n');
}

export function getAbsoluteOverlaps(ctx: AnalysisContext): string {
  const { graph, truncation } = getOrAnalyze(ctx.filePath, undefined, false, ctx);
  const allNodes = graph.getAllNodes();
  const absoluteNodes = allNodes.filter((n) => n.layout.position === 'absolute');

  const lines: string[] = [];
  lines.push(`[ABSOLUTE-OVERLAPS] ${ctx.filePath}`);
  lines.push(...formatTruncationHeader(truncation, ctx.filePath));

  if (absoluteNodes.length === 0) {
    lines.push('  [CLEAN] No absolutely-positioned elements found.');
    return lines.join('\n');
  }

  for (const node of absoluteNodes) {
    const hasZIndex = node.layout.zIndex !== undefined;
    const hasDimensions = node.layout.width !== undefined || node.layout.height !== undefined;
    const issues: string[] = [];

    if (!hasZIndex) issues.push('missing zIndex — stacking order may be unpredictable');
    if (!hasDimensions) issues.push('missing width/height — element may collapse to 0');

    const parent = node.parentId ? graph.getNode(node.parentId) : null;
    const parentTag = parent ? `<${parent.tagName}>` : '(root)';

    lines.push(`  <${node.tagName}> (line ${node.lineNumber}) in ${parentTag}`);
    lines.push(`    Position: top=${node.layout.top ?? '?'}, left=${node.layout.left ?? '?'}, right=${node.layout.right ?? '?'}, bottom=${node.layout.bottom ?? '?'}`);
    lines.push(`    zIndex: ${node.layout.zIndex ?? 'not set'}`);
    lines.push(`    Dimensions: width=${node.layout.width ?? 'not set'}, height=${node.layout.height ?? 'not set'}`);

    if (issues.length > 0) {
      for (const issue of issues) {
        lines.push(`    Warning: ${issue}`);
      }
    }
  }

  lines.push(`  [SUMMARY] ${absoluteNodes.length} absolutely-positioned element(s).`);
  return lines.join('\n');
}
