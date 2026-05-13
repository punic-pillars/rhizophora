# Changelog

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
