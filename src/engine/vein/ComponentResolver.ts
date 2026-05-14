// ============================================================
// ComponentResolver.ts — Resolves component names to their
// source files by following imports and re-export chains.
// Handles barrel files, rename specifiers, wildcard re-exports,
// and constant resolution for design tokens.
//
// v1.0.0 "Refactored Vein" — Extracted from VenousPropagator.ts
// v1.1.0 "Performance Guards" — Skip files with zero exported
//   components to avoid parsing utility files unnecessarily.
// ============================================================

import * as fs from 'fs';
import * as path from 'path';
import { parseFile } from './ASTParser.js';
import type { TSESTree } from '@typescript-eslint/typescript-estree';
import type { ParsedFile, ResolvedComponent } from './types.js';

type ObjectExpression = TSESTree.ObjectExpression;
type Property = TSESTree.Property;
type Identifier = TSESTree.Identifier;
type MemberExpression = TSESTree.MemberExpression;
type Literal = TSESTree.Literal;
type VariableDeclarator = TSESTree.VariableDeclarator;

/**
 * Resolves component names to their source files.
 */
export class ComponentResolver {
  private fileCache: Map<string, ParsedFile>;

  constructor(fileCache: Map<string, ParsedFile>) {
    this.fileCache = fileCache;
  }

  /**
   * Resolve a component by name, following imports and re-export chains recursively.
   */
  resolveComponent(
    tagName: string,
    parsed: ParsedFile,
    visitedFiles: Set<string>,
    visitedReExports?: Set<string>
  ): ResolvedComponent | null {
    // Check if the component is defined in the same file
    const localComponent = parsed.exportedComponents.get(tagName);
    if (localComponent) return localComponent;

    if (!visitedReExports) visitedReExports = new Set<string>();

    const candidates: Array<{ name: string; filePath: string; source: string }> = [];

    // Check imports
    for (const [importPath, importInfo] of parsed.imports) {
      const isWildcard = importInfo.namedImports.includes('*');
      const isNamedMatch = importInfo.namedImports.includes(tagName);
      const isDefaultMatch = importInfo.defaultImport === tagName;

      if (isNamedMatch || isDefaultMatch || isWildcard) {
        if (!importInfo.resolvedPath) continue;
        if (!importInfo.sourcePath.startsWith('.')) continue;
        if (visitedFiles.has(importInfo.resolvedPath)) continue;
        visitedFiles.add(importInfo.resolvedPath);

        const resolvedParsed = this.parseFileWithCache(importInfo.resolvedPath);
        if (!resolvedParsed) continue;

        // v1.1.0: Skip files with zero exported components (utility files)
        if (resolvedParsed.exportedComponents.size === 0) continue;

        if (isNamedMatch || isDefaultMatch) {
          const resolvedComponent = resolvedParsed.exportedComponents.get(tagName);
          if (resolvedComponent) {
            candidates.push({
              name: resolvedComponent.name,
              filePath: resolvedComponent.filePath,
              source: `named import from ${importInfo.sourcePath}`,
            });
          }

          const reExportResult = this.resolveViaReExports(tagName, resolvedParsed, visitedFiles, visitedReExports);
          if (reExportResult) {
            candidates.push({
              name: reExportResult.name,
              filePath: reExportResult.filePath,
              source: `re-export chain from ${importInfo.sourcePath}`,
            });
          }
        }

        if (isWildcard) {
          const exactMatch = resolvedParsed.exportedComponents.get(tagName);
          if (exactMatch && exactMatch.name === tagName) {
            candidates.push({
              name: exactMatch.name,
              filePath: exactMatch.filePath,
              source: `wildcard from ${importInfo.sourcePath}`,
            });
          }

          const reExportResult = this.resolveViaReExports(tagName, resolvedParsed, visitedFiles, visitedReExports);
          if (reExportResult) {
            candidates.push({
              name: reExportResult.name,
              filePath: reExportResult.filePath,
              source: `wildcard re-export chain from ${importInfo.sourcePath}`,
            });
          }
        }
      }
    }

    // Check re-exports directly
    const reExportResult = this.resolveViaReExports(tagName, parsed, visitedFiles, visitedReExports);
    if (reExportResult) {
      candidates.push({
        name: reExportResult.name,
        filePath: reExportResult.filePath,
        source: 'direct re-export',
      });
    }

    // Ambiguous re-export detection
    if (candidates.length > 1) {
      const uniqueFiles = new Set(candidates.map((c) => c.filePath));
      if (uniqueFiles.size > 1) {
        console.warn(
          `[ComponentResolver] Ambiguous re-export for "${tagName}": ` +
          `resolved to ${candidates.length} different files ` +
          `(${[...uniqueFiles].join(', ')}). ` +
          `Using first candidate from "${candidates[0].source}".`
        );
      }
    }

    if (candidates.length > 0) {
      // Try to get the full component definition with returnJSX
      const resolved = this.resolveComponentDef(candidates[0].name, candidates[0].filePath);
      if (resolved) return resolved;
      // Fallback: return stub with file path but no returnJSX
      return {
        name: candidates[0].name,
        returnJSX: null,
        filePath: candidates[0].filePath,
      };
    }

    return null;
  }

