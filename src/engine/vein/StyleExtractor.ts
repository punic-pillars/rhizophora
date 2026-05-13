// ============================================================
// StyleExtractor.ts — Single-pass extraction of spacing and
// layout properties from JSX elements. Handles inline styles,
// StyleSheet references, and array-style combinations.
//
// v1.0.0 "Refactored Vein" — Extracted from VenousPropagator.ts.
//   Combines extractSpacing + extractLayout into a single pass
//   to avoid walking JSX attributes and StyleSheet blocks twice.
// v1.1.0 "Bipartite Layout Support" — Added contentContainerStyle
//   extraction for ScrollView, FlatList, and SectionList. These
//   components have a bipartite layout: the outer `style` controls
//   the frame (window), while `contentContainerStyle` controls the
//   inner scrollable canvas (gap, padding, alignItems, etc.).
//   Previously, contentContainerStyle was a blind spot causing
//   false-positive [Section Collision] and [style-pollution] warnings.
// ============================================================

import type { TSESTree } from '@typescript-eslint/typescript-estree';
import type { ParsedFile, SpacingTokens, LayoutProperties, ExtractedStyles } from './types.js';
import { getJSXTagName } from './JSXHelpers.js';

type JSXOpeningElement = TSESTree.JSXOpeningElement;
type ObjectExpression = TSESTree.ObjectExpression;
type Property = TSESTree.Property;
type Expression = TSESTree.Expression;
type Literal = TSESTree.Literal;
type Identifier = TSESTree.Identifier;
type MemberExpression = TSESTree.MemberExpression;

/**
 * Components that have a bipartite layout: the outer `style` prop
 * controls the frame (window), while `contentContainerStyle` controls
 * the inner scrollable canvas. For these components, internal layout
 * properties (gap, padding, alignItems, justifyContent) must be read
 * from contentContainerStyle, not style.
 */
const BIPARTITE_LAYOUT_COMPONENTS = new Set([
  'ScrollView',
  'FlatList',
  'SectionList',
]);

/**
 * Properties that govern internal child layout. These are the properties
 * that contentContainerStyle should override style for, since they affect
 * how children are positioned inside the scrollable canvas rather than
 * how the scroll view frame appears on screen.
 */
const INNER_LAYOUT_KEYS = new Set([
  'gap',
  'rowGap',
  'columnGap',
  'padding',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'paddingVertical',
  'paddingHorizontal',
  'alignItems',
  'justifyContent',
  'flexDirection',
]);

/**
 * Extract spacing and layout properties from a JSX opening element
 * in a single pass. Handles inline styles, StyleSheet references,
 * and array-style combinations.
 *
 * v1.1.0: Now handles bipartite layout components (ScrollView,
 * FlatList, SectionList). For these components, the outer `style`
 * prop controls the frame, while `contentContainerStyle` controls
 * the inner scrollable canvas. Internal layout properties (gap,
 * padding, alignItems, justifyContent) are extracted from
 * contentContainerStyle and merged into the result, overriding
 * any values from the outer `style` prop.
 */
export function extractStyle(opening: JSXOpeningElement, parsed: ParsedFile): ExtractedStyles {
  const spacing: SpacingTokens = {};
  const layout: LayoutProperties = {};

  // ── Step 1: Extract from the standard `style` prop ──────────
  // This captures the outer frame properties (position, zIndex,
  // width, height, flex, etc.) and any spacing on the frame itself.
  extractFromAttribute(opening, 'style', parsed, spacing, layout);

  // ── Step 2: For bipartite layout components, extract from
  // `contentContainerStyle` and merge inner-layout properties ──
  const componentName = getJSXTagName(opening);
  if (BIPARTITE_LAYOUT_COMPONENTS.has(componentName)) {
    const innerSpacing: SpacingTokens = {};
    const innerLayout: LayoutProperties = {};
    extractFromAttribute(opening, 'contentContainerStyle', parsed, innerSpacing, innerLayout);

    // Merge inner styles into the result. Inner-layout properties
    // (gap, padding, alignItems, justifyContent) from contentContainerStyle
    // override the outer style values. Other properties (position,
    // zIndex, width, height, flex) remain from the outer style.
    mergeInnerStyles(spacing, layout, innerSpacing, innerLayout);
  }

  return { spacing, layout };
}

/**
 * Extract spacing and layout from a named JSX attribute.
 * Supports inline objects, StyleSheet references, and array combinations.
 */
