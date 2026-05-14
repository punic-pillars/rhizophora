# Changelog

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