  /**
   * Follow re-export chains recursively to resolve a component.
   */
  resolveViaReExports(
    tagName: string,
    parsed: ParsedFile,
    visitedFiles: Set<string>,
    visitedReExports: Set<string>
  ): ResolvedComponent | null {
    for (const [sourcePath, reExport] of parsed.reExports) {
      const reExportKey = `${parsed.filePath}::${sourcePath}`;
      if (visitedReExports.has(reExportKey)) continue;
      visitedReExports.add(reExportKey);

      if (!reExport.resolvedPath) continue;
      if (visitedFiles.has(reExport.resolvedPath)) continue;
      visitedFiles.add(reExport.resolvedPath);

      const resolvedParsed = this.parseFileWithCache(reExport.resolvedPath);
      if (!resolvedParsed) continue;

      // v1.1.0: Skip files with zero exported components (utility files)
      if (resolvedParsed.exportedComponents.size === 0) continue;

      if (reExport.isWildcard) {
        const exactMatch = resolvedParsed.exportedComponents.get(tagName);
        if (exactMatch && exactMatch.name === tagName) return exactMatch;

        const nestedResult = this.resolveViaReExports(tagName, resolvedParsed, visitedFiles, visitedReExports);
        if (nestedResult) return nestedResult;
      } else {
        const matchingSpec = reExport.specifiers.find((spec) => spec.exportedName === tagName);
        if (!matchingSpec) {
          const nestedResult = this.resolveViaReExports(tagName, resolvedParsed, visitedFiles, visitedReExports);
          if (nestedResult) return nestedResult;
          continue;
        }

        if (matchingSpec.localName === 'default') {
          const targetParsed = this.parseFileWithCache(reExport.resolvedPath);
          if (targetParsed) {
            const defaultExport = targetParsed.exportedComponents.get('default');
            if (defaultExport) {
              return { ...defaultExport, name: tagName };
            }
          }
        } else {
          const namedExport = resolvedParsed.exportedComponents.get(matchingSpec.localName);
          if (namedExport) return namedExport;
        }

        const nestedResult = this.resolveViaReExports(matchingSpec.localName, resolvedParsed, visitedFiles, visitedReExports);
        if (nestedResult) return nestedResult;
      }
    }

    return null;
  }

  /**
   * Given a resolved file path and tag name, parse the file and look up
   * the component definition to get returnJSX. Returns null if not found.
   */
  private resolveComponentDef(tagName: string, filePath: string): ResolvedComponent | null {
    const parsed = this.parseFileWithCache(filePath);
    if (!parsed) return null;

    // v1.1.0: Skip files with zero exported components
    if (parsed.exportedComponents.size === 0) return null;

    // Check exported components by tagName
    const def = parsed.exportedComponents.get(tagName);
    if (def) return def;

    // Check default export
    const defaultDef = parsed.exportedComponents.get('default');
    if (defaultDef) return { ...defaultDef, name: tagName };

    return null;
  }

  /**
   * Resolve a constant value from an expression.
   */
  resolveConstant(expression: TSESTree.Expression, parsed: ParsedFile): number | null {
    if (expression.type === 'Literal') {
      const lit = expression as Literal;
      if (typeof lit.value === 'number') return lit.value;
      return null;
    }

    if (expression.type === 'UnaryExpression' && expression.operator === '-') {
      const arg = expression.argument;
      if (arg?.type === 'Literal' && typeof (arg as Literal).value === 'number') {
        return -((arg as Literal).value as number);
      }
      return null;
    }

    if (expression.type === 'Identifier') {
      return this.findConstantInFile((expression as Identifier).name, parsed);
    }

    if (expression.type === 'MemberExpression') {
      return this.resolveMemberConstant(expression as MemberExpression, parsed);
    }

    return null;
  }

