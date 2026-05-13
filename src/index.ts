#!/usr/bin/env node
// ============================================================
// index.ts — MCP Server Bootstrap
// Rhizophora: Architectural X-Ray for React Native
// v0.1.0 — First public release. 13 MCP tools combining
//   Vein Propagation Engine (AST via @typescript-eslint/parser)
//   with standalone regex-based detectors for layout analysis,
//   performance profiling, and semantic orchestration.
// ============================================================

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { TOOL_INPUT_SCHEMAS } from './domain/types/index.js';
import { handleRenderStructuralDiagram } from './tools/renderDiagram.js';
import { handleDetectBoundaryGaps } from './tools/boundaryGaps.js';
import { handleDetectBridgeCrossings } from './tools/bridgeCrossings.js';
import { handleDetectRenderTraps } from './tools/renderTraps.js';
import { handleTraceSharedValueLineage } from './tools/sharedValueLineage.js';
import { handleAnalyzeComponentTree } from './tools/componentTree.js';
import { handleProfileScreenComplexity } from './tools/screenComplexity.js';
import { handleTraceComponentImport } from './tools/componentImport.js';
import { handleAuditDesignTokens } from './tools/designTokens.js';
import { handleDetectNestedLists } from './tools/nestedLists.js';
import { handleDetectAbsoluteOverlaps } from './tools/absoluteOverlaps.js';
import { handleAuditSpacingRhythm } from './tools/spacingRhythm.js';
import { handleAuditSemanticProximity } from './tools/semanticProximity.js';

// ─── Server Definition ───────────────────────────────────────

const server = new Server(
  {
    name: 'rhizophora',
    version: '0.1.0',
    description: 'Rhizophora: Architectural X-Ray for React Native. ' +
      'Combines a Vein Propagation Engine (AST via @typescript-eslint/parser) for layout analysis ' +
      'with standalone regex-based detectors for performance issues (bridge crossings, render traps, SharedValue lifecycle). ' +
      'Reveals hidden component structure, detects layout gaps, bridge crossings, render traps, and SharedValue lifecycle issues. ' +
      '13 MCP tools covering structural analysis, layout auditing, performance profiling, and semantic orchestration.',
  },

  {
    capabilities: {
      tools: {},
    },
  }
);

// ─── Tool Definitions ────────────────────────────────────────

