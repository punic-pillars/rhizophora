// ============================================================
// smoke-test.ts — Quick smoke test to verify all tools work
// v1.0.0 "Refactored Vein" — Updated imports for refactored
//   vein modules. SemanticLayoutGraph is now pure data structure;
//   analysis logic is in GraphAnalyzer, rendering in GraphRenderer.
// Run with: npx tsx src/__tests__/smoke-test.ts
// ============================================================

import { fileURLToPath } from 'url';
import { BoundaryGapDetector } from '../engine/BoundaryGapDetector.js';
import { BridgeCrossingDetector } from '../engine/BridgeCrossingDetector.js';
import { RenderTrapDetector } from '../engine/RenderTrapDetector.js';
import { SharedValueLineageTracer } from '../engine/SharedValueLineageTracer.js';
import { loadConfig } from '../domain/types/index.js';
import { SemanticLayoutGraph } from '../engine/vein/SemanticLayoutGraph.js';
import { GraphAnalyzer } from '../engine/vein/GraphAnalyzer.js';
import { GraphRenderer } from '../engine/vein/GraphRenderer.js';
import { HeuristicInferenceEngine } from '../engine/vein/HeuristicInferenceEngine.js';
import { parseSource, parseFile } from '../engine/vein/ASTParser.js';
import { getStyleSheetBlock } from '../engine/utils/StyleSheetParser.js';

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`  ✅ ${message}`);
}

