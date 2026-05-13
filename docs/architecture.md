# Vein Propagation Engine — Architecture Reference

**Version:** v0.1.0 (First Public Release)
**Engine type:** AST-driven static analysis via `@typescript-eslint/parser`
**Scope:** React Native `.tsx`/`.jsx` layout analysis — no emulator required

---

## 1. High-Level Pipeline

The Vein Propagation Engine processes source code through 4 sequential phases:

```
  Source Code (.tsx / .ts)
  ========================
            |
            v
  +---------------------------+
  |  PHASE 1: PARSE           |
  |  ASTParser                |
  |  ASTExtractor             |
  |  ImportResolver           |
  +---------------------------+
            |
            |  ParsedFile
            |  (AST + imports + exports + reExports)
            v
  +---------------------------+
  |  PHASE 2: BUILD           |
  |  VenousPropagator         |
  |    |- StyleExtractor      |  (spacing + layout per node)
  |    |- SlotDetector        |  (slot markers)
  |    |- ComponentResolver   |  (cross-file resolution)
  |    |- JSXHelpers          |  (tag/child/attribute queries)
  +---------------------------+
            |
            |  SemanticLayoutGraph
            |  (tree of LayoutNode instances)
            v
  +---------------------------+
  |  PHASE 3: ANALYZE         |
  |  HeuristicInferenceEngine |
  |    |- GraphAnalyzer       |  (gap/style/margin/list/rhythm)
  |    |- SemanticScorer      |  (proximity scoring)
  |    |- TokenDeviationDet.  |  (design token validation)
  |    |- FoundationCheck     |  (gatekeeper for rhythm/proximity)
  +---------------------------+
            |
            |  InferenceResult
            |  (8+ issue categories + health score)
            v
  +---------------------------+
  |  PHASE 4: RENDER          |
  |  GraphRenderer            |  (ASCII tree diagrams)
  |  HeuristicInferenceEngine |  (summary reports)
  +---------------------------+
            |
            v
  Tool Output (text/JSON)
```

---

## 2. Module Dependency Map

```
  ASTParser
    |-- ASTExtractor          (import/export/reExport extraction)
    |-- ImportResolver        (path resolution: .ts/.tsx/.js/.jsx/index.*)
    |-- types.ts              (ParsedFile, ImportInfo, ComponentDef, ReExportInfo)
    |
    v
  VenousPropagator
    |-- ASTParser             (parseFile for cross-file resolution)
    |-- StyleExtractor        (extractStyle: spacing + layout from JSX)
    |-- SlotDetector          (detectSlot: {props.children} pattern)
    |-- ComponentResolver     (resolveComponent: follow imports)
    |-- JSXHelpers            (getJSXTagName, getJSXChildren, getOpeningElement, hasJSXAttribute)
    |-- SemanticLayoutGraph   (createNode, addChild, setSlot)
    |-- constants.ts          (KNOWN_LEAF_PRIMITIVES, RN_ANIMATED_PRIMITIVES)
    |-- types.ts              (LayoutNode, ResolvedComponent, ExtractedStyles)
    |
    v
  SemanticLayoutGraph         (pure data structure — no analysis logic)
    |-- types.ts              (LayoutNode, SpacingTokens, LayoutProperties)
    |
    v
  HeuristicInferenceEngine    (orchestrator)
    |-- GraphAnalyzer         (findGapOpportunities, findStylePollution, findMarginStacking,
    |                           findListItemIssues, findContextualGapViolations,
    |                           findBoundaryViolations, findTerminalPaddingViolations,
    |                           findGroupingSuggestions, findFunctionalClusters)
    |-- SemanticScorer        (computeScore: Lexical 40% + Prop DNA 30% + Visual 30%)
    |-- TokenDeviationDetector (findDeviations: validate spacing against token whitelist)
    |-- FoundationCheck       (hasChildMarginPollution, hasCumulativePaddingBoundary)
    |-- GraphRenderer         (renderAscii: ASCII tree output)
    |-- types.ts              (InferenceResult, all violation types)
    |
    v
  VeinToolService             (shared cache + MCP tool query methods)
    |-- VenousPropagator
    |-- HeuristicInferenceEngine
    |-- GraphAnalyzer
    |-- TokenDeviationDetector
    |-- FoundationCheck
    |-- SemanticScorer
    |-- ComponentResolver
    |-- ASTParser
```