const TOOL_DEFINITIONS = [
    {
      name: 'render_structural_diagram',
      description: `[Standalone Regex] [Architect] Read a .tsx/.jsx file and render an ASCII structural diagram showing JSX nesting, StyleSheet properties (position, zIndex, dimensions), animated styles, and layout relationships. Uses a 15-regex pattern engine (StructuralParser.ts) — no AST. Limited to components starting with uppercase + view/text/animated/scrollview. → Hand-off: call profile_screen_complexity after this to score complexity. Out of scope: Performance or styling — only maps "what sits inside what."`,
      inputSchema: TOOL_INPUT_SCHEMAS.render_structural_diagram,
    },
    {
      name: 'detect_boundary_gaps',
      description: `[Vein-Powered AST] [Layout Auditor] Scan a .tsx/.jsx file for layout gaps: hardcoded magic numbers, missing onLayout handlers, zero-height children, and design token deviations. Uses the Vein Propagation Engine (AST via @typescript-eslint/parser) for full tree analysis. Supports bipartite layout components (ScrollView, FlatList, SectionList) — extracts both 'style' and 'contentContainerStyle' for accurate gap detection. → Hand-off: call audit_design_tokens after this to verify spacing uses valid tokens. Out of scope: Value auditing — only cares that a margin was used where gap/padding belonged.`,
      inputSchema: TOOL_INPUT_SCHEMAS.detect_boundary_gaps,
    },
    {
      name: 'detect_bridge_crossings',
      description: `[Standalone Regex] [Performance Pillar] Scan a .tsx/.jsx file for useState/useEffect calls inside onScroll, onLayout, gesture handlers, and worklet functions. These "bridge crossings" block the UI thread and cause jank. Uses regex-based scanning across 17 handler patterns. Cross-file hook propagation via followImports(). Reports each crossing with severity and fix suggestion. → Hand-off: call trace_shared_value_lineage after this to optimize animation lineage.`,
      inputSchema: TOOL_INPUT_SCHEMAS.detect_bridge_crossings,
    },
    {
      name: 'detect_render_traps',
      description: `[Standalone Regex] [Performance Pillar] Scan a .tsx/.jsx file for inline functions, objects, and arrays passed as props to React.memo() wrapped components. These create new references every render, defeating memoization. Uses regex-based detection with deep hook data-flow tracing and HOC unwrapping. Reports each trap with severity and fix suggestion.`,
      inputSchema: TOOL_INPUT_SCHEMAS.detect_render_traps,
    },
    {
      name: 'trace_shared_value_lineage',
      description: `[Standalone Regex] [Animation Profiler] Trace useSharedValue lifecycle in a .tsx/.jsx file: declarations, mutations (.value =), consumption (useAnimatedStyle), direct-JSX-usage bug pattern, prop propagation, context propagation, and non-worklet mutations. Uses regex-based scanning with context propagation and delegated value resolution. → Hand-off: after fixing JS-thread mutations, re-run to verify. Out of scope: Any UI element that isn't a useSharedValue or Animated component.`,
      inputSchema: TOOL_INPUT_SCHEMAS.trace_shared_value_lineage,
    },

    // ─── New Vein-Powered Tools ────────────────────────────────

    {
      name: 'analyze_component_tree',
      description: `[Vein-Powered AST] [Architect] Read a .tsx/.jsx file and render a cross-file ASCII structural diagram showing JSX nesting, spacing annotations (margins, padding, gap), layout properties (flex, position, zIndex), slot markers, list item markers, and health score. Uses the Vein Propagation Engine (AST via @typescript-eslint/parser + VenousPropagator) for full cross-file component resolution. → Hand-off: call profile_screen_complexity after this to score complexity. Weakness: May collapse complex fragments into single nodes.`,
      inputSchema: TOOL_INPUT_SCHEMAS.analyze_component_tree,
    },
    {
      name: 'profile_screen_complexity',
      description: `[Vein-Powered AST] [Architect] Generate a screen complexity profile (Bill of Materials) for a .tsx/.jsx file: total components, unique custom components, max nesting depth, container/leaf ratio, slot components, list items, absolute positioned elements, onLayout handlers, health score, and complexity grade (SIMPLE/MODERATE/COMPLEX/OVERCOMPLICATED).`,
      inputSchema: TOOL_INPUT_SCHEMAS.profile_screen_complexity,
    },
    {
      name: 'trace_component_import',
      description: `[Vein-Powered AST] [Architect] Trace a component's import chain from usage to source definition. Follows imports through barrel files, re-export chains, and rename specifiers. Reports the full resolution path with file paths and line numbers. → Hand-off: call detect_render_traps after this to ensure its props are memo-stable.`,
      inputSchema: TOOL_INPUT_SCHEMAS.trace_component_import,
    },
    {
      name: 'audit_design_tokens',
      description: `[Vein-Powered AST] [Compliance Officer] Scan a .tsx/.jsx file for spacing values (margin, padding, gap) that are not in the design token whitelist. Reports each deviation with the offending value, property, and suggested token replacement. Weakness: May miss inline styles (inline styles are still "values"). If a value is 16px, this tool is happy even if that 16px causes a layout shift.`,
      inputSchema: TOOL_INPUT_SCHEMAS.audit_design_tokens,
    },
    {
      name: 'detect_nested_lists',
      description: `[Vein-Powered AST] [Performance Pillar] Scan a .tsx/.jsx file for nested .map() calls (a .map() inside another .map()). This is a known React Native performance anti-pattern that creates nested scroll contexts and causes jank. → Hand-off: call detect_boundary_gaps after this to check for layout pollution from nested scroll contexts.`,
      inputSchema: TOOL_INPUT_SCHEMAS.detect_nested_lists,
    },
    {
      name: 'detect_absolute_overlaps',
      description: `[Vein-Powered AST] [Layout Auditor] Scan a .tsx/.jsx file for absolutely-positioned elements. Reports each element's position (top/left/right/bottom), zIndex, dimensions, and flags potential issues like missing zIndex or missing width/height.`,
      inputSchema: TOOL_INPUT_SCHEMAS.detect_absolute_overlaps,
    },

    // ─── v2.0.0: Visual Semantic Orchestration Tools ───────────

    {
      name: 'audit_spacing_rhythm',
      description: `[Rhythm Hierarch v2.0] Dynamic Rhythm Hierarch — validates gaps using the Proximity Score between siblings. Intra-Section (Score > 6): target 8px, flags if > 8px ("Loose Rhythm"). Inter-Section (Score < 4): target 16px, flags if < 16px ("Section Collision"). Also checks Boundary Rule: last child must have zero marginBottom. → Foundation Check: If children use hardcoded margins instead of parent gap, analysis is blocked with a HIGH severity message directing you to run detect_boundary_gaps first. → Hand-off: call audit_design_tokens after this to verify spacing uses valid tokens.`,
      inputSchema: TOOL_INPUT_SCHEMAS.audit_spacing_rhythm,
    },
    {
      name: 'audit_semantic_proximity',
      description: `[Semantic Proximity Auditor v2.0] 3-variable Semantic Scoring Engine (Lexical 40% + Prop DNA 30% + Visual 30%) assigns a Proximity Score (0-10) to every sibling pair. Includes Rule of Three grouping suggestions when 3+ consecutive siblings have high scores but no shared parent. Shows per-pair scoring breakdown. → Foundation Check: If the container's children use hardcoded margins instead of parent gap, analysis is blocked with a HIGH severity message directing you to run detect_boundary_gaps first. → Hand-off: call audit_spacing_rhythm after this to ensure the grouped section has proper inner/outer gap hierarchy.`,
      inputSchema: TOOL_INPUT_SCHEMAS.audit_semantic_proximity,
    },

];

