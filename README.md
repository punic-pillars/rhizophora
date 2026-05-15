# Rhizophora

**ESLint for UI -- catch layout bugs, margin pollution, and performance traps in React Native**

[![npm version](https://img.shields.io/npm/v/rhizophora.svg)](https://www.npmjs.com/package/rhizophora)
[![npm downloads](https://img.shields.io/npm/dm/rhizophora.svg)](https://www.npmjs.com/package/rhizophora)
[![MCP](https://img.shields.io/badge/MCP-Server-blue)](https://modelcontextprotocol.io)
[![GitHub](https://img.shields.io/badge/github-punic--pillars%2Frhizophora-blue)](https://github.com/punic-pillars/rhizophora)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

An AI reading your source code sees characters, not composition. It cannot tell that two components are too close, that a margin is leaking, or that an animation is running on the wrong thread.

Rhizophora is **ESLint for UI**: static analysis for your React Native component tree. It catches margin pollution, bridge crossings, render traps, and design token deviations -- without an emulator, without a runtime, and without guessing pixels.

No server to run. Works offline, in CI/CD, or inside your AI coding session.

---

## Features

- **Catch layout gaps & margin pollution** -- Detect inconsistent spacing between containers and children, ghost margins, and missing last-item guards
- **Detect performance traps** -- Find bridge crossings (JS-thread blocking in UI handlers), render traps (inline props defeating React.memo), and SharedValue thread violations
- **Enforce design tokens** -- Validate all spacing values against your token whitelist. Flag deviations with suggested replacements
- **Snapshot & diff layout across commits** -- Serialize the full component tree to `.rhizome/` JSON files. Compare snapshots to catch layout drift before merge
- **AI-friendly MCP tools** -- 15 tools that plug into Claude, Cursor, Continue.dev, and any MCP-compatible coding assistant

> See Rhizophora catch real layout bugs in a deliberately broken React Native app: [docs/audit-case-study.md](docs/audit-case-study.md) -- includes annotated screenshots and Rhizophora audit output

---

## Quick Start

```bash
# Analyze a component
npx rhizophora-cli --ci src/components/StationCard.tsx
```

**Output:**

```
FAIL: src/components/StationCard.tsx
  Bridge Crossings: 2 | Render Traps: 1 | SharedValue Issues: 0 | Boundary Gaps: 3
  Details:
    [high] onScroll -> useState (line 42) -- replace with useSharedValue
    [high] onLayout -> useEffect (line 67) -- move to worklet
    [medium] container paddingBottom:16 + last child marginBottom:16 = 32px total gap
    [medium] <StationTitle> marginTop: 16 -- use parent gap instead
    [low] <CardBody> marginHorizontal: 12 -- consider design token 8 or 16

Summary: 1 file(s) scanned, 6 total issue(s)
   0 passed, 1 failed
```

---

## Available Tools

<details>
<summary><strong>Guardians (5 tools)</strong> -- catch pollution & performance bugs</summary>

| Tool | What it does |
|------|-------------|
| `detect_boundary_gaps` | Scan for inconsistent spacing, style pollution, margin stacking, and design token deviations |
| `detect_bridge_crossings` | Find useState/useEffect inside onScroll, onLayout, gesture handlers, and worklets |
| `detect_render_traps` | Detect inline functions, objects, and arrays passed to React.memo() wrapped components |
| `trace_shared_value_lineage` | Trace useSharedValue lifecycle: declarations, mutations, consumption, and thread violations |
| `detect_nested_lists` | Find .map() inside .map() -- a known React Native performance anti-pattern |

</details>

<details>
<summary><strong>Architects (6 tools)</strong> -- enforce layout hygiene</summary>

| Tool | What it does |
|------|-------------|
| `render_structural_diagram` | Render ASCII structural diagrams showing JSX nesting, StyleSheet properties, and layout relationships |
| `analyze_component_tree` | Cross-file ASCII structural diagram with spacing annotations, slot markers, and health score |
| `profile_screen_complexity` | Generate a Bill of Materials: component count, max depth, container/leaf ratio, complexity grade |
| `trace_component_import` | Trace a component's import chain from usage to source definition through barrel files |
| `audit_design_tokens` | Scan for spacing values not in the design token whitelist with suggested replacements |
| `detect_absolute_overlaps` | Find absolutely-positioned elements and flag missing zIndex or dimensions |

</details>

<details>
<summary><strong>Profilers (2 tools)</strong> -- optimize for 60fps</summary>

| Tool | What it does |
|------|-------------|
| `audit_spacing_rhythm` | Validate gaps using Proximity Score between siblings. Enforces inner_gap < outer_gap |
| `audit_semantic_proximity` | 3-variable Semantic Scoring Engine (Lexical 40% + Prop DNA 30% + Visual 30%) |

</details>

<details>
<summary><strong>Regression Detection (2 tools)</strong> -- prevent layout drift</summary>

| Tool | What it does |
|------|-------------|
| `snapshot_layout_graph` | Serialize the full Semantic Layout Graph to a .rhizome/ JSON file for cross-commit diffing |
| `diff_layout_graphs` | Compare two layout graph snapshots: structural changes, spacing deltas, health score changes |

</details>

> **Full detector reference** with violation examples, fix suggestions, and code snippets: see [`docs/reference.md`](docs/reference.md)

---

## Installation

<details>
<summary><strong>Claude Desktop</strong></summary>

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "rhizophora": {
      "command": "npx",
      "args": ["-y", "rhizophora"]
    }
  }
}
```

</details>

<details>
<summary><strong>Cursor</strong></summary>

Create `.cursor/mcp.json` in your project root:

```json
{
  "mcpServers": {
    "rhizophora": {
      "command": "npx",
      "args": ["-y", "rhizophora"]
    }
  }
}
```

</details>

<details>
<summary><strong>Continue.dev (VS Code / JetBrains)</strong></summary>

Add to `~/.continue/config.json`:

```json
{
  "experimental": {
    "mcpServers": {
      "rhizophora": {
        "command": "npx",
        "args": ["-y", "rhizophora"]
      }
    }
  }
}
```

</details>

<details>
<summary><strong>Local install (no network)</strong></summary>

```json
{
  "mcpServers": {
    "rhizophora": {
      "command": "node",
      "args": ["/absolute/path/to/rhizophora/build/index.js"]
    }
  }
}
```

</details>

<details>
<summary><strong>CI/CD (GitHub Actions / GitLab)</strong></summary>

**GitHub Actions** -- `.github/workflows/rhizophora.yml`:

```yaml
name: Layout Audit
on: [pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci && npm run build
      - run: npx rhizophora-cli --ci --json src/ > layout-report.json
      - uses: actions/upload-artifact@v4
        with: { name: layout-report, path: layout-report.json }
```

**GitLab CI**:

```yaml
rhizophora-audit:
  stage: test
  image: node:20
  script:
    - npm ci && npm run build
    - npx rhizophora-cli --ci --json src/ > layout-report.json
  artifacts: { paths: [layout-report.json] }
```

**CLI flags:** `--ci` (exit code 1 on failure), `--json` (JSON output), `--paired-files` (compare in pairs)

</details>

<details>
<summary><strong>Environment variables</strong></summary>

| Variable | Default | Description |
|----------|---------|-------------|
| `RHIZOPHORA_MAX_FILES` | `20` | Max files to parse before truncating |
| `RHIZOPHORA_MAX_FILE_SIZE_KB` | `500` | Skip files larger than this |
| `RHIZOPHORA_TIMEOUT_MS` | `10000` | Analysis timeout in milliseconds |

</details>

---

## Snapshot & Diff Workflow

Prevent layout drift across commits in 4 steps:

1. **Establish a baseline** -- Call `snapshot_layout_graph` after a known-good layout state. Creates `.rhizome/baseline.json`
2. **Commit `.rhizome/` to git** -- These JSON files (2-10 KB each) are your layout regression test suite
3. **Take a new snapshot** -- Call `snapshot_layout_graph` again after making changes
4. **Compare** -- Call `diff_layout_graphs` with the two snapshot paths. Reports structural changes, spacing deltas, violation count changes, and health score changes

> **Detailed walkthrough with example diff output**: see [`docs/reference.md`](docs/reference.md)

---

## Why Rhizophora?

| Problem | ESLint | react-native-performance | Detox | Rhizophora |
|---------|--------|--------------------------|-------|------------|
| Detect inconsistent spacing gaps | :x: | :x: | :x: | :heavy_check_mark: |
| Catch bridge crossings (JS thread blocking) | :x: | :x: | :x: | :heavy_check_mark: |
| Detect render traps (inline props defeating memo) | :x: | :x: | :x: | :heavy_check_mark: |
| Trace SharedValue lifecycle across threads | :x: | :x: | :x: | :heavy_check_mark: |
| Snapshot layout state across commits | :x: | :x: | :x: | :heavy_check_mark: |
| Diff layout graphs between branches | :x: | :x: | :x: | :heavy_check_mark: |
| Validate design token compliance | :x: | :x: | :x: | :heavy_check_mark: |
| Detect nested list anti-patterns | :x: | :x: | :x: | :heavy_check_mark: |
| AI-friendly MCP tools | :x: | :x: | :x: | :heavy_check_mark: |
| Static analysis (no emulator/runtime) | :heavy_check_mark: | :x: | :x: | :heavy_check_mark: |

**Key differentiators:**
- **Deterministic, not probabilistic** -- Strict AST parsing and mathematical algorithms. No AI guessing pixels
- **Native-specific intelligence** -- Catches bridge crossings, SharedValue thread violations, and ghost margins that standard linters cannot see
- **Foundation Check enforcement** -- Blocks analysis if children use hardcoded margins instead of parent `gap`. Opinionated gatekeeping that forces best practices

---

## Version Compatibility

| Requirement | Supported Versions |
|-------------|-------------------|
| Node.js | >= 18.0.0 |
| TypeScript | >= 5.0 (recommended) |
| React Native | 0.72 -- 0.76 (tested) |
| Expo SDK | 49 -- 52 (compatible) |
| React Native Reanimated | 2.x -- 3.x |

---

## Limitations

| Limitation | Impact |
|------------|--------|
| Fragment collapse | Complex fragments may collapse into single nodes in `analyze_component_tree` |
| Inline styles partially missed | Dynamic expressions (e.g., `marginTop: isActive ? 16 : 8`) not resolved statically |
| No Flexbox coordinate calculation | Cannot predict actual rendered positions (by design) |
| No runtime value resolution | Variables and computed values not resolved (by design) |
| Expo Router file-based routing | Not fully supported -- detectors work on individual screen files |

---

> **Full documentation**: Detector reference with violation examples and fix suggestions, MCP tool call JSON schemas, visual layout graph ASCII examples, recommended workflow, and architecture deep dive in [`docs/reference.md`](docs/reference.md)