  private findConstantInFile(name: string, parsed: ParsedFile): number | null {
    for (const node of parsed.ast.body) {
      if (node.type === 'VariableDeclaration') {
        for (const decl of node.declarations) {
          const vDecl = decl as VariableDeclarator;
          if (vDecl.id.type === 'Identifier' && vDecl.id.name === name) {
            if (vDecl.init) return this.resolveConstant(vDecl.init, parsed);
          }
        }
      }
      if (node.type === 'ExportNamedDeclaration') {
        const exportDecl = node as any;
        if (exportDecl.declaration?.type === 'VariableDeclaration') {
          for (const decl of exportDecl.declaration.declarations) {
            const vDecl = decl as VariableDeclarator;
            if (vDecl.id.type === 'Identifier' && vDecl.id.name === name) {
              if (vDecl.init) return this.resolveConstant(vDecl.init, parsed);
            }
          }
        }
      }
    }
    return null;
  }

  private resolveMemberConstant(expr: MemberExpression, parsed: ParsedFile): number | null {
    if (expr.property.type !== 'Identifier') return null;
    const propName = expr.property.name;

    if (expr.object.type === 'Identifier') {
      const objName = (expr.object as Identifier).name;
      return this.findPropertyInObject(objName, propName, parsed);
    }

    if (expr.object.type === 'MemberExpression') {
      const parent = expr.object as MemberExpression;
      if (parent.property.type !== 'Identifier') return null;
      const parentProp = parent.property.name;
      if (parent.object.type === 'Identifier') {
        const rootObj = (parent.object as Identifier).name;
        const parentObj = this.findObjectInFile(rootObj, parsed);
        if (!parentObj) return null;
        const nestedObj = this.findNestedObject(parentObj, parentProp);
        if (!nestedObj) return null;
        return this.getNumericPropertyFromObject(nestedObj, propName);
      }
    }

    return null;
  }

  private findPropertyInObject(objName: string, propName: string, parsed: ParsedFile): number | null {
    const obj = this.findObjectInFile(objName, parsed);
    if (!obj) return null;
    return this.getNumericPropertyFromObject(obj, propName);
  }

  private findObjectInFile(name: string, parsed: ParsedFile): ObjectExpression | null {
    for (const node of parsed.ast.body) {
      if (node.type === 'VariableDeclaration') {
        for (const decl of node.declarations) {
          const vDecl = decl as VariableDeclarator;
          if (vDecl.id.type === 'Identifier' && vDecl.id.name === name) {
            if (vDecl.init?.type === 'ObjectExpression') return vDecl.init as ObjectExpression;
          }
        }
      }
      if (node.type === 'ExportNamedDeclaration') {
        const exportDecl = node as any;
        if (exportDecl.declaration?.type === 'VariableDeclaration') {
          for (const decl of exportDecl.declaration.declarations) {
            const vDecl = decl as VariableDeclarator;
            if (vDecl.id.type === 'Identifier' && vDecl.id.name === name) {
              if (vDecl.init?.type === 'ObjectExpression') return vDecl.init as ObjectExpression;
            }
          }
        }
      }
    }
    return null;
  }

  private findNestedObject(obj: ObjectExpression, propName: string): ObjectExpression | null {
    for (const prop of obj.properties) {
      if (prop.type !== 'Property') continue;
      const p = prop as Property;
      if (p.key.type !== 'Identifier') continue;
      if (p.key.name !== propName) continue;
      if (p.value.type === 'ObjectExpression') return p.value as ObjectExpression;
    }
    return null;
  }

  private getNumericPropertyFromObject(obj: ObjectExpression, propName: string): number | null {
    for (const prop of obj.properties) {
      if (prop.type !== 'Property') continue;
      const p = prop as Property;
      if (p.key.type !== 'Identifier') continue;
      if (p.key.name !== propName) continue;
      const value = p.value as TSESTree.Expression;
      // Direct literal — no need for full resolveConstant
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
    return null;
  }

  private parseFileWithCache(filePath: string): ParsedFile | null {
    if (this.fileCache.has(filePath)) return this.fileCache.get(filePath)!;
    try {
      const parsed = parseFile(filePath);
      this.fileCache.set(filePath, parsed);
      return parsed;
    } catch {
      return null;
    }
  }
}