---

## 3. Phase Details

### Phase 1 — Parse

**Entry point:** `parseFile(filePath: string): ParsedFile`

| Module | Input | Output | Responsibility |
|--------|-------|--------|----------------|
| `ASTParser.ts` | File path | `ParsedFile` | Reads file from disk, parses with `@typescript-eslint/parser` (JSX-aware), delegates extraction |
| `ASTExtractor.ts` | AST + filePath | `Map<string, ImportInfo>`, `Map<string, ComponentDef>`, `Map<string, ReExportInfo>` | Walks AST body to find import declarations, export declarations, and re-export statements |
| `ImportResolver.ts` | Import path + base dir | Resolved absolute path | Tries `.ts`, `.tsx`, `.js`, `.jsx`, `index.ts`, `index.tsx`, `index.js`, `index.jsx` |

**Key data structure — `ParsedFile`:**
```typescript
interface ParsedFile {
  filePath: string;           // Absolute path to the source file
  source: string;             // Raw file contents
  ast: TSESTree.Program;      // Full TypeScript AST
  imports: Map<string, ImportInfo>;           // Import name -> import info
  exportedComponents: Map<string, ComponentDef>;  // Export name -> component def
  reExports: Map<string, ReExportInfo>;       // Re-export name -> re-export info
}
```

### Phase 2 — Build (Venous Propagation)

**Entry point:** `VenousPropagator.propagate(filePath: string): SemanticLayoutGraph`

The propagator walks the component tree recursively, starting from the first exported component in the entry file. For each JSX element encountered:

1. **StyleExtractor** extracts spacing and layout properties from the `style` attribute (inline objects, StyleSheet references, and array combinations). For bipartite layout components (ScrollView, FlatList, SectionList), it also extracts from `contentContainerStyle` and merges inner-layout properties (gap, padding, alignItems, justifyContent) into the result.

2. **SlotDetector** checks if a custom component is a "slot" (renders `{props.children}`). Slot components are marked as transparent in the graph — their children are walked and attached to the slot node.

3. **ComponentResolver** resolves custom component names to their source definitions by following import chains. Uses a file cache to avoid re-parsing.

4. **JSXHelpers** provides utility functions for extracting tag names, children, opening elements, and attribute presence from JSX AST nodes.

**Key data structure — `LayoutNode`:**
```typescript
interface LayoutNode {
  id: string;                 // Unique node ID (node_0, node_1, ...)
  componentName: string;      // e.g., "View", "StationCard", "Text"
  tagName: string;            // Same as componentName for primitives
  filePath: string;           // Source file where this node was defined
  lineNumber: number;         // Line number in source file
  spacing: SpacingTokens;     // margin, padding, gap values
  layout: LayoutProperties;   // flexDirection, position, width, height, etc.
  isPrimitive: boolean;       // True for View, Text, Image, etc.
  isCustomComponent: boolean; // True for user-defined components
  children: LayoutNode[];     // Child nodes
  parentId: string | null;    // Parent node ID
  hasOnLayout: boolean;       // Has onLayout handler
  isListItem: boolean;        // Inside a .map() callback
  pollutionScore: number;     // Accumulated style pollution
  tokenDeviations: TokenDeviation[];  // Design token violations
  isSlot: boolean;            // Transparent container (renders props.children)
  contextCalls: string[];     // Context hook calls (useTheme, etc.)
}
```

