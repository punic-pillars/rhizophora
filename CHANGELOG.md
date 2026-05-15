# Changelog

## v0.3.1 (2026-05-15)

### Docs

- **Audit Case Study**: Added `docs/audit-case-study.md` -- a real-world benchmark report ("The Premium Chaos" Audit) with annotated screenshots showing Rhizophora catching layout bugs on 3 screens (Home, Dashboard, Explore). Includes Rhizophora signal output, culprit code, and remediation paths.
- **Screenshots**: Added `docs/screenshots/` with 3 annotated PNG files (home.png, home-2.png, dashboard.png) for the case study.
- **README Overhaul**: Restructured from 658 lines to ~290 lines using collapsible sections for scannability. Added "ESLint for UI" tagline. Added case study quick link after Features section. Clarified product positioning (NOT like Husky, 3 faces: MCP Server + npm package + CI/CD CLI). Added AI remediation closing paragraph to case study.

### Fixes

- **LICENSE**: Fixed copyright holder from "Rhizophora" to "Punic Pillars".

### Chores

- Bumped version to 0.3.1

## v0.3.0 (2026-05-14)

### Features

- **Layout Graph Serialization**: Added `snapshot_layout_graph` MCP tool that serializes the full Semantic Layout Graph (component tree, spacing annotations, layout properties, violation counts, health score, complexity profile) to `.rhizome/` JSON files. Includes `GraphSerializer` with git commit hash capture, flat node map with explicit edge list, and file I/O helpers.
- **Cross-Commit Regression Detection**: Added `diff_layout_graphs` MCP tool that compares two serialized snapshots and produces a structured diff report. Uses stable node matching via `componentName:lineNumber` (not ephemeral node IDs). Detects structural changes (nodes added/removed), spacing changes (all margin/padding/gap property deltas), violation count changes, health score changes, and complexity grade changes.
- **Serialization Infrastructure**: Created `src/engine/serialization/` module with `GraphSerializer.ts`, `GraphComparator.ts`, and barrel export. Created `src/domain/types/serialized-graph.ts` with complete schema for `SerializedGraph`, `GraphDiff`, and all supporting types.
- **VeinToolService Extension**: Added `getOrAnalyzeForSnapshot()` public export that returns raw `{ graph, inference, truncation }` for serialization purposes.

### Docs

- Updated `docs/internal/brain-storming.md`: Replaced placeholder text in Potential 2 (Regression Detection) with implementation summary. Added v1.0.0 updates to Potential 4 (Batch Audit for CI) and Potential 6 (Cross-Project Consistency). Added new Potential 7 (CI Pipeline Integration). Removed "Regression Detection" from Section 7.4 remaining weaknesses.

### Chores

- Registered 2 new tool schemas in `tool-schemas.ts`
- Registered 2 new tool handlers in `index.ts` (imports, tool definitions, switch/case)
- Added `serialized-graph.ts` to `domain/types/index.ts` barrel
- Bumped version to 0.3.0

## v0.2.0 (2026-05-14)

### Features

- **Performance Guards**: Added `maxFiles`, `maxFileSizeKB`, `timeoutMs` parameters to all 8 Vein-powered MCP tool schemas. The AST parser now hard-stops at configurable limits and gracefully degrades to a partial graph with truncation reporting.
- **AnalysisContext**: Consolidated all cross-cutting parameters into a single `AnalysisContext` interface. Eliminated the "boilerplate corridor" where every layer independently declared the same parameters. Adding a new cross-cutting parameter is now a 1-file change.
- **Cache key fix**: Performance parameters are now included in the analysis cache key, preventing stale truncated results from being returned when limits change.

### Chores

- Refactored `VeinToolService.ts` and `VeinAnalysisService.ts` to use `AnalysisContext` instead of per-function option types
- Updated all 8 Vein-powered tool handlers to construct `AnalysisContext` internally
- Updated `index.ts` to use a single `args as Record<string, unknown>` cast pattern

## v0.1.5 (2026-05-13)


### Docs

- Strengthen MCP identity in README: subtitle now includes "MCP Server:" prefix, added MCP Server badge, opening paragraph explicitly states MCP server identity
- Sharpen sensory-substitution framing: opening paragraph uses metaphor-first language ("sees characters, not composition"), "Why Rhizophora" section calls Semantic Layout Graph a "prosthetic vision system"
- Update package.json description to lead with "MCP server" and move `mcp-server` to first keyword
- Add `ui`, `design-tokens`, `react` keywords to package.json for better npm discoverability
- Update release checklist to include MCP identity verification steps

## v0.1.4 (2026-05-13)

### Fixes

- Fix Smithery badge URL in README: `servers/` -> `server/` (correct URL format)
- Fix `smithery.yaml` start command: `node build/index.js` -> `npx -y rhizophora` (uses published npm package directly)

## v0.1.0 (First Public Release)

### Features

- **13 MCP tools** combining Vein Propagation Engine (AST via @typescript-eslint/parser) with standalone regex-based detectors
- **Structural analysis**: `render_structural_diagram`, `analyze_component_tree`, `profile_screen_complexity`, `trace_component_import`
- **Layout auditing**: `detect_boundary_gaps`, `audit_design_tokens`, `detect_absolute_overlaps`
- **Performance profiling**: `detect_bridge_crossings`, `detect_render_traps`, `trace_shared_value_lineage`, `detect_nested_lists`
- **Semantic orchestration**: `audit_spacing_rhythm`, `audit_semantic_proximity`
- **Bipartite layout support**: StyleExtractor parses `contentContainerStyle` on ScrollView, FlatList, and SectionList
- **Foundation Check middleware**: Blocks rhythm/proximity analysis when children use hardcoded margins
- **CI/CD CLI integration**: `--ci`, `--json`, `--paired-files` flags