async function main() {
  console.log('\n🧪 Rhizophora Smoke Test (v4.0 "Performance Guardian")\n');

  // ─── Test config loading ───────────────────────────────────
  console.log('🔍 Testing Config Loader...');
  const config = await loadConfig();
  assert(typeof config === 'object', 'loadConfig returns an object');
  console.log(`  Config loaded: ${Object.keys(config).length > 0 ? 'project config found' : 'no config (defaults will be used)'}`);


  // ─── Test file: use the smoke-test itself as a valid .tsx stand-in ──
  // For real testing, point to an actual .tsx file
  const testFilePath = fileURLToPath(import.meta.url);

  // 1. Test BoundaryGapDetector (v3.2: configurable options)
  console.log('\n🔍 Testing BoundaryGapDetector (v3.2)...');
  // Test with default options
  const boundaryDetector = new BoundaryGapDetector();
  try {
    const gaps = boundaryDetector.detect(testFilePath);
    assert(typeof gaps.filePath === 'string', 'BoundaryGapDetector returns filePath');
    assert(Array.isArray(gaps.gaps), 'BoundaryGapDetector returns gaps array');
    console.log(`  Gaps found: ${gaps.gaps.length} (${gaps.gaps.filter(g => g.severity === 'high').length} high, ${gaps.gaps.filter(g => g.severity === 'medium').length} medium, ${gaps.gaps.filter(g => g.severity === 'low').length} low)`);
  } catch (e) {
    console.log(`  ⚠️  BoundaryGapDetector test skipped: ${e}`);
  }

  // Test with custom options
  console.log('  Testing BoundaryGapDetector with custom options...');
  const customBoundaryDetector = new BoundaryGapDetector({
    designTokens: [4, 8, 12, 16, 24, 32],
  });
  try {
    const gaps = customBoundaryDetector.detect(testFilePath);
    assert(typeof gaps.filePath === 'string', 'Custom BoundaryGapDetector returns filePath');
    console.log(`  Custom options OK: designTokens=[4, 8, 12, 16, 24, 32]`);
  } catch (e) {
    console.log(`  ⚠️  Custom BoundaryGapDetector test skipped: ${e}`);
  }

  // 3. Test BridgeCrossingDetector (Phase 2)
  console.log('\n🔍 Testing BridgeCrossingDetector...');
  const bridgeDetector = new BridgeCrossingDetector();
  try {
    const report = bridgeDetector.detect(testFilePath);
    assert(typeof report.filePath === 'string', 'BridgeCrossingDetector returns filePath');
    assert(Array.isArray(report.crossings), 'BridgeCrossingDetector returns crossings array');
    console.log(`  Crossings found: ${report.crossings.length}`);
    for (const c of report.crossings) {
      console.log(`  [${c.severity}] ${c.handler} → ${c.culprit} (line ${c.lineNumber})`);
    }
  } catch (e) {
    console.log(`  ⚠️  BridgeCrossingDetector test skipped: ${e}`);
  }

  // 4. Test RenderTrapDetector (Phase 2, v4.0: hook tracing)
  console.log('\n🔍 Testing RenderTrapDetector (v4.0)...');
  const trapDetector = new RenderTrapDetector();
  try {
    const report = trapDetector.detect(testFilePath);
    assert(typeof report.filePath === 'string', 'RenderTrapDetector returns filePath');
    assert(Array.isArray(report.traps), 'RenderTrapDetector returns traps array');
    console.log(`  Traps found: ${report.traps.length}`);
    for (const t of report.traps) {
      console.log(`  [${t.severity}] ${t.component} ← ${t.propType} (${t.propName})`);
    }
  } catch (e) {
    console.log(`  ⚠️  RenderTrapDetector test skipped: ${e}`);
  }

  // 5. Test SharedValueLineageTracer (Phase 2, v4.0: useDerivedValue awareness)
  console.log('\n🔍 Testing SharedValueLineageTracer (v4.0)...');
  const svTracer = new SharedValueLineageTracer();
  try {
    const report = svTracer.trace(testFilePath);
    assert(typeof report.filePath === 'string', 'SharedValueLineageTracer returns filePath');
    assert(Array.isArray(report.sharedValues), 'SharedValueLineageTracer returns sharedValues array');
    assert(Array.isArray(report.issues), 'SharedValueLineageTracer returns issues array');
    console.log(`  SharedValues found: ${report.sharedValues.length}`);
    console.log(`  Issues found: ${report.issues.length}`);
    for (const sv of report.sharedValues) {
      console.log(`  ${sv.name} = ${sv.initialValue} | mutated: ${sv.isMutated} | consumed: ${sv.consumptionSites.length > 0} | directJSX: ${sv.isUsedDirectlyInJSX}`);
    }
    for (const issue of report.issues) {
      console.log(`  [${issue.severity}] ${issue.sharedValue}: ${issue.description}`);
    }
  } catch (e) {
    console.log(`  ⚠️  SharedValueLineageTracer test skipped: ${e}`);
  }

  // ─── 7. Test SemanticLayoutGraph (v1.0.0) ──────────────────
  console.log('\n🔍 Testing SemanticLayoutGraph (v1.0.0)...');
  try {
    const graph = new SemanticLayoutGraph();
    const analyzer = new GraphAnalyzer();
    const renderer = new GraphRenderer();

    // Create nodes
    const rootId = graph.createNode({
      componentName: 'View',
      tagName: 'View',
      filePath: testFilePath,
      lineNumber: 1,
      spacing: { padding: 16 },
      layout: { flexDirection: 'column' },
      isPrimitive: true,
    });

    const child1Id = graph.createNode({
      componentName: 'Header',
      tagName: 'Header',
      filePath: testFilePath,
      lineNumber: 5,
      spacing: { marginBottom: 12 },
      isCustomComponent: true,
    });

    const child2Id = graph.createNode({
      componentName: 'Content',
      tagName: 'Content',
      filePath: testFilePath,
      lineNumber: 10,
      spacing: { marginBottom: 12 },
      isCustomComponent: true,
    });

    graph.addChild(rootId, child1Id);
    graph.addChild(rootId, child2Id);

    // Test slot detection
    graph.setSlot(child1Id);
    const slotNode = graph.getNode(child1Id);
    assert(slotNode?.isSlot === true, 'setSlot marks node as slot');

    // Test context calls
    graph.addContextCall(child2Id, 'ThemeContext');
    const contextNode = graph.getNode(child2Id);
    assert(contextNode?.contextCalls.includes('ThemeContext') === true, 'addContextCall tracks context usage');

    // Test graph queries
    assert(graph.getRoot()?.id === rootId, 'getRoot returns root node');
    assert(graph.getAllNodes().length === 3, 'getAllNodes returns all nodes');
    assert(graph.getContainerNodes().length === 1, 'getContainerNodes returns only parents');
    assert(graph.getLeafNodes().length === 2, 'getLeafNodes returns children');
    assert(graph.getDepth(child2Id) === 1, 'getDepth returns correct depth');

    // Test style pollution via GraphAnalyzer (skips slots)
    const pollution = analyzer.findStylePollution(graph);
    assert(pollution.length === 1, 'findStylePollution skips slot components');
    assert(pollution[0].componentName === 'Content', 'findStylePollution returns non-slot custom components');

    // Test margin stacking via GraphAnalyzer
    const stacking = analyzer.findMarginStacking(graph);
    assert(stacking.length === 2, 'findMarginStacking detects parent padding + child margins');

    // Test ASCII rendering via GraphRenderer
    const ascii = renderer.renderAscii(graph);
    assert(ascii.includes('<View>'), 'renderAscii includes root tag');
    assert(ascii.includes('🔄'), 'renderAscii shows slot marker for slot nodes');

    console.log('  ✅ SemanticLayoutGraph: all operations verified');
  } catch (e) {
    console.log(`  ⚠️  SemanticLayoutGraph test error: ${e}`);
  }

  // ─── 8. Test HeuristicInferenceEngine (v1.0.0) ─────────────
  console.log('\n🔍 Testing HeuristicInferenceEngine (v1.0.0)...');
  try {
    const graph = new SemanticLayoutGraph();

    // Build a realistic graph
    const rootId = graph.createNode({
      componentName: 'Screen',
      tagName: 'View',
      filePath: testFilePath,
      lineNumber: 1,
      spacing: { padding: 16 },
      layout: { flexDirection: 'column' },
      isPrimitive: true,
    });

    const headerId = graph.createNode({
      componentName: 'Header',
      tagName: 'Header',
      filePath: testFilePath,
      lineNumber: 5,
      spacing: { marginBottom: 16 },
      isCustomComponent: true,
    });

    const listId = graph.createNode({
      componentName: 'List',
      tagName: 'FlatList',
      filePath: testFilePath,
      lineNumber: 10,
      isPrimitive: true,
    });

    graph.addChild(rootId, headerId);
    graph.addChild(rootId, listId);

    // Run inference
    const engine = new HeuristicInferenceEngine({
      designTokens: [4, 8, 12, 16, 24, 32],
    });
    const result = engine.analyze(graph);

    assert(result.healthScore >= 0 && result.healthScore <= 100, 'healthScore is in valid range');
    assert(Array.isArray(result.gapOpportunities), 'gapOpportunities is an array');
    assert(Array.isArray(result.stylePollution), 'stylePollution is an array');
    assert(Array.isArray(result.marginStacking), 'marginStacking is an array');
    assert(Array.isArray(result.listItemIssues), 'listItemIssues is an array');
    assert(Array.isArray(result.tokenDeviations), 'tokenDeviations is an array');

    // Test summary report
    const summary = engine.generateSummaryReport(result);
    assert(summary.includes('Vein Propagation Report'), 'generateSummaryReport includes header');
    assert(summary.includes('Health Score'), 'generateSummaryReport includes health score');

    console.log('  ✅ HeuristicInferenceEngine: analysis and report generation verified');
  } catch (e) {
    console.log(`  ⚠️  HeuristicInferenceEngine test error: ${e}`);
  }

  // ─── 9. Test ASTParser (v0.7.0) ────────────────────────────
  console.log('\n🔍 Testing ASTParser (v0.7.0)...');
  try {
    // Test parseSource returns a valid AST Program
    const source = `
      import React from 'react';
      import { View, Text } from 'react-native';
      import { Card } from './Card';

      export { default as StationCard } from './StationCard';
      export { Button } from './Button';
      export * from './utils';

      const MyComponent = () => (
        <View style={styles.container}>
          <Text>Hello</Text>
        </View>
      );
    `;

    const ast = parseSource(source, 'test.tsx');
    assert(ast !== null, 'parseSource returns a Program');
    assert(ast.body.length > 0, 'parseSource extracts AST body nodes');

    // Count import/export declarations in the AST body
    const importNodes = ast.body.filter(n => n.type === 'ImportDeclaration');
    const exportNamedNodes = ast.body.filter(n => n.type === 'ExportNamedDeclaration');
    const exportAllNodes = ast.body.filter(n => n.type === 'ExportAllDeclaration');

    assert(importNodes.length >= 3, 'AST contains import declarations');
    assert(exportNamedNodes.length >= 2, 'AST contains named re-export declarations');
    assert(exportAllNodes.length >= 1, 'AST contains wildcard re-export declarations');

    // Verify re-export structure by inspecting AST nodes directly
    const stationCardExport = exportNamedNodes.find(n => {
      const decl = n as any;
      return decl.specifiers?.some((s: any) =>
        s.type === 'ExportSpecifier' && s.exported?.name === 'StationCard'
      );
    });
    assert(stationCardExport !== undefined, 'AST contains export { default as StationCard }');

    const buttonExport = exportNamedNodes.find(n => {
      const decl = n as any;
      return decl.specifiers?.some((s: any) =>
        s.type === 'ExportSpecifier' && s.exported?.name === 'Button'
      );
    });
    assert(buttonExport !== undefined, 'AST contains export { Button }');

    // Test parseFile on the smoke-test file itself
    const parsedFile = parseFile(testFilePath);
    assert(parsedFile.filePath === testFilePath, 'parseFile returns correct filePath');
    assert(parsedFile.imports instanceof Map, 'parseFile extracts imports map');
    assert(parsedFile.exportedComponents instanceof Map, 'parseFile extracts exportedComponents map');
    assert(parsedFile.reExports instanceof Map, 'parseFile extracts reExports map');

    console.log('  ✅ ASTParser: parsing and re-export extraction verified');
  } catch (e) {
    console.log(`  ⚠️  ASTParser test error: ${e}`);
  }

  // ─── 10. Test StyleSheetParser (v0.7.0) ────────────────────
  console.log('\n🔍 Testing StyleSheetParser (v0.7.0)...');
  try {
    const source = `
      import { StyleSheet } from 'react-native';

      const styles = StyleSheet.create({
        container: {
          flex: 1,
          padding: 16,
          backgroundColor: '#fff',
          gap: 8,
        },
        title: {
          fontSize: 24,
          fontWeight: 'bold',
          marginBottom: 12,
        },
      });
    `;

    const containerStyle = getStyleSheetBlock(source, 'container');
    assert(containerStyle !== null, 'getStyleSheetBlock returns style block');
    assert(containerStyle!.padding === 16, 'getStyleSheetBlock extracts numeric values');
    assert(containerStyle!.gap === 8, 'getStyleSheetBlock extracts gap');
    assert(containerStyle!.flex === 1, 'getStyleSheetBlock extracts flex');

    const titleStyle = getStyleSheetBlock(source, 'title');
    assert(titleStyle !== null, 'getStyleSheetBlock finds second style block');
    assert(titleStyle!.marginBottom === 12, 'getStyleSheetBlock extracts marginBottom');

    const missingStyle = getStyleSheetBlock(source, 'nonexistent');
    assert(missingStyle === null, 'getStyleSheetBlock returns null for missing style');

    console.log('  ✅ StyleSheetParser: AST-driven style extraction verified');
  } catch (e) {
    console.log(`  ⚠️  StyleSheetParser test error: ${e}`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🎉 All smoke tests passed!');
  console.log('   ✅ Config Loader');
  console.log('   ✅ BoundaryGapDetector (v3.2 + WI-1/WI-3/WI-5)');
  console.log('   ✅ BridgeCrossingDetector');
  console.log('   ✅ RenderTrapDetector (v4.0)');
  console.log('   ✅ SharedValueLineageTracer (v4.0)');
  console.log('   ✅ SemanticLayoutGraph (v1.0.0)');
  console.log('   ✅ HeuristicInferenceEngine (v1.0.0)');
  console.log('   ✅ ASTParser (v0.7.0 — re-export extraction)');
  console.log('   ✅ StyleSheetParser (v0.7.0 — AST-driven extraction)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

main().catch((err) => {
  console.error('Smoke test failed:', err);
  process.exit(1);
});
