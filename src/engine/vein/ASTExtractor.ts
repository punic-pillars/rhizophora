// ============================================================
// ASTExtractor.ts — Extracts imports, re-exports, and component
// definitions from a parsed TypeScript AST.
// Extracted from ASTParser.ts to separate parsing from extraction.
//
// v1.0.0 "Refactored Vein" — Extracted from ASTParser.ts
// ============================================================

import type { TSESTree } from '@typescript-eslint/typescript-estree';
import { resolveImportPath } from './ImportResolver.js';
import type {
  ParsedFile,
  ImportInfo,
  ComponentDef,
  ReExportInfo,
  ReExportSpecifier,
} from './types.js';

type ImportDeclaration = TSESTree.ImportDeclaration;
type ExportNamedDeclaration = TSESTree.ExportNamedDeclaration;
type ExportAllDeclaration = TSESTree.ExportAllDeclaration;
type ExportDefaultDeclaration = TSESTree.ExportDefaultDeclaration;
type FunctionDeclaration = TSESTree.FunctionDeclaration;
type VariableDeclarator = TSESTree.VariableDeclarator;
type ArrowFunctionExpression = TSESTree.ArrowFunctionExpression;
type FunctionExpression = TSESTree.FunctionExpression;
type BlockStatement = TSESTree.BlockStatement;
type ReturnStatement = TSESTree.ReturnStatement;
type JSXElement = TSESTree.JSXElement;
type JSXFragment = TSESTree.JSXFragment;

// ─── Import Extraction ───────────────────────────────────────

export function extractImports(ast: TSESTree.Program, filePath: string): Map<string, ImportInfo> {
  const imports = new Map<string, ImportInfo>();

  for (const node of ast.body) {
    if (node.type === 'ImportDeclaration') {
      const decl = node as ImportDeclaration;
      const sourcePath = decl.source.value as string;

      const namedImports: string[] = [];
      let defaultImport: string | null = null;

      for (const spec of decl.specifiers) {
        if (spec.type === 'ImportDefaultSpecifier') {
          defaultImport = spec.local.name;
        } else if (spec.type === 'ImportSpecifier') {
          namedImports.push(spec.local.name);
        }
      }

      const resolvedPath = resolveImportPath(filePath, sourcePath);
      imports.set(sourcePath, { sourcePath, resolvedPath, namedImports, defaultImport });
    }

    // Re-export declarations: export { X } from './Y' or export * from './Y'
    if (node.type === 'ExportNamedDeclaration' || node.type === 'ExportAllDeclaration') {
      const exportDecl = node as any;
      if (!exportDecl.source) continue;
      const sourcePath = exportDecl.source.value as string;

      if (node.type === 'ExportNamedDeclaration' && exportDecl.specifiers) {
        const namedImports: string[] = [];
        for (const spec of exportDecl.specifiers) {
          if (spec.type === 'ExportSpecifier') {
            namedImports.push(spec.local.name);
          }
        }

        const resolvedPath = resolveImportPath(filePath, sourcePath);
        if (!imports.has(sourcePath)) {
          imports.set(sourcePath, { sourcePath, resolvedPath, namedImports, defaultImport: null });
        } else {
          const existing = imports.get(sourcePath)!;
          for (const name of namedImports) {
            if (!existing.namedImports.includes(name)) {
              existing.namedImports.push(name);
            }
          }
        }
      }

      if (node.type === 'ExportAllDeclaration') {
        const resolvedPath = resolveImportPath(filePath, sourcePath);
        if (!imports.has(sourcePath)) {
          imports.set(sourcePath, { sourcePath, resolvedPath, namedImports: ['*'], defaultImport: null });
        } else {
          const existing = imports.get(sourcePath)!;
          if (!existing.namedImports.includes('*')) {
            existing.namedImports.push('*');
          }
        }
      }
    }
  }

  return imports;
}

// ─── Re-Export Extraction ────────────────────────────────────

export function extractReExports(ast: TSESTree.Program, filePath: string): Map<string, ReExportInfo> {
  const reExports = new Map<string, ReExportInfo>();

  for (const node of ast.body) {
    if (node.type === 'ExportNamedDeclaration') {
      const exportDecl = node as ExportNamedDeclaration;
      if (!exportDecl.source) continue;

      const sourcePath = exportDecl.source.value as string;
      const resolvedPath = resolveImportPath(filePath, sourcePath);
      const specifiers: ReExportSpecifier[] = [];

      if (exportDecl.specifiers) {
        for (const spec of exportDecl.specifiers) {
          if (spec.type === 'ExportSpecifier') {
            const exportedName = spec.exported.type === 'Identifier'
              ? spec.exported.name
              : spec.exported.value;
            const localName = spec.local.type === 'Identifier'
              ? spec.local.name
              : spec.local.value;
            specifiers.push({ exportedName, localName });
          }
        }
      }

      reExports.set(sourcePath, {
        sourcePath,
        resolvedPath,
        specifiers,
        isWildcard: false,
      });
    }

    if (node.type === 'ExportAllDeclaration') {
      const exportDecl = node as ExportAllDeclaration;
      const sourcePath = exportDecl.source.value as string;
      const resolvedPath = resolveImportPath(filePath, sourcePath);

      reExports.set(sourcePath, {
        sourcePath,
        resolvedPath,
        specifiers: [],
        isWildcard: true,
      });
    }
  }

  return reExports;
}

