// ============================================================
// JSXHelpers.ts — Pure utility functions for JSX AST traversal.
// Extracted from ASTParser.ts to keep parsing separate from
// JSX navigation logic.
//
// v1.0.0 "Refactored Vein" — Extracted from ASTParser.ts
// ============================================================

import type { TSESTree } from '@typescript-eslint/typescript-estree';

type JSXElement = TSESTree.JSXElement;
type JSXFragment = TSESTree.JSXFragment;
type JSXOpeningElement = TSESTree.JSXOpeningElement;
type JSXAttribute = TSESTree.JSXAttribute;
type JSXChild = TSESTree.JSXChild;
type Literal = TSESTree.Literal;
type Identifier = TSESTree.Identifier;

/**
 * Get the tag name from a JSX opening element.
 * Handles: <View>, <MyComponent>, <Text>, <Header.Title>, etc.
 */
export function getJSXTagName(element: JSXOpeningElement): string {
  const name = element.name;
  if (name.type === 'JSXIdentifier') return name.name;
  if (name.type === 'JSXMemberExpression') {
    return `${(name.object as any).name}.${(name.property as any).name}`;
  }
  return 'Unknown';
}

/**
 * Get the value of a JSX attribute by name.
 */
export function getJSXAttributeValue(
  element: JSXOpeningElement,
  attrName: string
): string | null {
  for (const attr of element.attributes) {
    if (attr.type !== 'JSXAttribute') continue;
    const jsxAttr = attr as JSXAttribute;
    if (jsxAttr.name.name !== attrName) continue;
    if (!jsxAttr.value) return 'true';
    if (jsxAttr.value.type === 'Literal') return String((jsxAttr.value as Literal).value);
    if (jsxAttr.value.type === 'JSXExpressionContainer') {
      const expr = jsxAttr.value.expression;
      if (expr.type === 'Literal') return String((expr as Literal).value);
      if (expr.type === 'ObjectExpression') return '[object]';
      if (expr.type === 'Identifier') return (expr as Identifier).name;
      return '[expression]';
    }
  }
  return null;
}

/**
 * Check if a JSX element has a specific attribute.
 */
export function hasJSXAttribute(element: JSXOpeningElement, attrName: string): boolean {
  return element.attributes.some(
    (attr) => attr.type === 'JSXAttribute' && attr.name.name === attrName
  );
}

/**
 * Get all children of a JSX element (direct children only).
 */
export function getJSXChildren(element: JSXElement): TSESTree.JSXChild[] {
  return element.children.filter(
    (child) =>
      child.type === 'JSXElement' ||
      child.type === 'JSXFragment' ||
      child.type === 'JSXText' ||
      child.type === 'JSXExpressionContainer'
  );
}

/**
 * Get the opening element from a JSX element.
 */
export function getOpeningElement(element: JSXElement): JSXOpeningElement {
  return element.openingElement;
}

/**
 * Check if a JSX element is self-closing.
 */
export function isSelfClosing(element: JSXElement): boolean {
  return !element.closingElement;
}
