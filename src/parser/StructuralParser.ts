// ============================================================
// StructuralParser.ts — Parse JSX/TSX source code into ASCII
// structural diagrams showing nesting, StyleSheet, and animations
// ============================================================

import * as fs from 'node:fs';
import { StructuralDiagram } from '../domain/types/index.js';

// ─── Regex Patterns ──────────────────────────────────────────
const JSX_TAG = /<(\w[\w.]*)([^>]*)\/?>/gs;
const JSX_CLOSE_TAG = /<\/(\w[\w.]*)>/g;
const STYLE_CREATE = /StyleSheet\.create\s*\(\s*\{([^}]+)\}\s*\)/gs;
const ANIMATED_STYLE = /useAnimatedStyle\s*\(\s*\(\)\s*=>\s*\{([^}]+)\}\s*\)/gs;
const SHARED_VALUE = /useSharedValue\s*<[^>]+>\s*\(([^)]+)\)/g;
const STYLE_OBJECT = /(\w+)\s*:\s*\{([^}]+)\}/g;
const PROP_EXTRACT = /(\w+)\s*=\s*\{([^}]+)\}/g;
const IMPORT_EXTRACT = /import\s+(?:\{[^}]*\}|[^;]+)\s+from\s+['"][^'"]+['"]/g;
const HOOK_EXTRACT = /(use\w+)\s*\(/g;

// ─── Main Parse Function ─────────────────────────────────────

export function parseFile(filePath: string): StructuralDiagram {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileName = filePath.split(/[/\\]/).pop() ?? filePath;

  // Extract imports
  const imports: string[] = [];
  let match: RegExpExecArray | null;
  const importRe = new RegExp(IMPORT_EXTRACT.source, 'g');
  while ((match = importRe.exec(content)) !== null) {
    imports.push(match[0].trim());
  }

  // Extract StyleSheet
  const styleSheet: Record<string, Record<string, string>> = {};
  const styleRe = new RegExp(STYLE_CREATE.source, 'gs');
  while ((match = styleRe.exec(content)) !== null) {
    const styleBlock = match[1];
    const styleObjRe = new RegExp(STYLE_OBJECT.source, 'g');
    let styleMatch: RegExpExecArray | null;
    while ((styleMatch = styleObjRe.exec(styleBlock)) !== null) {
      const className = styleMatch[1].trim();
      const props = styleMatch[2].trim();
      const propMap: Record<string, string> = {};
      for (const line of props.split(',')) {
        const [key, ...valParts] = line.split(':');
        if (key && valParts.length > 0) {
          propMap[key.trim()] = valParts.join(':').trim().replace(/,$/, '');
        }
      }
      styleSheet[className] = propMap;
    }
  }

  // Extract animated values
  const animatedValues: StructuralDiagram['animatedValues'] = [];
  const svRe = new RegExp(SHARED_VALUE.source, 'g');
  while ((match = svRe.exec(content)) !== null) {
    animatedValues.push({
      name: `useSharedValue(${match[1].trim()})`,
      type: 'SharedValue',
      description: `Initialized with ${match[1].trim()}`,
    });
  }

  // Extract useAnimatedStyle
  const animStyleRe = new RegExp(ANIMATED_STYLE.source, 'gs');
  while ((match = animStyleRe.exec(content)) !== null) {
    const body = match[1].trim();
    const propRefs = body.match(/(\w+)\.value/g) ?? [];
    animatedValues.push({
      name: `useAnimatedStyle → ${propRefs.join(', ')}`,
      type: 'AnimatedStyle',
      description: `Reads: ${propRefs.map((r) => r.replace('.value', '')).join(', ')}`,
    });
  }

  // Extract hooks
  const hooks: string[] = [];
  const hookRe = new RegExp(HOOK_EXTRACT.source, 'g');
  while ((match = hookRe.exec(content)) !== null) {
    if (!hooks.includes(match[1])) hooks.push(match[1]);
  }

  // Build JSX tree
  const jsxTree = buildJsxTree(content);

  // Render ASCII diagram
  const diagram = renderDiagram(fileName, jsxTree, styleSheet, hooks, imports);

  // Summary
  const summary: string[] = [];
  summary.push(`File: ${fileName}`);
  summary.push(`Components: ${jsxTree.length} top-level elements`);
  summary.push(`StyleSheet rules: ${Object.keys(styleSheet).length}`);
  summary.push(`SharedValues: ${animatedValues.filter((a) => a.type === 'SharedValue').length}`);
  summary.push(`AnimatedStyles: ${animatedValues.filter((a) => a.type === 'AnimatedStyle').length}`);
  summary.push(`Hooks: ${hooks.join(', ')}`);

  return { filePath, diagram, styleSheet, animatedValues, summary };
}

// ─── JSX Tree Building ───────────────────────────────────────

interface JsxNode {
  tag: string;
  props: Record<string, string>;
  children: JsxNode[];
  depth: number;
  selfClosing: boolean;
}

function buildJsxTree(content: string): JsxNode[] {
  const roots: JsxNode[] = [];
  const stack: JsxNode[] = [];
  const tagRe = /<(\/?)(\w[\w.]*)((?:[^>'"\n]|'[^']*'|"[^"]*")*)\/?>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRe.exec(content)) !== null) {
    const isClosing = match[1] === '/';
    const tagName = match[2];
    const propsStr = match[3].trim();
    const isSelfClosing = match[0].endsWith('/>');

    // Skip non-component tags
    if (tagName.toLowerCase() === tagName && !['view', 'text', 'animated', 'scrollview'].includes(tagName.toLowerCase())) {
      continue;
    }

    if (isClosing) {
      if (stack.length > 0 && stack[stack.length - 1].tag === tagName) {
        stack.pop();
      }
      continue;
    }

    // Extract props
    const props: Record<string, string> = {};
    const propRe = new RegExp(PROP_EXTRACT.source, 'g');
    let propMatch: RegExpExecArray | null;
    while ((propMatch = propRe.exec(propsStr)) !== null) {
      props[propMatch[1]] = propMatch[2].substring(0, 60);
    }
    // Also extract simple string props
    const simplePropRe = /(\w+)\s*=\s*"([^"]*)"/g;
    while ((propMatch = simplePropRe.exec(propsStr)) !== null) {
      props[propMatch[1]] = `"${propMatch[2]}"`;
    }

    const node: JsxNode = {
      tag: tagName,
      props,
      children: [],
      depth: stack.length,
      selfClosing: isSelfClosing,
    };

    if (stack.length > 0) {
      stack[stack.length - 1].children.push(node);
    } else {
      roots.push(node);
    }

    if (!isSelfClosing) {
      stack.push(node);
    }
  }

  return roots;
}

// ─── ASCII Rendering ─────────────────────────────────────────

function renderDiagram(
  fileName: string,
  roots: JsxNode[],
  styleSheet: Record<string, Record<string, string>>,
  hooks: string[],
  imports: string[]
): string {
  const lines: string[] = [];

  lines.push(`📐 ${fileName} — Structural Blueprint`);
  lines.push('━'.repeat(60));
  lines.push('');

  for (const root of roots) {
    renderNode(root, lines, styleSheet, 0, new Set());
  }

  if (Object.keys(styleSheet).length > 0) {
    lines.push('');
    lines.push('═══ StyleSheet ═══');
    for (const [className, props] of Object.entries(styleSheet)) {
      const propStr = Object.entries(props)
        .map(([k, v]) => `${k}:${v}`)
        .join(', ');
      lines.push(`.${className}:  ${propStr}`);
    }
  }

  return lines.join('\n');
}

function renderNode(
  node: JsxNode,
  lines: string[],
  styleSheet: Record<string, Record<string, string>>,
  depth: number,
  visited: Set<string>
): void {
  const indent = '│  '.repeat(depth);
  const isAnimated = node.tag.startsWith('Animated.');
  const displayTag = isAnimated ? node.tag : node.tag;

  // Build prop summary
  const propSummary = Object.entries(node.props)
    .filter(([k]) => !['style', 'children'].includes(k))
    .map(([k, v]) => {
      if (k === 'style') return `style={[${v.substring(0, 40)}]}`;
      return `${k}={${v.substring(0, 30)}}`;
    })
    .join(' ');

  // Check if this tag has a StyleSheet entry
  const styleKey = Object.keys(styleSheet).find(
    (k) => node.props.style?.includes(k) || node.props.style?.includes(`styles.${k}`)
  );

  const tagLine = propSummary
    ? `<${displayTag} ${propSummary}>`
    : `<${displayTag}>`;

  lines.push(`${indent}├── ${tagLine}`);

  // Show style properties if found
  if (styleKey && styleSheet[styleKey]) {
    const props = styleSheet[styleKey];
    const relevantProps = ['position', 'top', 'left', 'right', 'bottom', 'zIndex', 'height', 'width', 'flex', 'paddingTop', 'paddingBottom', 'paddingHorizontal', 'paddingVertical', 'borderRadius', 'elevation', 'shadowColor', 'opacity', 'flexDirection', 'justifyContent', 'alignItems'];
    for (const [k, v] of Object.entries(props)) {
      if (relevantProps.includes(k)) {
        lines.push(`${indent}│  │ ${k}: ${v}`);
      }
    }
  }

  // Render children
  for (const child of node.children) {
    renderNode(child, lines, styleSheet, depth + 1, visited);
  }
}

// ─── (Interaction Scanner removed — deprecated in v0.8.3) ─────

