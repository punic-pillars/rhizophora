// ============================================================
// tool-schemas.ts — Tool input JSON schemas for MCP validation
// Extracted from schemas.ts during Phase A refactoring
// v1.0.0 — Added 6 new Vein-powered tool schemas
// ============================================================

export const TOOL_INPUT_SCHEMAS = {
  render_structural_diagram: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: '[Standalone Regex] Absolute path to the .tsx/.jsx file to analyze',
      },
    },
    required: ['filePath'],
  },

  detect_boundary_gaps: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: '[Vein-Powered AST] Absolute path to the .tsx/.jsx file or directory to scan',
      },
      mode: {
        type: 'string',
        enum: ['all', 'vein-propagation'],
        description: "[Vein-Powered AST] 'all' and 'vein-propagation' are equivalent — both run the full AST-driven Vein Propagation Engine for 100% accurate component tree analysis.",
        default: 'vein-propagation',
      },
      stylesPath: {
        type: 'string',
        description: 'Explicit path to the styles file (for cross-file style resolution). If not provided, auto-resolves from import statements.',
      },
      designTokens: {
        type: 'array',
        items: { type: 'number' },
        description: 'Array of valid design token values (e.g., [4, 8, 12, 16, 24, 32]). When provided, spacing values not in this list are flagged as deviations.',
      },
      recursive: {
        type: 'boolean',
        description: 'If true and filePath is a directory, recursively scan all .tsx/.ts files in the directory (Batch Audit mode).',
        default: false,
      },
    },
    required: ['filePath'],
  },

  detect_bridge_crossings: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: '[Standalone Regex] Absolute path to the .tsx/.jsx file to scan for bridge crossings',
      },
    },
    required: ['filePath'],
  },

  detect_render_traps: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: '[Standalone Regex] Absolute path to the .tsx/.jsx file to scan for render traps',
      },
    },
    required: ['filePath'],
  },

  trace_shared_value_lineage: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: '[Standalone Regex] Absolute path to the .tsx/.jsx file to trace SharedValue lineage',
      },
    },
    required: ['filePath'],
  },

  // ─── New Vein-Powered Tools ────────────────────────────────

  analyze_component_tree: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: '[Vein-Powered AST] Absolute path to the .tsx/.jsx file to analyze',
      },
    },
    required: ['filePath'],
  },

  profile_screen_complexity: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: '[Vein-Powered AST] Absolute path to the .tsx/.jsx file to profile',
      },
    },
    required: ['filePath'],
  },

  trace_component_import: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: '[Vein-Powered AST] Absolute path to the .tsx/.jsx file containing the component usage',
      },
      componentName: {
        type: 'string',
        description: 'Optional component name to trace. If omitted, traces the first exported component.',
      },
    },
    required: ['filePath'],
  },

  audit_design_tokens: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: '[Vein-Powered AST] Absolute path to the .tsx/.jsx file to scan',
      },
      designTokens: {
        type: 'array',
        items: { type: 'number' },
        description: 'Array of valid design token values (e.g., [4, 8, 12, 16, 24, 32]). Defaults to [4, 8, 12, 16, 24, 32] if not provided.',
      },
    },
    required: ['filePath'],
  },

  detect_nested_lists: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: '[Vein-Powered AST] Absolute path to the .tsx/.jsx file to scan for nested lists',
      },
    },
    required: ['filePath'],
  },

  detect_absolute_overlaps: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: '[Vein-Powered AST] Absolute path to the .tsx/.jsx file to scan for absolute overlaps',
      },
    },
    required: ['filePath'],
  },

  // ─── v2.0.0: Visual Semantic Orchestration Tools ───────────

  audit_spacing_rhythm: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: '[Rhythm Hierarch v2.0] Absolute path to the .tsx/.jsx file to audit for contextual gap violations (Intra/Inter section rules) and boundary rule violations',
      },
    },
    required: ['filePath'],
  },

  audit_semantic_proximity: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: '[Semantic Proximity v2.0] Absolute path to the .tsx/.jsx file to audit for semantic scoring (Lexical 40% + Prop DNA 30% + Visual 30%) and Rule of Three grouping suggestions',
      },
    },
    required: ['filePath'],
  },

} as const;