// ─── Component Extraction ────────────────────────────────────

export function extractExportedComponents(
  ast: TSESTree.Program,
  filePath: string
): Map<string, ComponentDef> {
  const components = new Map<string, ComponentDef>();

  for (const node of ast.body) {
    // export function MyComponent() { return <JSX> }
    if (node.type === 'ExportNamedDeclaration') {
      const exportDecl = node as ExportNamedDeclaration;
      if (exportDecl.declaration) {
        const decl = exportDecl.declaration;
        if (decl.type === 'FunctionDeclaration') {
          const fn = decl as FunctionDeclaration;
          if (fn.id?.name) {
            const jsx = extractReturnJSX(fn.body);
            if (jsx && fn.id) {
              components.set(fn.id.name, { name: fn.id.name, node: fn, returnJSX: jsx, filePath });
            }
          }
        }
        if (decl.type === 'VariableDeclaration') {
          for (const vDecl of decl.declarations) {
            const component = extractComponentFromVariable(vDecl, filePath);
            if (component) components.set(component.name, component);
          }
        }
      }
    }

    // export default function MyComponent() { return <JSX> }
    if (node.type === 'ExportDefaultDeclaration') {
      const exportDecl = node as ExportDefaultDeclaration;
      const decl = exportDecl.declaration;
      if (decl?.type === 'FunctionDeclaration' && decl.id?.name) {
        const fn = decl as FunctionDeclaration;
        const jsx = extractReturnJSX(fn.body);
        if (jsx && fn.id) {
          components.set(fn.id.name, { name: fn.id.name, node: fn, returnJSX: jsx, filePath });
          components.set('default', { name: fn.id.name, node: fn, returnJSX: jsx, filePath });
        }
      }
      if (decl?.type === 'VariableDeclaration') {
        for (const vDecl of decl.declarations) {
          const component = extractComponentFromVariable(vDecl, filePath);
          if (component) {
            components.set(component.name, component);
            components.set('default', component);
          }
        }
      }
      if (decl?.type === 'FunctionDeclaration' && !decl.id?.name) {
        const fn = decl as FunctionDeclaration;
        const jsx = extractReturnJSX(fn.body);
        if (jsx) {
          components.set('default', { name: 'default', node: fn, returnJSX: jsx, filePath });
        }
      }
      if (decl?.type === 'ArrowFunctionExpression' || decl?.type === 'FunctionExpression') {
        const fn = decl as ArrowFunctionExpression | FunctionExpression;
        const jsx = extractReturnJSX(fn.body);
        if (jsx) {
          components.set('default', { name: 'default', node: fn, returnJSX: jsx, filePath });
        }
      }
    }

    // Non-exported function declarations
    if (node.type === 'FunctionDeclaration') {
      const fn = node as FunctionDeclaration;
      if (fn.id?.name) {
        const jsx = extractReturnJSX(fn.body);
        if (jsx) {
          components.set(fn.id.name, { name: fn.id.name, node: fn, returnJSX: jsx, filePath });
        }
      }
    }

    // Non-exported variable declarations (const MyComponent = () => <JSX>)
    if (node.type === 'VariableDeclaration') {
      for (const vDecl of node.declarations) {
        const component = extractComponentFromVariable(vDecl, filePath);
        if (component) components.set(component.name, component);
      }
    }
  }

  return components;
}

function extractComponentFromVariable(
  vDecl: VariableDeclarator,
  filePath: string
): ComponentDef | null {
  if (vDecl.id.type !== 'Identifier') return null;
  const name = vDecl.id.name;
  if (!/^[A-Z]/.test(name)) return null;

  const init = vDecl.init;
  if (!init) return null;

  if (init.type === 'ArrowFunctionExpression' || init.type === 'FunctionExpression') {
    const fn = init as ArrowFunctionExpression | FunctionExpression;
    const jsx = extractReturnJSX(fn.body);
    if (jsx) {
      return { name, node: fn, returnJSX: jsx, filePath };
    }
  }

  return null;
}

// ─── JSX Return Extraction ───────────────────────────────────

function extractReturnJSX(
  body: TSESTree.BlockStatement | TSESTree.Expression
): JSXElement | JSXFragment | null {
  if (body.type === 'JSXElement') return body as JSXElement;
  if (body.type === 'JSXFragment') return body as JSXFragment;

  if (body.type === 'BlockStatement') {
    const block = body as BlockStatement;
    for (const stmt of block.body) {
      if (stmt.type === 'ReturnStatement') {
        const ret = stmt as ReturnStatement;
        if (ret.argument?.type === 'JSXElement') return ret.argument as JSXElement;
        if (ret.argument?.type === 'JSXFragment') return ret.argument as JSXFragment;
      }
      if (stmt.type === 'VariableDeclaration') {
        for (const vDecl of stmt.declarations) {
          if (vDecl.init?.type === 'JSXElement') return vDecl.init as JSXElement;
          if (vDecl.init?.type === 'JSXFragment') return vDecl.init as JSXFragment;
        }
      }
    }
  }

  return null;
}