**Key data structure — `SemanticLayoutGraph`:**
```typescript
class SemanticLayoutGraph {
  private nodes: Map<string, LayoutNode>;  // All nodes by ID
  private rootId: string | null;           // Root node ID

  createNode(params): string;              // Returns new node ID
  addChild(parentId, childId): void;       // Links parent -> child
  getNode(id): LayoutNode | undefined;
  getRoot(): LayoutNode | undefined;
  getAllNodes(): LayoutNode[];
  getLeafNodes(): LayoutNode[];            // No children
  getContainerNodes(): LayoutNode[];       // Has children
  getDepth(nodeId): number;                // Distance from root
  setSlot(nodeId): void;                   // Mark as transparent
  addContextCall(nodeId, name): void;      // Track context usage
}
```

### Phase 3 — Analyze

**Entry point:** `HeuristicInferenceEngine.analyze(graph: SemanticLayoutGraph): InferenceResult`

The engine delegates to specialized analyzers:

#### 3a. GraphAnalyzer (7 detection methods)

| Method | What it detects |
|--------|-----------------|
| `findGapOpportunities` | Containers using child margins instead of parent `gap` |
| `findStylePollution` | Base components with hardcoded margins (skips slots) |
| `findMarginStacking` | Parent padding + child margin creating double spacing |
| `findListItemIssues` | `.map()` items with marginBottom but no last-item guard |
| `findContextualGapViolations` | Intra-Section (score > 6, target 8px) and Inter-Section (score < 4, target 16px) gap violations |
| `findBoundaryViolations` | Last child must have zero marginBottom |
| `findTerminalPaddingViolations` | Last child redundant paddingBottom overlapping with container padding |
| `findGroupingSuggestions` | Run-length encoding for 3+ consecutive high-scoring siblings without shared parent |
| `findFunctionalClusters` | Form-Input Pair heuristic, Functional-Role Proximity Capping |

#### 3b. SemanticScorer

3-variable deterministic scoring engine (no AI/ML):

| Variable | Weight | Max Points | How it works |
|----------|--------|------------|--------------|
| Lexical Similarity | 40% | 4.0 | Longest common prefix + camelCase splitting of component names |
| Prop DNA | 30% | 3.0 | Shared context calls + data indicator patterns (data, item, etc.) |
| Visual Category | 30% | 3.0 | Exact name match, tag name match, category suffix match |

#### 3c. TokenDeviationDetector

Validates all spacing values (margin, padding, gap) against a whitelist of design tokens (default: `[4, 8, 12, 16, 24, 32]`). Reports each deviation with the offending value, property, and suggested nearest token replacement.

#### 3d. FoundationCheck (Gatekeeper)

Two pure predicates that block rhythm/proximity analysis when the spacing architecture is polluted:

- `hasChildMarginPollution(container)` — Returns `true` if container does NOT use `gap` AND any child uses hardcoded margins. When true, semantic/rhythm analysis is blocked with a HIGH severity message directing the user to run `detect_boundary_gaps` first.

- `hasCumulativePaddingBoundary(container)` — Returns a `GhostMarginResult` if both the container and its last child have explicit `paddingBottom`, creating redundant boundary spacing.

**Key data structure — `InferenceResult`:**
```typescript
interface InferenceResult {
  gapOpportunities: GapOpportunity[];           // Containers using child margins
  stylePollution: StylePollution[];             // Base components with hardcoded margins
  marginStacking: MarginStacking[];             // Parent padding + child margin
  listItemIssues: ListItemIssue[];              // .map() items without last-item guard
  tokenDeviations: TokenDeviation[];            // Non-whitelist spacing values
  rhythmViolations: RhythmViolation[];          // Legacy: child gap >= parent gap
  proximityIssues: ProximityIssue[];            // Ungrouped related siblings
  contextualGapViolations: ContextualGapViolation[];  // Intra/Inter section gaps
  boundaryViolations: BoundaryViolation[];      // Last child marginBottom
  groupingSuggestions: GroupingSuggestion[];    // Rule of Three
  terminalPaddingViolations: TerminalPaddingViolation[];  // Ghost margins
  healthScore: number;                          // 0-100 (100 = perfect)
}
```

### Phase 4 — Render

