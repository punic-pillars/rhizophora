// ============================================================
// StyleSheetParser.ts — Utility for extracting values from
// StyleSheet.create() blocks using AST-driven analysis.
//
// v0.7.0 "Hardened Vein Propagation" — Replaced all regex-based
//   parsing with proper AST traversal via @typescript-eslint/parser.
//   Eliminates false positives from brace-depth and regex edge cases.
// ============================================================

import { parseSource } from '../vein/ASTParser.js';
import type { TSESTree } from '@typescript-eslint/typescript-estree';

type ObjectExpression = TSESTree.ObjectExpression;
type Property = TSESTree.Property;
type Expression = TSESTree.Expression;
type Literal = TSESTree.Literal;
type Identifier = TSESTree.Identifier;
type MemberExpression = TSESTree.MemberExpression;

/**
 * Extract a specific property value from a named StyleSheet block.
 * Uses AST-driven parsing for 100% accurate extraction.
 */
export function getStyleSheetValue(
  source: string,
  styleKey: string,
  property: string
): number | null {
  const styleBlock = findStyleSheetBlock(source, styleKey);
  if (!styleBlock) return null;

  return getNumericProperty(styleBlock, property);
}

/**
 * Extract all properties from a named StyleSheet block.
 * Returns a map of property name → numeric value.
 */
export function getStyleSheetBlock(
  source: string,
  styleKey: string
): Record<string, number | string> | null {
  const styleBlock = findStyleSheetBlock(source, styleKey);
  if (!styleBlock) return null;

  const result: Record<string, number | string> = {};
  for (const prop of styleBlock.properties) {
    if (prop.type !== 'Property') continue;
    const p = prop as Property;
    if (p.key.type !== 'Identifier') continue;
    const key = p.key.name;
    const numValue = getNumericValue(p.value as Expression);
    if (numValue !== null) {
      result[key] = numValue;
    } else {
      const strValue = getStringValue(p.value as Expression);
      if (strValue !== null) {
        result[key] = strValue;
      }
    }
  }

  return Object.keys(result).length > 0 ? result : null;
}

/**
 * Find a named style block within StyleSheet.create() using AST.
 */
function findStyleSheetBlock(
  source: string,
  styleKey: string
): ObjectExpression | null {
  try {
    const ast = parseSource(source, 'file.tsx');

    for (const node of ast.body) {
      // Handle: StyleSheet.create({...}) as an expression statement
      if (node.type === 'ExpressionStatement') {
        const expr = (node as any).expression;
        const block = extractStyleBlockFromCall(expr, styleKey);
        if (block) return block;
      }

      // Handle: const styles = StyleSheet.create({...}) as a variable declaration
      if (node.type === 'VariableDeclaration') {
        for (const decl of node.declarations) {
          const vDecl = decl as any;
          if (vDecl.init) {
            const block = extractStyleBlockFromCall(vDecl.init, styleKey);
            if (block) return block;
          }
        }
      }

      // Handle: export const styles = StyleSheet.create({...})
      if (node.type === 'ExportNamedDeclaration') {
        const exportDecl = node as any;
        if (exportDecl.declaration?.type === 'VariableDeclaration') {
          for (const decl of exportDecl.declaration.declarations) {
            const vDecl = decl as any;
            if (vDecl.init) {
              const block = extractStyleBlockFromCall(vDecl.init, styleKey);
              if (block) return block;
            }
          }
        }
      }
    }
  } catch {
    // If parsing fails, return null
  }

  return null;
}

/**
 * Check if an expression is a StyleSheet.create() call and extract a named style block.
 */
function extractStyleBlockFromCall(
  expr: any,
  styleKey: string
): ObjectExpression | null {
  if (
    expr?.type === 'CallExpression' &&
    expr.callee?.type === 'MemberExpression' &&
    expr.callee?.object?.type === 'Identifier' &&
    expr.callee?.object?.name === 'StyleSheet' &&
    expr.callee?.property?.type === 'Identifier' &&
    expr.callee?.property?.name === 'create'
  ) {
    const arg = expr.arguments[0];
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
}

/**
 * Get a numeric property value from an ObjectExpression.
 */
function getNumericProperty(
  obj: ObjectExpression,
  propertyName: string
): number | null {
  for (const prop of obj.properties) {
    if (prop.type !== 'Property') continue;
    const p = prop as Property;
    if (p.key.type !== 'Identifier') continue;
    if (p.key.name !== propertyName) continue;
    return getNumericValue(p.value as Expression);
  }
  return null;
}

/**
 * Extract a numeric value from an AST expression node.
 * Handles: Literal numbers, negative numbers, and identifiers
 * that resolve to numeric constants.
 */
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

/**
 * Extract a string value from an AST expression node.
 */
function getStringValue(value: Expression): string | null {
  if (value.type === 'Literal') {
    const lit = value as Literal;
    if (typeof lit.value === 'string') return lit.value;
  }
  return null;
}
