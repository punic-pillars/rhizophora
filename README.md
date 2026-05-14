# Rhizophora

**Spatial Integrity & Layout Audit for React Native**

[![npm version](https://img.shields.io/npm/v/rhizophora.svg)](https://www.npmjs.com/package/rhizophora)
[![npm downloads](https://img.shields.io/npm/dm/rhizophora.svg)](https://www.npmjs.com/package/rhizophora)
[![MCP](https://img.shields.io/badge/MCP-Server-blue)](https://modelcontextprotocol.io)
[![GitHub](https://img.shields.io/badge/github-punic--pillars%2Frhizophora-blue)](https://github.com/punic-pillars/rhizophora)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

An AI reading your source code sees characters, not composition. It cannot tell that two components are too close, that a margin is leaking, or that an animation is running on the wrong thread. Rhizophora eliminates AI layout hallucinations by providing **Ground Truth** for your component tree -- translating static `.tsx` files into a deterministic layout audit that catches margin pollution, token deviations, and spacing gaps that an LLM would never see. A Model Context Protocol (MCP) server that plugs into any AI coding assistant. Three phases: **Guardians** catch pollution and performance bugs. **Architects** enforce layout hygiene. **Profilers** optimize for 60fps.

No server to run. No emulator. No runtime. Works offline, in CI/CD, or inside your AI coding session.

> *Rhizophora -- the mangrove whose prop roots spread above ground, connecting what's hidden beneath the surface. Like Vein Propagation, it reveals the invisible structure of your component trees.*

---

## Why Rhizophora

Standard linters check syntax. Rhizophora checks **runtime architecture**.

AI models cannot see your app's layout, feel its spacing rhythm, or know if design tokens are followed. They read tokens, not pixels. Rhizophora translates raw code into a **Semantic Layout Graph** -- a prosthetic vision system that gives AI the spatial awareness to see that two components are too close, a margin is leaking into a parent, or an animation value is being mutated on the wrong thread.

**Key differentiators:**
- **Deterministic, not probabilistic** -- Uses strict AST parsing and mathematical algorithms (3-variable Proximity Score). No AI guessing pixels, no hallucinations.
- **Native-specific intelligence** -- Catches bridge crossings, SharedValue thread violations, and ghost margins that standard linters cannot see.
- **Foundation Check enforcement** -- If children use hardcoded margins instead of parent `gap`, Rhizophora blocks the analysis with a HIGH severity message directing you to fix the foundation first. Opinionated gatekeeping that forces best practices.

### The Rhizome vs. The Hallucination

In nature, a rhizome is a hidden network that dictates where the plant can grow. In React Native, your design tokens and spatial constraints are that network. AI models hallucinate because they see the "leaves" but ignore the "roots." Rhizophora exposes the root system, ensuring that every generated component is anchored in your project's actual spatial reality.

---

## Tools (15 total)

> **Performance Guards (v0.2.0):** All Vein-powered tools (marked **[Vein-Powered AST]**) accept optional `maxFiles` (default 20), `maxFileSizeKB` (default 500), and `timeoutMs` (default 10000) to prevent runaway analysis on large codebases. When limits are hit, the analysis degrades gracefully with a truncation notice rather than failing.

> **Regression Detection (v0.3.0):** Two new serialization tools (`snapshot_layout_graph`, `diff_layout_graphs`) enable cross-commit layout regression detection. Snapshots are stored as `.rhizome/` JSON files that can be committed to git and compared across branches.

### Phase 1: Guardians -- Catch Pollution & Performance Bugs

| Tool | What it does |
|------|-------------|
| `detect_boundary_gaps` | **[Vein-Powered AST]** Scans for gap opportunities, style pollution, margin stacking, list item issues, and design token deviations. Supports bipartite layout components (ScrollView, FlatList, SectionList) -- extracts both `style` and `contentContainerStyle` for accurate gap detection. Modes: `vein-propagation` (default), `all` |
| `detect_bridge_crossings` | **[Standalone Regex]** UI Thread Guardian -- finds `useState`/`useEffect` inside `onScroll`, `onLayout`, worklets, and gesture handlers. Scans 17 handler patterns with cross-file hook propagation |
| `detect_render_traps` | **[Standalone Regex]** React.memo Enforcer -- detects inline functions, objects, and arrays passed to memoized components. Deep hook data-flow tracing + HOC unwrapping |
| `trace_shared_value_lineage` | **[Standalone Regex]** SharedValue Lifecycle Tracer -- tracks creation to mutation to consumption, catches direct-JSX-usage bug. Context propagation + delegated value resolution |
| `detect_nested_lists` | **[Vein-Powered AST]** Finds `.map()` inside `.map()` -- a known React Native performance anti-pattern |

### Phase 2: Architects -- Enforce Layout Hygiene

| Tool | What it does |
|------|-------------|
| `render_structural_diagram` | **[Standalone Regex]** Converts `.tsx`/`.jsx` into ASCII layout trees showing JSX nesting, StyleSheet properties, and animated styles. Uses 15-regex pattern engine -- no AST. Limited to uppercase components + view/text/animated/scrollview |
| `analyze_component_tree` | **[Vein-Powered AST]** Cross-file ASCII structural diagram with spacing annotations, slot markers, list item markers, and health score. Uses @typescript-eslint/parser + VenousPropagator for cross-file resolution |
| `profile_screen_complexity` | **[Vein-Powered AST]** Generates a Bill of Materials: total components, max depth, container/leaf ratio, complexity grade |
| `trace_component_import` | **[Vein-Powered AST]** Traces a component's import chain from usage to source definition through barrel files and re-exports |
| `audit_design_tokens` | **[Vein-Powered AST]** Scans for spacing values not in the design token whitelist. Reports each deviation with suggested replacement |
| `detect_absolute_overlaps` | **[Vein-Powered AST]** Finds absolutely-positioned elements, reports position/zIndex/dimensions, flags missing zIndex or dimensions |

### Phase 3: Profilers -- Optimize for 60fps

| Tool | What it does |
|------|-------------|
| `audit_spacing_rhythm` | **Orchestration** -- Enforces `inner_gap < outer_gap` to prevent flat UIs. **Includes Foundation Check**: blocked if children use hardcoded margins instead of parent gap |
| `audit_semantic_proximity` | **Orchestration** -- Clusters sibling components by semantic prefix to detect ungrouped related components. **Includes Foundation Check**: blocked if container has margin pollution |

### Phase 4: Regression Detection -- Prevent Layout Drift

| Tool | What it does |
|------|-------------|
| `snapshot_layout_graph` | **[Serialization]** Serializes the full Semantic Layout Graph (component tree, spacing annotations, layout properties, violation counts, health score, complexity profile) to a `.rhizome/` JSON file. Captures git commit hash and timestamp for cross-commit comparison |
| `diff_layout_graphs` | **[Serialization]** Compares two layout graph snapshots and produces a structured diff report showing structural changes (nodes added/removed), spacing changes (margin/padding/gap deltas), violation count changes, health score changes, and complexity grade changes |

---

## Recommended Workflow

```
Phase 1: Guardians (understand the component)
  render_structural_diagram  ->  profile_screen_complexity
  trace_component_import     ->  detect_render_traps

Phase 2: Architects (fix layout & spacing)
  detect_boundary_gaps       ->  audit_design_tokens
  detect_absolute_overlaps
  audit_spacing_rhythm       ->  audit_design_tokens
  audit_semantic_proximity   ->  audit_spacing_rhythm

Phase 3: Profilers (optimize rendering)
  detect_bridge_crossings    ->  trace_shared_value_lineage
  detect_render_traps
  detect_nested_lists        ->  detect_boundary_gaps

Phase 4: Regression Detection (prevent layout drift)
  snapshot_layout_graph      ->  [make changes]  ->  snapshot_layout_graph  ->  diff_layout_graphs
```

**Foundation Check**: `audit_spacing_rhythm` and `audit_semantic_proximity` both run a Foundation Check before analysis. If a container's children use hardcoded margins instead of parent-controlled `gap`, the analysis is blocked with a HIGH severity message directing you to run `detect_boundary_gaps` first. This prevents suggesting semantic grouping or rhythm scaling on top of polluted spacing architecture.

---

## Quick Start

```bash
# Install and build
npm install
npm run build

# Run smoke tests
npx tsx src/__tests__/smoke-test.ts
```

### Add to MCP Settings

**Option 1: Via npx (no install needed)**
```json
{
  "mcpServers": {
    "rhizophora": {
      "disabled": false,
      "timeout": 60,
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "rhizophora"]
    }
  }
}
```

**Option 2: Local install**
```json
{
  "mcpServers": {
    "rhizophora": {
      "disabled": false,
      "timeout": 60,
      "type": "stdio",
      "command": "node",
      "args": ["/absolute/path/to/rhizophora/build/index.js"]
    }
  }
}
```

---

## How It Works

The Vein Propagation Engine processes source code through 4 deterministic phases:

1. **AST Parse** -- Parses `.tsx`/`.ts` files into a TypeScript AST using `@typescript-eslint/typescript-estree`
2. **Venous Propagate** -- Recursively walks the component tree, following imports and resolving functional components across files
3. **Build Semantic Layout Graph** -- Creates a graph where nodes = components with spacing tokens, edges = parent-child relationships
4. **Heuristic Inference** -- Analyzes the graph to detect layout issues using mathematical algorithms (not AI)

**100% deterministic.** No emulator, no runtime, no pixel guessing. Works directly from source code.

### Key Issues Detected

| Issue | Severity | Description |
|-------|----------|-------------|
| Gap Opportunities | High | Containers using child margins instead of parent `gap` |
| Style Pollution | High/Medium | Base components with hardcoded margins |
| Bridge Crossings | High | JS-thread blocking logic in UI-thread handlers |
| Render Traps | High | Inline props defeating React.memo |
| Foundation Blockers | High | Children use hardcoded margins -- must fix spacing before semantic analysis |

---

## CI/CD Integration

```bash
# Check files (exit code 1 on failure)
npx rhizophora-cli --ci src/components/MyComponent.tsx

# JSON output for pipeline parsing
npx rhizophora-cli --ci --json src/**/*.tsx
```

| Flag | Description |
|------|-------------|
| `--ci` | Exit with code 1 if any issues found |
| `--json` | Output results as JSON for pipeline parsing |
| `--paired-files` | Compare files in pairs (0,1), (2,3), etc. |

---

## Philosophy

**Read-only static analysis.** Rhizophora works from source code, producing deterministic results without needing a running app. Fast, reliable, works in CI/CD.

**What it does NOT do:**
- Guess Flexbox coordinates (AI cannot calculate layout from code)
- Require an emulator or running app
- Validate hardcoded math equations (they evolve too fast)
- Summarize what an AI can already read from source code

> **Full architecture reference**: See [`docs/reference.md`](docs/reference.md) for the complete annotated file tree, design patterns, module deep dives, and coding conventions.
