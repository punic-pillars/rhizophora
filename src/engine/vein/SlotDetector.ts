// ============================================================
// SlotDetector.ts — Detects components that render {props.children}
// (a.k.a. "slot" or transparent containers in the layout graph).
//
// v1.0.0 "Refactored Vein" — Extracted from VenousPropagator.ts
// v1.1.0 — Enhanced to detect children references inside helper
//   functions (e.g., renderContent) called from the return JSX.
// ============================================================

import type { TSESTree } from '@typescript-eslint/typescript-estree';
import { getJSXChildren } from './JSXHelpers.js';
import type { ResolvedComponent } from './types.js';

type JSXElement = TSESTree.JSXElement;
type JSXFragment = TSESTree.JSXFragment;
type JSXExpressionContainer = TSESTree.JSXExpressionContainer;
type MemberExpression = TSESTree.MemberExpression;
type Identifier = TSESTree.Identifier;
type BlockStatement = TSESTree.BlockStatement;
type FunctionDeclaration = TSESTree.FunctionDeclaration;
type ArrowFunctionExpression = TSESTree.ArrowFunctionExpression;
type FunctionExpression = TSESTree.FunctionExpression;
type ReturnStatement = TSESTree.ReturnStatement;

/**
 * Detect if a component renders {props.children} — making it a "slot"
 * or transparent container in the layout graph.
 *
 * Checks both direct JSX children references AND references inside
 * helper functions (e.g., renderContent()) called from the return JSX.
 */
export function detectSlot(component: ResolvedComponent): boolean {
  if (!component.returnJSX) return false;

  // Check direct JSX children references
  if (findChildrenReference(component.returnJSX)) return true;

  // Check for children references inside helper functions defined
  // in the component body (e.g., renderContent() that returns {children})
  const componentNode = component.node;
  if (componentNode) {
    const body = componentNode.body;
    if (body && body.type === 'BlockStatement') {
      if (findChildrenInBlock(body as BlockStatement)) return true;
    }
  }

  return false;
}

/**
 * Search a block statement for helper functions that reference children.
 */
function findChildrenInBlock(block: BlockStatement): boolean {
  for (const stmt of block.body) {
    // function renderContent() { return children; }
    if (stmt.type === 'FunctionDeclaration') {
      const fn = stmt as FunctionDeclaration;
      if (functionReturnsChildren(fn.body)) return true;
    }
    // const renderContent = () => { ... }
    if (stmt.type === 'VariableDeclaration') {
      for (const decl of stmt.declarations) {
        const init = decl.init;
        if (init && (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression')) {
          const fn = init as ArrowFunctionExpression | FunctionExpression;
          if (functionReturnsChildren(fn.body)) return true;
        }
      }
    }
  }
  return false;
}

/**
 * Check if a function body returns {children} or children directly.
 */
function functionReturnsChildren(
  body: BlockStatement | TSESTree.Expression
): boolean {
  if (body.type === 'JSXElement') {
    return findChildrenReference(body as JSXElement);
  }
  if (body.type === 'JSXFragment') {
    return findChildrenReference(body as JSXFragment);
  }

  if (body.type === 'BlockStatement') {
    const block = body as BlockStatement;
    for (const stmt of block.body) {
      if (stmt.type === 'ReturnStatement') {
        const ret = stmt as ReturnStatement;
        // return children;
        if (ret.argument && ret.argument.type === 'Identifier' && (ret.argument as Identifier).name === 'children') {
          return true;
        }
        // return <View>{children}</View>;
        if (ret.argument && (ret.argument.type === 'JSXElement' || ret.argument.type === 'JSXFragment')) {
          if (findChildrenReference(ret.argument as JSXElement | JSXFragment)) return true;
        }
      }
    }
  }

  return false;
}

function findChildrenReference(jsx: JSXElement | JSXFragment): boolean {
  if (jsx.type === 'JSXFragment') {
    for (const child of jsx.children) {
      if (child.type === 'JSXExpressionContainer') {
        const expr = (child as JSXExpressionContainer).expression;
        if (expr.type !== 'JSXEmptyExpression' && isChildrenReference(expr)) return true;
      }
    }
    return false;
  }

  for (const child of getJSXChildren(jsx)) {
    if (child.type === 'JSXExpressionContainer') {
      const expr = (child as JSXExpressionContainer).expression;
      if (expr.type !== 'JSXEmptyExpression' && isChildrenReference(expr)) return true;
    }
    if (child.type === 'JSXElement') {
      if (findChildrenReference(child as JSXElement)) return true;
    }
    if (child.type === 'JSXFragment') {
      if (findChildrenReference(child as JSXFragment)) return true;
    }
  }

  return false;
}

function isChildrenReference(expr: TSESTree.Expression): boolean {
  // {props.children}
  if (expr.type === 'MemberExpression') {
    const member = expr as MemberExpression;
    if (
      member.object.type === 'Identifier' &&
      (member.object as Identifier).name === 'props' &&
      member.property.type === 'Identifier' &&
      (member.property as Identifier).name === 'children'
    ) {
      return true;
    }
  }
  // {children} (destructured)
  if (expr.type === 'Identifier') {
    return (expr as Identifier).name === 'children';
  }
  return false;
}
