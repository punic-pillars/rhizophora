# Rhizophora Developer Reference

**v0.3.0 — Architecture & Design Reference**

This document is the authoritative reference for the Rhizophora MCP server codebase. It covers the complete file tree, design patterns, module architecture, coding conventions, and rules.

---

## Table of Contents

1. [Complete Annotated File Tree](#1-complete-annotated-file-tree)
2. [Design Patterns](#2-design-patterns)
   - [2.1 Thin Re-exports](#21-thin-re-exports)
   - [2.2 Detector Sub-packages](#22-detector-sub-packages)
   - [2.3 Tool Handler Standard (shared.ts)](#23-tool-handler-standard-sharedts)
   - [2.4 Type Separation (domain/types/)](#24-type-separation-domaintypes)
   - [2.5 Vein Module Single Responsibility](#25-vein-module-single-responsibility)
   - [2.6 Barrel Files](#26-barrel-files)
   - [2.7 Foundation Check Middleware](#27-foundation-check-middleware)
   - [2.8 VeinToolService Cache Pattern](#28-veintoolservice-cache-pattern)
3. [Module Deep Dives](#3-module-deep-dives)
   - [3.1 Bootstrap (src/index.ts)](#31-bootstrap-srcindexts)
   - [3.2 CLI (src/cli.ts)](#32-cli-srclits)
   - [3.3 Tools Layer](#33-tools-layer)
   - [3.4 Engine Layer](#34-engine-layer)
   - [3.5 Domain Layer](#35-domain-layer)
   - [3.6 Vein Propagation Engine](#36-vein-propagation-engine)
   - [3.7 Foundation Check Middleware](#37-foundation-check-middleware)
   - [3.8 VeinToolService](#38-veintoolservice)
4. [Import Path Conventions](#4-import-path-conventions)
5. [Coding Rules & Conventions](#5-coding-rules--conventions)
6. [Testing Patterns](#6-testing-patterns)
7. [Version History](#7-version-history)

---

## 1. Complete Annotated File Tree

```
rhizophora/
│
├── package.json                          # ESM package, NodeNext module resolution
├── tsconfig.json                         # ES2022 target, NodeNext module
├── README.md                             # Quick-start overview
│
├── docs/
│   └── reference.md                      # THIS FILE — full architecture reference
│
├── build/                                # Compiled JS output (tsc)
│
├── src/
│   │
│   │  ── Entry Points ─────────────────────────────────────
│   │
│   ├── index.ts                          # MCP Server Bootstrap (209 lines)
│   │   # Creates Server with 15 tools. Handles ListToolsRequestSchema
│   │   # and CallToolRequestSchema. Switch/case routing to handlers.
│   │   # Catch-all error handling in the switch.
│   │   # v0.1.0 — First Public Release
│   │   # v0.3.0 — Added snapshot_layout_graph and diff_layout_graphs
│   │
│   ├── cli.ts                            # CLI entry point for CI/CD (261 lines)
│   │   # analyzeFile() runs all 4 detectors. Supports --ci, --json,
│   │   # --paired-files, --help. Exit code 1 on failures.
│   │
│   ├── constants.ts                      # Shared constants (135 lines)
│   │   # KNOWN_LEAF_PRIMITIVES Set (89 entries), RN_ANIMATED_PRIMITIVES
│   │   # Set (6 entries), isKnownLeafPrimitive(), CONTRACT_TOLERANCE
│   │   # {STRICT:2, WARN:10}, STATUS_BAR_HEIGHT=44, CONTRACT_BUFFER=20
│   │
│   │  ── Domain Layer ─────────────────────────────────────
│   │
│   ├── domain/types/                     # Type definitions
│   │   ├── index.ts                      # Barrel file, re-exports all type modules
│   │   ├── common.ts                     # Bounds, ContextLink, ComponentInteraction,
│   │   │                                 #   StructuralDiagram, CompositionBOM,
│   │   │                                 #   ChildComponent, MeasurementChainItem,
│   │   │                                 #   MarginInventory, ComponentVisionConfig,
│   │   │                                 #   loadConfig()
│   │   ├── boundaries.ts                 # BoundaryGap, BoundaryGapReport
│   │   ├── bridge-crossings.ts           # BridgeCrossing, BridgeCrossingReport
│   │   ├── render-traps.ts               # RenderTrap, RenderTrapReport
│   │   ├── shared-values.ts              # SharedValueInfo, ContextPropagationSite,
│   │   │                                 #   ContextConsumerSite, SharedValueIssue,
│   │   │                                 #   SharedValueLineageReport
│   │   ├── serialized-graph.ts           # SerializedGraph, GraphDiff, NodeSnapshot,
│   │   │                                 #   SpacingDelta, ViolationDelta, HealthDelta,
│   │   │                                 #   ComplexityDelta, DiffSummary
│   │   └── tool-schemas.ts               # TOOL_INPUT_SCHEMAS const with schemas
│   │                                     #   for all 15 tools
│   │
│   │  ── Utilities ────────────────────────────────────────
│   │
│   ├── utils/
│   │   └── validateFilePath.ts           # Validates file exists + extension is
│   │                                     #   .ts/.tsx/.js/.jsx. Throws descriptive errors.
│   │
│   │  ── Parser (Legacy) ──────────────────────────────────
│   │
│   ├── parser/
│   │   └── StructuralParser.ts           # Legacy structural parser (not part of
│   │                                     #   vein engine, kept for backward compat)
│   │
│   │  ── Engine Layer ─────────────────────────────────────
│   │
│   ├── engine/
│   │   │
│   │   ├── vein/                         # Vein Propagation Engine
│   │   │   │                             #   Single Responsibility Principle: 16 focused
│   │   │   │                             #   modules (14 original + FoundationCheck.ts + TerminalPaddingViolation)
│   │   │   ├── types.ts                  # Shared types for all vein modules. ParsedFile,
│   │   │   │                             #   ImportInfo, ComponentDef, ReExportInfo,
│   │   │   │                             #   SpacingTokens, LayoutProperties, LayoutNode,
│   │   │   │                             #   TokenDeviation, InferenceResult, GapOpportunity,
│   │   │   │                             #   StylePollution, MarginStacking, ListItemIssue,
│   │   │   │                             #   ResolvedComponent, ExtractedStyles,
│   │   │   │                             #   TerminalPaddingViolation.
│   │   │   ├── ASTParser.ts              # Pure parsing only (~55 lines). parseFile() and
│   │   │   │                             #   parseSource() using @typescript-eslint/parser.
│   │   │   ├── ASTExtractor.ts           # Extraction logic: extractImports(),
│   │   │   │                             #   extractReExports(), extractExportedComponents().
│   │   │   ├── JSXHelpers.ts             # Pure JSX utility functions: getJSXTagName(),
│   │   │   │                             #   getJSXAttributeValue(), hasJSXAttribute(),
│   │   │   │                             #   getJSXChildren(), getOpeningElement(),
│   │   │   │                             #   isSelfClosing().
│   │   │   ├── ImportResolver.ts         # Import path resolution: resolveImportPath()
│   │   │   │                             #   with extension guessing (.ts/.tsx/.js/.jsx/index).
│   │   │   ├── StyleExtractor.ts         # Single-pass style extraction: extractStyle()
│   │   │   │                             #   returns { spacing, layout } from AST nodes.
│   │   │   ├── SlotDetector.ts           # Slot detection: detectSlot() identifies
│   │   │   │                             #   components that render {props.children}.
│   │   │   ├── ComponentResolver.ts      # Component resolution: resolveComponent(),
│   │   │   │                             #   resolveViaReExports(), resolveConstant(),
│   │   │   │                             #   findConstantInFile(), resolveMemberConstant(),
│   │   │   │                             #   findPropertyInObject(), findObjectInFile(),
│   │   │   │                             #   findNestedObject(), getNumericPropertyFromObject(),
│   │   │   │                             #   parseFileWithCache().
│   │   │   ├── VenousPropagator.ts       # Pure tree walker (~200 lines). Delegates to
│   │   │   │                             #   StyleExtractor, ComponentResolver, SlotDetector,
│   │   │   │                             #   JSXHelpers. Methods: propagate(), walkComponent(),
│   │   │   │                             #   walkJSX(), walkJSXChild(), parseFileWithCache().
│   │   │   │                             #   Options: designTokens, maxDepth.
│   │   │   ├── SemanticLayoutGraph.ts    # Pure data structure (~150 lines). Methods:
│   │   │   │                             #   createNode(), addChild(), getNode(), getRoot(),
│   │   │   │                             #   getAllNodes(), getContainerNodes(), getLeafNodes(),
│   │   │   │                             #   getNodesByComponent(), getDepth(), setSlot(),
│   │   │   │                             #   addContextCall(). Analysis and rendering moved
│   │   │   │                             #   to GraphAnalyzer and GraphRenderer.
│   │   │   ├── GraphAnalyzer.ts          # Analysis logic: findGapOpportunities(),
│   │   │   │                             #   findStylePollution(), findMarginStacking(),
│   │   │   │                             #   findMissingLastItemGuards(),
│   │   │   │                             #   findRhythmViolations(), findProximityIssues(),
│   │   │   │                             #   findTerminalPaddingViolations().
│   │   │   ├── GraphRenderer.ts          # ASCII tree rendering: renderAscii(),
│   │   │   │                             #   renderNode(), formatSpacing(), formatLayout().
│   │   │   ├── TokenDeviationDetector.ts # Design token validation: detect() checks all
│   │   │   │                             #   spacing values against designTokens whitelist.
│   │   │   ├── HeuristicInferenceEngine.ts # Orchestrator (~250 lines). Delegates to
│   │   │   │                             #   GraphAnalyzer, GraphRenderer, TokenDeviationDetector.
│   │   │   │                             #   Methods: analyze(), generateSummaryReport(),
│   │   │   │                             #   renderAscii(), detectGapOpportunities(),
│   │   │   │                             #   detectStylePollution(), detectMarginStacking(),
│   │   │   │                             #   detectListItemIssues(), calculateHealthScore().
│   │   │   │                             #   Calls findTerminalPaddingViolations()
│   │   │   │                             #   and includes terminalPaddingViolations in report.
│   │   │   └── FoundationCheck.ts        # Pure predicate middleware (64 lines).
│   │   │                                 #   hasChildMarginPollution() checks if a container's
│   │   │                                 #   children use hardcoded margins instead of parent gap.
│   │   │                                 #   formatFoundationBlocker() generates HIGH severity
│   │   │                                 #   blocker message. Used by VeinToolService's
│   │   │                                 #   getRhythmAudit() and getProximityAudit().
│   │   │
│   │   ├── services/
│   │   │   ├── VeinAnalysisService.ts    # Public API (252 lines). runVeinAnalysis()
│   │   │   │                             #   orchestrates: VenousPropagator →
│   │   │   │                             #   HeuristicInferenceEngine → convertToReport().
│   │   │   │                             #   Mode filtering (all/vein-propagation).
│   │   │   │                             #   runVeinAnalysisRaw() returns raw graph + inference.
│   │   │   │                             #   generateVeinReport() returns ASCII tree + summary.
│   │   │   │                             #   Legacy — used by detect_boundary_gaps tool.
│   │   │   └── VeinToolService.ts        # Shared cache + query methods (722 lines).
│   │   │                                 #   Runs Vein Propagation once per file, caches the
│   │   │                                 #   SemanticLayoutGraph + InferenceResult + ParsedFile.
│   │   │                                 #   Provides: getComponentTree(), getScreenProfile(),
│   │   │                                 #   getImportChain(), getTokenDeviations(),
│   │   │                                 #   getNestedLists(), getAbsoluteOverlaps(),
│   │   │                                 #   getRhythmAudit(), getProximityAudit().
│   │   │                                 #   getRhythmAudit() and getProximityAudit() include
│   │   │                                 #   Foundation Check integration — they filter out
│   │   │                                 #   polluted branches and emit HIGH severity blockers.
│   │   │                                 #   v1.2.0: All functions accept AnalysisContext
│   │   │                                 #   instead of per-function option types.
│   │   │
│   │   ├── utils/
│   │   │   ├── SourceLocationUtils.ts    # Source location utilities
│   │   │   └── StyleSheetParser.ts       # AST-driven StyleSheet extraction.
│   │   │                                 #   getStyleSheetBlock() extracts named style objects.
│   │   │
│   │   ├── detectors/                    # Sub-packages per detector
│   │   │   ├── boundary-gap/
│   │   │   │   ├── detector.ts           # BoundaryGapDetector class (92 lines).
│   │   │   │   │                         #   detect() runs vein analysis.
│   │   │   │   │                         #   batchAudit() scans dir recursively.
│   │   │   │   └── index.ts              # Barrel: exports BoundaryGapDetector
│   │   │   │
│   │   │   ├── bridge-crossing/
│   │   │   │   ├── detector.ts           # UI Thread Guardian: scans for useState/
│   │   │   │   │                         #   useEffect in gesture handlers
│   │   │   │   ├── hook-resolver.ts      # Resolves hook call sites
│   │   │   │   └── index.ts              # Barrel
│   │   │   │
│   │   │   ├── context-scanner/
│   │   │   │   ├── scanner.ts            # ContextScanner (376 lines): scans for
│   │   │   │   │                         #   React Context providers/consumers
│   │   │   │   └── index.ts              # Barrel
│   │   │   │
│   │   │   ├── render-trap/
│   │   │   │   ├── detector.ts           # RenderTrapDetector (362 lines):
│   │   │   │   │                         #   React.memo enforcement, inline props detection
│   │   │   │   └── index.ts              # Barrel
│   │   │   │
│   │   │   └── shared-value/
│   │   │       ├── lineage-tracer.ts     # SharedValueLineageTracer: lifecycle tracing
│   │   │       ├── context-resolver.ts   # Resolves context propagation
│   │   │       ├── delegated-values.ts   # Tracks delegated SharedValues
│   │   │       ├── issues.ts             # Issue detection logic
│   │   │       └── index.ts              # Barrel
│   │   │
│   │   │  ── Thin Re-exports (Backward Compat) ────────────
│   │   │
│   │   ├── BoundaryGapDetector.ts        # re-export { BoundaryGapDetector } from './detectors/boundary-gap/index.js'
│   │   ├── BridgeCrossingDetector.ts     # re-export { BridgeCrossingDetector } from './detectors/bridge-crossing/index.js'
│   │   ├── ContextScanner.ts             # re-export { ContextScanner } from './detectors/context-scanner/index.js'
│   │   ├── RenderTrapDetector.ts         # re-export { RenderTrapDetector } from './detectors/render-trap/index.js'
│   │   └── SharedValueLineageTracer.ts   # re-export { SharedValueLineageTracer } from './detectors/shared-value/index.js'
│   │
│   │   ├── serialization/                # Layout Graph Serialization (v0.3.0)
│   │   │   ├── index.ts                  # Barrel: exports GraphSerializer, GraphComparator
│   │   │   ├── GraphSerializer.ts        # Serializes SemanticLayoutGraph + InferenceResult
│   │   │   │                             #   to SerializedGraph JSON. Captures git commit
│   │   │   │                             #   hash and timestamp. Writes .rhizome/ files.
│   │   │   │                             #   Methods: serialize(), writeSnapshot(),
│   │   │   │                             #   readSnapshot(), getGitCommitHash()
│   │   │   └── GraphComparator.ts        # Compares two SerializedGraph objects. Uses stable
│   │   │                                 #   node matching via componentName:lineNumber.
│   │   │                                 #   Methods: diff(), findStructuralChanges(),
│   │   │                                 #   findSpacingChanges(), findViolationChanges(),
│   │   │                                 #   findHealthChanges(), findComplexityChanges()
│   │   │
│   │  ── Tools Layer ──────────────────────────────────────
│   │
│   ├── tools/                           # Tool handlers (one per MCP tool, 16 files)
│   │   ├── shared.ts                    # ToolResponse = CallToolResult (SDK type),
│   │   │                                #   success(text), error(message),
│   │   │                                #   withErrorHandling(handler). 48 lines.
│   │   ├── renderDiagram.ts             # handleRenderStructuralDiagram
│   │   ├── boundaryGaps.ts              # handleDetectBoundaryGaps (139 lines).
│   │   │                                #   FormatModeAwareOutput with severity grouping,
│   │   │                                #   influence index display. HandleBatchAudit.
│   │   ├── bridgeCrossings.ts           # handleDetectBridgeCrossings
│   │   ├── renderTraps.ts               # handleDetectRenderTraps
│   │   ├── sharedValueLineage.ts        # handleTraceSharedValueLineage
│   │   ├── componentTree.ts             # handleAnalyzeComponentTree
│   │   ├── screenComplexity.ts          # handleProfileScreenComplexity
│   │   ├── componentImport.ts           # handleTraceComponentImport
│   │   ├── designTokens.ts              # handleAuditDesignTokens
│   │   ├── nestedLists.ts               # handleDetectNestedLists
│   │   ├── absoluteOverlaps.ts          # handleDetectAbsoluteOverlaps
│   │   ├── spacingRhythm.ts             # handleAuditSpacingRhythm (21 lines)
│   │   │                                #   Calls getRhythmAudit() from VeinToolService
│   │   │                                #   which includes Foundation Check integration
│   │   ├── semanticProximity.ts         # handleAuditSemanticProximity (22 lines)
│   │   │                                #   Calls getProximityAudit() from VeinToolService
│   │   │                                #   which includes Foundation Check integration
│   │   ├── snapshotLayoutGraph.ts       # handleSnapshotLayoutGraph (v0.3.0)
│   │   │                                #   Serializes Semantic Layout Graph to .rhizome/
│   │   │                                #   JSON file. Captures git commit hash + timestamp.
│   │   │                                #   Calls getOrAnalyzeForSnapshot() from VeinToolService
│   │   └── diffLayoutGraphs.ts          # handleDiffLayoutGraphs (v0.3.0)
│   │                                    #   Compares two .rhizome/ snapshot files. Produces
│   │                                    #   structured diff with structural, spacing, violation,
│   │                                    #   health, and complexity changes.
│   │
│   │  ── Tests ────────────────────────────────────────────
│   │
│   └── __tests__/
│       ├── smoke-test.ts                 # 11 test suites, 408 lines. Tests: ConfigLoader,
│       │                                 #   CompositionAnalyzer, BoundaryGapDetector,
│       │                                 #   BridgeCrossingDetector, RenderTrapDetector,
│       │                                 #   RegistryCandidateDetector, SharedValueLineageTracer,
│       │                                 #   SemanticLayoutGraph, HeuristicInferenceEngine,
│       │                                 #   ASTParser, StyleSheetParser.
│       └── real-world-test.ts            # Real-world integration tests
```

---

## 2. Design Patterns

### 2.1 Thin Re-exports

**Purpose**: Maintain backward compatibility for existing importers (CLI, tests, other tools) while allowing the actual implementation to live in sub-packages.

**Pattern**: Each original file at `src/engine/` is replaced with a single re-export line:

```typescript
// src/engine/BoundaryGapDetector.ts
export { BoundaryGapDetector } from './detectors/boundary-gap/index.js';
```

**Why**: The CLI (`src/cli.ts`) imports from `src/engine/BoundaryGapDetector.js`. Moving the implementation to `detectors/boundary-gap/detector.ts` would break those imports. Thin re-exports keep the public API stable.

**Rule**: Every detector sub-package MUST have a corresponding thin re-export at the original `src/engine/` location.

### 2.2 Detector Sub-packages

**Purpose**: Each detector is a self-contained sub-package with its own barrel file, detector class, and optional helper modules.

**Structure**:
```
detectors/<name>/
├── index.ts          # Barrel: re-exports the main class
├── detector.ts       # Main detector class
├── <helper>.ts       # Optional: helper modules (hook-resolver, style-resolver, etc.)
```

**Convention**:
- `index.ts` exports only the public API (the detector class)
- `detector.ts` contains the main class with a `detect()` method
- Helper files are internal — not re-exported from `index.ts`
- All files use `.js` extension in imports (ESM convention)

### 2.3 Tool Handler Standard (shared.ts)

**Purpose**: All 15 MCP tool handlers follow a uniform return type and error handling pattern.

**Core types** (`src/tools/shared.ts`):

```typescript
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export type ToolResponse = CallToolResult;

export function success(text: string): ToolResponse {
  return { content: [{ type: 'text', text }] };
}

export function error(message: string): ToolResponse {
  return { content: [{ type: 'text', text: message }], isError: true };
}

export function withErrorHandling<TArgs extends Record<string, unknown>>(
  handler: (args: TArgs) => ToolResponse,
): (args: TArgs) => ToolResponse {
  return (args: TArgs) => {
    try { return handler(args); }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return error(`Error: ${message}`);
    }
  };
}
```

**Rules**:
- Every handler function returns `ToolResponse` (which is `CallToolResult` from the SDK)
- Success: `return success(resultString)`
- Error: `return error(errorMessage)`
- Use `withErrorHandling()` wrapper for synchronous handlers
- Async handlers handle their own try/catch and return `success()`/`error()` directly

### 2.4 Type Separation (domain/types/)

**Purpose**: Replace the monolithic `src/schemas.ts` (447 lines) with per-concern type files.

**Structure**:
```
domain/types/
├── index.ts              # Barrel: re-exports all
├── common.ts             # Shared types: Bounds, Config, BOM, MarginInventory
├── boundaries.ts         # BoundaryGap, BoundaryGapReport
├── bridge-crossings.ts   # BridgeCrossing, BridgeCrossingReport
├── render-traps.ts       # RenderTrap, RenderTrapReport
├── shared-values.ts      # SharedValueInfo, LineageReport
├── serialized-graph.ts   # SerializedGraph, GraphDiff, NodeSnapshot, SpacingDelta,
│                         #   ViolationDelta, HealthDelta, ComplexityDelta, DiffSummary
└── tool-schemas.ts       # TOOL_INPUT_SCHEMAS for all 15 tools
```

**Rules**:
- Each file exports types for ONE domain concern
- `common.ts` holds types shared across multiple domains
- `tool-schemas.ts` is standalone (not re-exported from index in some cases)
- Import via barrel: `import { BoundaryGap } from './domain/types/index.js'`

### 2.5 Vein Module Single Responsibility

**Purpose**: The vein propagation engine follows a strict single-responsibility decomposition where each module has exactly one job. This makes the code easier to reason about, test, and extend.

**Module categories**:

| Category | Modules | Responsibility |
|----------|---------|----------------|
| **Shared Foundation** | `types.ts`, `ASTParser.ts`, `ASTExtractor.ts`, `JSXHelpers.ts`, `ImportResolver.ts` | Type definitions, AST parsing, extraction, utilities |
| **Tree Walking** | `StyleExtractor.ts`, `SlotDetector.ts`, `ComponentResolver.ts`, `VenousPropagator.ts` | Walking the component tree, resolving imports, extracting styles |
| **Data Structure** | `SemanticLayoutGraph.ts` | Pure graph storage and traversal |
| **Analysis & Output** | `GraphAnalyzer.ts`, `GraphRenderer.ts`, `TokenDeviationDetector.ts`, `HeuristicInferenceEngine.ts` | Analyzing the graph, rendering output, detecting issues |
| **Middleware** | `FoundationCheck.ts` | Pure predicate that blocks semantic/rhythm analysis when children use hardcoded margins |
| **Public API** | `VeinAnalysisService.ts`, `VeinToolService.ts` | Orchestrating the full pipeline, caching, tool queries |

**Rules**:
- Each module imports only from `types.ts` and modules in the same or lower category
- No circular dependencies between categories
- `VenousPropagator.ts` delegates to `StyleExtractor`, `SlotDetector`, `ComponentResolver`, `JSXHelpers` — it does NOT contain any of that logic inline
- `HeuristicInferenceEngine.ts` delegates to `GraphAnalyzer`, `GraphRenderer`, `TokenDeviationDetector` — it does NOT contain any analysis or rendering logic inline
- `SemanticLayoutGraph.ts` is a pure data structure with no analysis or rendering methods
- `FoundationCheck.ts` is a pure predicate — it queries existing LayoutNode spacing data and requires zero changes to ASTParser or GraphAnalyzer

### 2.6 Barrel Files

**Purpose**: Provide a single import point for a directory's public API.

**Convention**:
- Every sub-package has an `index.ts` barrel
- Barrels re-export only the public API
- Internal helper files are NOT re-exported from the barrel
- Example: `detectors/boundary-gap/index.ts` exports only `BoundaryGapDetector`, not internal helpers

### 2.7 Foundation Check Middleware

**Purpose**: A pure predicate that acts as a gate before semantic/rhythm analysis. Prevents suggesting semantic grouping or rhythm scaling on top of polluted spacing architecture.

**Pattern** (in `VeinToolService.ts`):

```typescript
import { hasChildMarginPollution, formatFoundationBlocker } from '../vein/FoundationCheck.js';

// In getRhythmAudit() or getProximityAudit():
for (const violation of violations) {
  if (hasChildMarginPollution(violation.parent)) {
    blockedParents.add(violation.parent.id);
  } else {
    cleanViolations.push(violation);
  }
}

// Emit blockers first (high severity)
for (const parentId of blockedParents) {
  const parent = graph.getNode(parentId);
  if (parent) {
    lines.push(`  ⚠️ ${formatFoundationBlocker(parent.componentName)}`);
  }
}
```

**Rules**:
- Foundation Check is a pure predicate — it does NOT modify the graph or analysis results
- It filters the output: polluted branches are reported as HIGH severity blockers instead of being silently skipped
- The blocker message directs the user to run `detect_boundary_gaps` first
- Only `audit_spacing_rhythm` and `audit_semantic_proximity` use Foundation Check

### 2.8 VeinToolService Cache Pattern

**Purpose**: All Vein-powered tools share a single Vein Propagation pipeline run per file. The cache ensures the pipeline runs once, then all tools query the cached graph.

**Pattern** (in `VeinToolService.ts`):

```typescript
interface CachedAnalysis {
  graph: SemanticLayoutGraph;
  inference: InferenceResult;
  parsed: ParsedFile;
}

const analysisCache = new Map<string, CachedAnalysis>();

function getOrAnalyze(filePath: string, designTokens?: number[]): CachedAnalysis {
  const absolutePath = path.resolve(filePath);
  const cached = analysisCache.get(absolutePath);
  if (cached) return cached;

  // Run Vein Propagation pipeline
  const parsed = parseFile(absolutePath);
  const graph = new VenousPropagator({...}).propagate(absolutePath);
  const inference = new HeuristicInferenceEngine({...}).analyze(graph);

  const result = { graph, inference, parsed };
  analysisCache.set(absolutePath, result);
  return result;
}
```

**Rules**:
- Cache key is the resolved absolute path
- Cache is populated on first access, reused on subsequent calls
- `clearCache()` is available for testing
- Each tool query method (e.g., `getRhythmAudit()`) calls `getOrAnalyze()` and then queries the cached graph

---

## 3. Module Deep Dives

### 3.1 Bootstrap (src/index.ts)

**Role**: Creates the MCP Server, registers tool definitions, and routes incoming tool calls.

**Flow**:
1. Create `Server` instance with name `'rhizophora'`, version `'0.1.0'`
2. Define `TOOL_DEFINITIONS` array — 15 tools with name, description, and inputSchema
3. Register `ListToolsRequestSchema` handler → returns `TOOL_DEFINITIONS`
4. Register `CallToolRequestSchema` handler → switch/case on `name` → calls handler function
5. Connect to `StdioServerTransport` and start

**Handler routing** (lines 88-127):
```typescript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  try {
    switch (name) {
      case 'render_structural_diagram':
        return handleRenderStructuralDiagram(args as { filePath: string });
      case 'detect_boundary_gaps':
        return handleDetectBoundaryGaps(args as { filePath: string; mode?: 'all' | 'vein-propagation'; ... });
      case 'detect_bridge_crossings':
        return handleDetectBridgeCrossings(args as { filePath: string });
      case 'detect_render_traps':
        return handleDetectRenderTraps(args as { filePath: string });
      case 'trace_shared_value_lineage':
        return handleTraceSharedValueLineage(args as { filePath: string });
      case 'snapshot_layout_graph':
        return handleSnapshotLayoutGraph(args as { filePath: string; outputDir?: string });
      case 'diff_layout_graphs':
        return handleDiffLayoutGraphs(args as { snapshotA: string; snapshotB: string });
      // ... 10 more tools
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${name}.` }], isError: true };
    }
  } catch (error) {
    return { content: [{ type: 'text', text: `Error executing ${name}: ${message}` }], isError: true };
  }
});
```

**Key detail**: The outer try/catch catches errors from async handlers. The inner switch/case routes to typed handler functions. This is a deliberate two-layer error handling strategy.

**Tool categories in TOOL_DEFINITIONS**:
- **5 standalone regex tools**: `render_structural_diagram`, `detect_boundary_gaps`, `detect_bridge_crossings`, `detect_render_traps`, `trace_shared_value_lineage`
- **6 Vein-powered tools**: `analyze_component_tree`, `profile_screen_complexity`, `trace_component_import`, `audit_design_tokens`, `detect_nested_lists`, `detect_absolute_overlaps`
- **2 Orchestration tools**: `audit_spacing_rhythm`, `audit_semantic_proximity`
- **2 Serialization tools (v0.3.0)**: `snapshot_layout_graph`, `diff_layout_graphs`

### 3.2 CLI (src/cli.ts)

**Role**: Standalone CLI for CI/CD pipelines. Runs all 4 detectors on specified files.

**Flags**:
- `--ci`: Exit with code 1 if any issues found
- `--json`: Output results as JSON for pipeline parsing
- `--paired-files`: Compare files in pairs (0,1), (2,3), etc.
- `--help`: Show usage

**Flow**:
1. Parse CLI args, filter flags from file paths
2. Validate files exist
3. Initialize all 4 detectors (BridgeCrossing, RenderTrap, SharedValue, BoundaryGap)
4. For each file, call `analyzeFile()` which runs all 4 detectors
5. In paired-files mode, process files in pairs and show cross-file comparison
6. Output results (JSON or human-readable)
7. Exit with code 0 (pass) or 1 (fail)

**analyzeFile()** (lines 176-259):
- Runs BridgeCrossingDetector → counts crossings
- Runs RenderTrapDetector → counts traps
- Runs SharedValueLineageTracer → counts issues
- Runs BoundaryGapDetector → counts high/medium gaps
- Each detector is wrapped in its own try/catch (non-fatal on failure)
- Returns `CIResult` with counts and details array

### 3.3 Tools Layer

**Role**: One file per MCP tool. Each exports a handler function that returns `ToolResponse`.

**Convention**:
- File name: camelCase matching the tool name (e.g., `boundaryGaps.ts` for `detect_boundary_gaps`)
- Export: `handleDetectBoundaryGaps` (PascalCase handler name)
- Return type: `ToolResponse` (from `shared.ts`)
- Import `success` and `error` from `./shared.js`

**Handler patterns**:

*Synchronous handler* (uses `withErrorHandling`):
```typescript
export const handleRenderStructuralDiagram = withErrorHandling(
  (args: { filePath: string }): ToolResponse => {
    validateFilePath(args.filePath);
    const result = doWork(args.filePath);
    return success(JSON.stringify(result, null, 2));
  }
);
```

*Async handler* (manual try/catch):
```typescript
export async function handleDetectBridgeCrossings(
  args: { filePath: string }
): Promise<ToolResponse> {
  try {
    const result = await doAsyncWork(args.filePath);
    return success(JSON.stringify(result, null, 2));
  } catch (err) {
    return error(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }
}
```

**boundaryGaps.ts** is the most complex handler (139 lines):
- Validates file path, checks if it's a directory for batch audit
- Calls `runVeinAnalysis()` or `handleBatchAudit()`
- `formatModeAwareOutput()` groups gaps by severity with mode-specific headers
- Returns formatted string via `success()`

**spacingRhythm.ts** and **semanticProximity.ts**:
- Simple handlers that delegate to `VeinToolService`
- `handleAuditSpacingRhythm` calls `getRhythmAudit()` which includes Foundation Check
- `handleAuditSemanticProximity` calls `getProximityAudit()` which includes Foundation Check
- Both use manual try/catch pattern (not `withErrorHandling`)

### 3.4 Engine Layer

**Role**: All analysis logic. Organized into detectors (5 sub-packages) + vein engine (15 files) + services + utils.

**Detector sub-packages**:

| Sub-package | Files | Main Class | detect() returns |
|-------------|-------|------------|-----------------|
| `boundary-gap/` | detector.ts, index.ts | `BoundaryGapDetector` | `BoundaryGapReport` |
| `bridge-crossing/` | detector.ts, hook-resolver.ts, index.ts | `BridgeCrossingDetector` | `BridgeCrossingReport` |
| `context-scanner/` | scanner.ts, index.ts | `ContextScanner` | `ContextLink[]` |
| `render-trap/` | detector.ts, index.ts | `RenderTrapDetector` | `RenderTrapReport` |
| `shared-value/` | lineage-tracer.ts, context-resolver.ts, delegated-values.ts, issues.ts, index.ts | `SharedValueLineageTracer` | `SharedValueLineageReport` |

**Detector class convention**:
```typescript
export class SomeDetector {
  detect(filePath: string): SomeReport {
    // Parse file, analyze, return report
  }
}
```

### 3.5 Domain Layer

**Role**: Type definitions, config loading, and tool input schemas.

**Key types**:

| File | Key Exports |
|------|-------------|
| `common.ts` | `Bounds`, `ContextLink`, `ComponentInteraction`, `StructuralDiagram`, `CompositionBOM`, `ChildComponent`, `MeasurementChainItem`, `MarginInventory`, `ComponentVisionConfig`, `loadConfig()` |
| `boundaries.ts` | `BoundaryGap`, `BoundaryGapReport` |
| `bridge-crossings.ts` | `BridgeCrossing`, `BridgeCrossingReport` |
| `render-traps.ts` | `RenderTrap`, `RenderTrapReport` |
| `shared-values.ts` | `SharedValueInfo`, `ContextPropagationSite`, `ContextConsumerSite`, `SharedValueIssue`, `SharedValueLineageReport` |
| `serialized-graph.ts` | `SerializedGraph`, `GraphDiff`, `NodeSnapshot`, `SpacingDelta`, `ViolationDelta`, `HealthDelta`, `ComplexityDelta`, `DiffSummary` |
| `tool-schemas.ts` | `TOOL_INPUT_SCHEMAS` -- schemas for all 15 tools |

### 3.6 Vein Propagation Engine

**Role**: The core analysis engine. Parses `.tsx`/`.ts` files into a TypeScript AST, walks the component tree following imports, builds a Semantic Layout Graph, and infers layout issues.

**Pipeline**:
1. **AST Parse** -- `ASTParser.parseFile()` parses the file into a TypeScript AST
2. **Venous Propagate** -- `VenousPropagator.propagate()` recursively walks the component tree, resolving imports and extracting styles
3. **Build Graph** -- `SemanticLayoutGraph` stores nodes with spacing tokens and parent-child edges
4. **Heuristic Inference** -- `HeuristicInferenceEngine.analyze()` detects gap opportunities, style pollution, margin stacking, list item issues, rhythm violations, proximity issues, and terminal padding violations

**Key design decisions**:
- Single Responsibility: Each module has exactly one job (see Section 2.5)
- Pure data structure: `SemanticLayoutGraph` has no analysis or rendering methods
- Delegation: `VenousPropagator` delegates to `StyleExtractor`, `SlotDetector`, `ComponentResolver`, `JSXHelpers`
- Orchestration: `HeuristicInferenceEngine` delegates to `GraphAnalyzer`, `GraphRenderer`, `TokenDeviationDetector`

### 3.7 Foundation Check Middleware

**Role**: A pure predicate that acts as a gate before semantic/rhythm analysis. Prevents suggesting semantic grouping or rhythm scaling on top of polluted spacing architecture.

**Location**: `src/engine/vein/FoundationCheck.ts` (64 lines)

**API**:
- `hasChildMarginPollution(container: LayoutNode): boolean` -- checks if any child has hardcoded margins
- `formatFoundationBlocker(componentName: string): string` -- generates HIGH severity blocker message

**Integration points**:
- `VeinToolService.getRhythmAudit()` -- filters out polluted branches before rhythm analysis
- `VeinToolService.getProximityAudit()` -- filters out polluted branches before proximity analysis

**Rules**:
- Foundation Check is a pure predicate -- it does NOT modify the graph or analysis results
- It filters the output: polluted branches are reported as HIGH severity blockers instead of being silently skipped
- The blocker message directs the user to run `detect_boundary_gaps` first
- Only `audit_spacing_rhythm` and `audit_semantic_proximity` use Foundation Check

### 3.8 VeinToolService

**Role**: Shared cache + query methods for all Vein-powered tools. Runs Vein Propagation once per file, caches the result, and provides typed query methods.

**Location**: `src/engine/services/VeinToolService.ts` (722 lines)

**Cache pattern**:
```typescript
interface CachedAnalysis {
  graph: SemanticLayoutGraph;
  inference: InferenceResult;
  parsed: ParsedFile;
}

const analysisCache = new Map<string, CachedAnalysis>();
```

**Public methods**:
| Method | Returns | Used by |
|--------|---------|---------|
| `getOrAnalyze()` | `CachedAnalysis` | Internal -- all query methods call this first |
| `getOrAnalyzeForSnapshot()` | `{ graph, inference, truncation }` | `snapshot_layout_graph` tool (v0.3.0) |
| `getComponentTree()` | ASCII tree string | `analyze_component_tree` |
| `getScreenProfile()` | Profile string | `profile_screen_complexity` |
| `getImportChain()` | Import chain string | `trace_component_import` |
| `getTokenDeviations()` | Deviation report string | `audit_design_tokens` |
| `getNestedLists()` | Nested list report string | `detect_nested_lists` |
| `getAbsoluteOverlaps()` | Overlap report string | `detect_absolute_overlaps` |
| `getRhythmAudit()` | Rhythm audit string (with Foundation Check) | `audit_spacing_rhythm` |
| `getProximityAudit()` | Proximity audit string (with Foundation Check) | `audit_semantic_proximity` |
| `clearCache()` | void | Testing |

**Key detail**: `getOrAnalyzeForSnapshot()` (v0.3.0) is a special variant that returns the raw `{ graph, inference, truncation }` object instead of a formatted string. This allows the `snapshot_layout_graph` tool to serialize the full Semantic Layout Graph without formatting it first.

---

## 4. Import Path Conventions

All imports use `.js` extension (ESM convention):

```typescript
import { BoundaryGapDetector } from './detectors/boundary-gap/index.js';
import { SemanticLayoutGraph } from './vein/SemanticLayoutGraph.js';
```

**Rules**:
- Always use `.js` extension, even for `.ts` source files
- Barrel imports: `import { X } from './domain/types/index.js'`
- No barrel imports for `tool-schemas.ts` (imported directly)

---

## 5. Coding Rules & Conventions

### 5.1 File Organization

- One class/export per file (exceptions: small utility files, barrel files)
- File name matches export name (camelCase for functions, PascalCase for classes)
- Test files: `*.test.ts` or `*.spec.ts` co-located with source

### 5.2 TypeScript

- Use `type` over `interface` for object shapes
- Use `interface` only for declaration merging or class contracts
- Prefer `Record<string, unknown>` over `any`
- Use `as const` for literal types
- Use `import type` for type-only imports

### 5.3 Error Handling

- Tool handlers return `ToolResponse` (never throw)
- Use `withErrorHandling()` wrapper for synchronous handlers
- Async handlers use manual try/catch with `success()`/`error()`
- Detectors throw descriptive errors (caught by caller)

### 5.4 Naming

- Files: camelCase (e.g., `boundaryGaps.ts`)
- Exports: PascalCase handler names (e.g., `handleDetectBoundaryGaps`)
- Classes: PascalCase (e.g., `BoundaryGapDetector`)
- Functions: camelCase (e.g., `getOrAnalyze`)
- Constants: UPPER_SNAKE_CASE (e.g., `KNOWN_LEAF_PRIMITIVES`)

---

## 6. Testing Patterns

### 6.1 Smoke Tests

**File**: `src/__tests__/smoke-test.ts` (408 lines, 11 test suites)

Tests the following components:
- ConfigLoader
- CompositionAnalyzer
- BoundaryGapDetector
- BridgeCrossingDetector
- RenderTrapDetector
- RegistryCandidateDetector
- SharedValueLineageTracer
- SemanticLayoutGraph
- HeuristicInferenceEngine
- ASTParser
- StyleSheetParser

### 6.2 Test Conventions

- Each test suite tests one module
- Tests use real `.tsx` fixtures (no mocks)
- Tests verify both detection and non-detection cases
- Cache is cleared between tests via `clearCache()`

---

## 7. Version History

| Version | Date | Changes |
|---------|------|---------|
| v0.3.0 | 2026-05-14 | Added `snapshot_layout_graph` and `diff_layout_graphs` tools. New `serialization/` module with `GraphSerializer` and `GraphComparator`. New `serialized-graph.ts` type definitions. Added `getOrAnalyzeForSnapshot()` to `VeinToolService`. |
| v0.2.0 | 2026-05-14 | Added performance guards (`maxFiles`, `maxFileSizeKB`, `timeoutMs`). Introduced `AnalysisContext` to eliminate boilerplate corridor. Cache key fix for stale truncated results. |
| v0.1.5 | 2026-05-13 | Strengthened MCP identity in README and package.json. Sharpened sensory-substitution framing. Updated release checklist. |
| v0.1.4 | 2026-05-13 | Fixed Smithery badge URL and `smithery.yaml` start command. |
| v0.1.0 | 2026-05-13 | First public release. 13 MCP tools across 3 phases: Guardians, Architects, Profilers. Vein Propagation Engine with Semantic Layout Graph. Foundation Check middleware. CI/CD CLI integration. |