// ─── Handler Registration ────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOL_DEFINITIONS,
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'render_structural_diagram':
        return handleRenderStructuralDiagram(args as { filePath: string });
      case 'detect_boundary_gaps':
        return handleDetectBoundaryGaps(args as { filePath: string; mode?: 'all' | 'vein-propagation'; stylesPath?: string; designTokens?: number[]; recursive?: boolean });
      case 'detect_bridge_crossings':
        return handleDetectBridgeCrossings(args as { filePath: string });
      case 'detect_render_traps':
        return handleDetectRenderTraps(args as { filePath: string });
      case 'trace_shared_value_lineage':
        return handleTraceSharedValueLineage(args as { filePath: string });

      // New Vein-powered tools
      case 'analyze_component_tree':
        return handleAnalyzeComponentTree(args as { filePath: string });
      case 'profile_screen_complexity':
        return handleProfileScreenComplexity(args as { filePath: string });
      case 'trace_component_import':
        return handleTraceComponentImport(args as { filePath: string; componentName?: string });
      case 'audit_design_tokens':
        return handleAuditDesignTokens(args as { filePath: string; designTokens?: number[] });
      case 'detect_nested_lists':
        return handleDetectNestedLists(args as { filePath: string });
      case 'detect_absolute_overlaps':
        return handleDetectAbsoluteOverlaps(args as { filePath: string });

      // v1.1.0: Visual Semantic Orchestration Tools
      case 'audit_spacing_rhythm':
        return handleAuditSpacingRhythm(args as { filePath: string });
      case 'audit_semantic_proximity':
        return handleAuditSemanticProximity(args as { filePath: string });

      default:
        return {
          content: [
            {
              type: 'text',
              text: `Unknown tool: ${name}. Available tools: ${TOOL_DEFINITIONS.map((t) => t.name).join(', ')}`,
            },
          ],
          isError: true,
        };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Error executing ${name}: ${message}`,
        },
      ],
      isError: true,
    };
  }
});

// ─── Startup ─────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('rhizophora MCP server v0.1.0 running on stdio');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