function extractFromAttribute(
  opening: JSXOpeningElement,
  attrName: string,
  parsed: ParsedFile,
  spacing: SpacingTokens,
  layout: LayoutProperties
): void {
  const attr = getJSXAttributeNode(opening, attrName);
  if (!attr || attr.value?.type !== 'JSXExpressionContainer') return;

  const expr = attr.value.expression;

  // Inline object: contentContainerStyle={{ gap: 16 }}
  if (expr.type === 'ObjectExpression') {
    extractFromObject(expr as ObjectExpression, spacing, layout);
  }

  // StyleSheet reference: contentContainerStyle={styles.container}
  if (expr.type === 'MemberExpression') {
    const styleRef = resolveMemberExpression(expr as MemberExpression);
    if (styleRef) {
      extractFromStyleSheet(styleRef, parsed, spacing, layout);
    }
  }

  // Array of styles: contentContainerStyle={[styles.container, { gap: 16 }]}
  if (expr.type === 'ArrayExpression') {
    for (const element of (expr as any).elements) {
      if (element?.type === 'ObjectExpression') {
        extractFromObject(element, spacing, layout);
      }
      if (element?.type === 'MemberExpression') {
        const ref = resolveMemberExpression(element);
        if (ref) extractFromStyleSheet(ref, parsed, spacing, layout);
      }
    }
  }
}

/**
 * Merge inner (contentContainerStyle) styles into the outer result.
 * Only inner-layout properties (gap, padding, alignItems, justifyContent)
 * are overridden. Other properties remain from the outer style.
 */
function mergeInnerStyles(
  outerSpacing: SpacingTokens,
  outerLayout: LayoutProperties,
  innerSpacing: SpacingTokens,
  innerLayout: LayoutProperties
): void {
  // Merge spacing properties that affect internal child layout
  for (const key of ['gap', 'rowGap', 'columnGap', 'padding', 'paddingTop',
    'paddingBottom', 'paddingLeft', 'paddingRight', 'paddingVertical',
    'paddingHorizontal'] as const) {
    if (innerSpacing[key] !== undefined) {
      (outerSpacing as any)[key] = innerSpacing[key];
    }
  }

  // Merge layout properties that affect internal child layout
  if (innerLayout.alignItems !== undefined) {
    outerLayout.alignItems = innerLayout.alignItems;
  }
  if (innerLayout.justifyContent !== undefined) {
    outerLayout.justifyContent = innerLayout.justifyContent;
  }
  if (innerLayout.flexDirection !== undefined) {
    outerLayout.flexDirection = innerLayout.flexDirection;
  }
}

// ─── Object Extraction ───────────────────────────────────────

function extractFromObject(
  obj: ObjectExpression,
  spacing: SpacingTokens,
  layout: LayoutProperties
): void {
  for (const prop of obj.properties) {
    if (prop.type !== 'Property') continue;
    const p = prop as Property;
    if (p.key.type !== 'Identifier') continue;
    const key = p.key.name;
    const numValue = getNumericValue(p.value as Expression);
    const strValue = getStringValue(p.value as Expression);

    switch (key) {
      // Spacing properties
      case 'margin': if (numValue !== null) spacing.margin = numValue; break;
      case 'marginTop': if (numValue !== null) spacing.marginTop = numValue; break;
      case 'marginBottom': if (numValue !== null) spacing.marginBottom = numValue; break;
      case 'marginLeft': if (numValue !== null) spacing.marginLeft = numValue; break;
      case 'marginRight': if (numValue !== null) spacing.marginRight = numValue; break;
      case 'marginVertical': if (numValue !== null) spacing.marginVertical = numValue; break;
      case 'marginHorizontal': if (numValue !== null) spacing.marginHorizontal = numValue; break;
      case 'padding': if (numValue !== null) spacing.padding = numValue; break;
      case 'paddingTop': if (numValue !== null) spacing.paddingTop = numValue; break;
      case 'paddingBottom': if (numValue !== null) spacing.paddingBottom = numValue; break;
      case 'paddingLeft': if (numValue !== null) spacing.paddingLeft = numValue; break;
      case 'paddingRight': if (numValue !== null) spacing.paddingRight = numValue; break;
      case 'paddingVertical': if (numValue !== null) spacing.paddingVertical = numValue; break;
      case 'paddingHorizontal': if (numValue !== null) spacing.paddingHorizontal = numValue; break;
      case 'gap': if (numValue !== null) spacing.gap = numValue; break;
      case 'rowGap': if (numValue !== null) spacing.rowGap = numValue; break;
      case 'columnGap': if (numValue !== null) spacing.columnGap = numValue; break;

      // Layout properties
      case 'flexDirection':
        if (strValue === 'row' || strValue === 'column') layout.flexDirection = strValue;
        break;
      case 'justifyContent':
        if (strValue) layout.justifyContent = strValue;
        break;
      case 'alignItems':
        if (strValue) layout.alignItems = strValue;
        break;
      case 'position':
        if (strValue === 'relative' || strValue === 'absolute') layout.position = strValue;
        break;
      case 'top': if (numValue !== null) layout.top = numValue; break;
      case 'bottom': if (numValue !== null) layout.bottom = numValue; break;
      case 'left': if (numValue !== null) layout.left = numValue; break;
      case 'right': if (numValue !== null) layout.right = numValue; break;
      case 'width':
        if (numValue !== null) layout.width = numValue;
        else if (strValue) layout.width = strValue;
        break;
      case 'height':
        if (numValue !== null) layout.height = numValue;
        else if (strValue) layout.height = strValue;
        break;
      case 'flex': if (numValue !== null) layout.flex = numValue; break;
      case 'zIndex': if (numValue !== null) layout.zIndex = numValue; break;
    }
  }
}

