// ============================================================
// ASTParser.ts — TypeScript AST wrapper for React Native files.
// Uses @typescript-eslint/parser for 100% accurate parsing.
//
// v1.0.0 "Refactored Vein" — Simplified to pure parsing only.
//   Extraction logic moved to ASTExtractor.ts.
//   JSX helpers moved to JSXHelpers.ts.
//   Import resolution moved to ImportResolver.ts.
//   Types moved to types.ts.
// ============================================================

import * as fs from 'fs';
import { parse } from '@typescript-eslint/typescript-estree';
import type { TSESTree } from '@typescript-eslint/typescript-estree';
import { extractImports, extractReExports, extractExportedComponents } from './ASTExtractor.js';
import type { ParsedFile } from './types.js';

const PARSE_OPTIONS = {
  jsx: true,
  filePath: 'file.tsx',
  loc: true,
  range: true,
  comment: true,
  errorOnUnknownASTType: false,
};

/**
 * Parse a .tsx/.ts file into an AST with extracted metadata.
 */
export function parseFile(filePath: string): ParsedFile {
  const source = fs.readFileSync(filePath, 'utf-8');
  const ast = parse(source, {
    ...PARSE_OPTIONS,
    filePath: filePath.endsWith('.ts') ? 'file.ts' : 'file.tsx',
  }) as TSESTree.Program;

  return {
    filePath,
    source,
    ast,
    imports: extractImports(ast, filePath),
    exportedComponents: extractExportedComponents(ast, filePath),
    reExports: extractReExports(ast, filePath),
  };
}

/**
 * Parse source text directly (for cross-file resolution).
 */
export function parseSource(source: string, virtualPath: string = 'file.tsx'): TSESTree.Program {
  return parse(source, {
    ...PARSE_OPTIONS,
    filePath: virtualPath,
  }) as TSESTree.Program;
}