**GraphRenderer** produces ASCII tree diagrams from the SemanticLayoutGraph. Shows:
- JSX nesting with indentation
- Component names and tag names
- Spacing annotations (margin, padding, gap values)
- Layout properties (flexDirection, position, zIndex)
- Slot markers
- List item markers
- Health score

**HeuristicInferenceEngine.generateSummaryReport()** produces a formatted text report with all detected issues grouped by severity.

---

## 4. VeinToolService — MCP Integration Layer

`VeinToolService.ts` provides the shared cache and query methods that all Vein-powered MCP tools call into.

### Cache Architecture

```typescript
interface CachedAnalysis {
  graph: SemanticLayoutGraph;      // Built once per file
  inference: InferenceResult;      // Analyzed once per file
  parsed: ParsedFile;              // Parsed once per file
}

interface CacheEntry {
  data: CachedAnalysis;
  mtimeMs: number;                 // File modification time for invalidation
}

const analysisCache = new Map<string, CacheEntry>();
```

The cache key is `{absolutePath}::{designTokens}`. Cache invalidation uses `fs.statSync().mtimeMs` — if the file is edited, the cache is automatically invalidated on the next request.

### Tool-to-Method Mapping

| MCP Tool | VeinToolService Method | What it returns |
|----------|------------------------|-----------------|
| `analyze_component_tree` | `getComponentTree()` | ASCII tree diagram via GraphRenderer |
| `profile_screen_complexity` | `getScreenProfile()` | Bill of Materials (component count, depth, ratio, grade) |
| `trace_component_import` | `getImportChain()` | Import resolution path |
| `audit_design_tokens` | `getTokenDeviations()` | Token deviation list |
| `detect_nested_lists` | `getNestedLists()` | Nested .map() locations |
| `detect_absolute_overlaps` | `getAbsoluteOverlaps()` | Absolutely-positioned elements |
| `detect_boundary_gaps` | `getBoundaryGaps()` | Gap opportunities + style pollution + margin stacking + list issues |
| `audit_spacing_rhythm` | `getRhythmAudit()` | Contextual gap violations + boundary violations + terminal padding violations (gated by FoundationCheck) |
| `audit_semantic_proximity` | `getProximityAudit()` | Proximity scores + grouping suggestions (gated by FoundationCheck) |

### Foundation Check Integration

Both `getRhythmAudit()` and `getProximityAudit()` run `hasChildMarginPollution()` before analysis. If the container is polluted, they return a HIGH severity blocker message instead of analysis results, directing the user to run `detect_boundary_gaps` first.

---

## 5. Known Limitations

| Limitation | Impact | Location |
|------------|--------|----------|
| Max depth cap at 10 | Deeply nested component trees truncated | `VenousPropagator.ts` line 64 — `maxDepth: 10` |
| Fragment collapse | Complex fragments may collapse into single nodes | `analyze_component_tree` weakness |
| Inline styles partially missed | `audit_design_tokens` may miss inline style values | `StyleExtractor.ts` — inline styles are still parsed, but dynamic expressions are not |
| No Flexbox coordinate calculation | Cannot predict actual rendered positions | By design — read-only static analysis |
| No runtime value resolution | Variables and computed values not resolved | By design — static analysis only |

---

## 6. Version History (Engine Only)

| Version | Changes |
|---------|---------|
| v0.1.0 | First Public Release. Bipartite Layout Support — StyleExtractor now parses `contentContainerStyle` on ScrollView, FlatList, and SectionList. Inner-layout properties (gap, padding, alignItems, justifyContent) from contentContainerStyle override outer style values, eliminating false-positive [Section Collision] and [style-pollution] warnings for scrollable containers. Includes all prior engine iterations: Vein Propagation, Semantic Layout Graph, Heuristic Inference Engine, Foundation Check middleware, Rhythm Hierarch, Semantic Proximity Auditor, Contextual Gap Violations, Terminal Padding Violation detection, Functional Clusters, and Run-Length Cluster Encoding. |