// ─── StyleSheet Extraction ───────────────────────────────────

function extractFromStyleSheet(
  styleKey: string,
  parsed: ParsedFile,
  spacing: SpacingTokens,
  layout: LayoutProperties
): void {
  const styleBlock = findStyleSheetBlock(parsed, styleKey);
  if (!styleBlock) return;
  extractFromObject(styleBlock, spacing, layout);
}

function findStyleSheetBlock(parsed: ParsedFile, styleKey: string): ObjectExpression | null {
  for (const node of parsed.ast.body) {
    const extractFromCall = (callExpr: any): ObjectExpression | null => {
      if (
        callExpr?.type === 'CallExpression' &&
        callExpr.callee?.type === 'MemberExpression' &&
        callExpr.callee?.object?.type === 'Identifier' &&
        callExpr.callee?.object?.name === 'StyleSheet' &&
        callExpr.callee?.property?.type === 'Identifier' &&
        callExpr.callee?.property?.name === 'create'
      ) {
        const arg = callExpr.arguments[0];
        if (arg?.type === 'ObjectExpression') {
          for (const prop of arg.properties) {
            if (
              prop.type === 'Property' &&
              prop.key.type === 'Identifier' &&
              prop.key.name === styleKey &&
              prop.value.type === 'ObjectExpression'
            ) {
              return prop.value as ObjectExpression;
            }
          }
        }
      }
      return null;
    };

    if (node.type === 'ExpressionStatement') {
      const result = extractFromCall((node as any).expression);
      if (result) return result;
    }

    if (node.type === 'VariableDeclaration') {
      for (const decl of (node as any).declarations) {
        if (decl?.init) {
          const result = extractFromCall(decl.init);
          if (result) return result;
        }
      }
    }

    if (node.type === 'ExportNamedDeclaration') {
      const decl = (node as any).declaration;
      if (decl?.type === 'VariableDeclaration') {
        for (const vDecl of decl.declarations) {
          if (vDecl?.init) {
            const result = extractFromCall(vDecl.init);
            if (result) return result;
          }
        }
      }
    }
  }
  return null;
}

// ─── Helpers ─────────────────────────────────────────────────

function getJSXAttributeNode(
  opening: JSXOpeningElement,
  name: string
): TSESTree.JSXAttribute | undefined {
  return opening.attributes.find(
    (attr) => attr.type === 'JSXAttribute' && attr.name.name === name
  ) as TSESTree.JSXAttribute | undefined;
}

function resolveMemberExpression(expr: MemberExpression): string | null {
  if (expr.property.type !== 'Identifier') return null;
  const propName = expr.property.name;
  if (expr.object.type === 'Identifier') {
    return propName;
  }
  if (expr.object.type === 'MemberExpression') {
    const parent = resolveMemberExpression(expr.object);
    return parent ? `${parent}.${propName}` : null;
  }
  return null;
}

function getNumericValue(value: Expression): number | null {
  if (value.type === 'Literal') {
    const lit = value as Literal;
    if (typeof lit.value === 'number') return lit.value;
  }
  if (value.type === 'UnaryExpression' && value.operator === '-') {
    const arg = value.argument;
    if (arg?.type === 'Literal' && typeof (arg as Literal).value === 'number') {
      return -((arg as Literal).value as number);
    }
  }
  return null;
}

function getStringValue(value: Expression): string | null {
  if (value.type === 'Literal') {
    const lit = value as Literal;
    if (typeof lit.value === 'string') return lit.value;
  }
  return null;
}
