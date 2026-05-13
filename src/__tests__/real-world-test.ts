// ============================================================
// real-world-test.ts — Test Phase 2 tools against real code
// Run with: npx tsx src/__tests__/real-world-test.ts
// ============================================================

import { BridgeCrossingDetector } from '../engine/BridgeCrossingDetector.js';
import { RenderTrapDetector } from '../engine/RenderTrapDetector.js';
import { SharedValueLineageTracer } from '../engine/SharedValueLineageTracer.js';

const headerPath = 'c:/Users/abesa/OneDrive/Desktop/ov/ola_vision/app/_components/header/DynamicHeader.tsx';

console.log('\n=== BridgeCrossingDetector ===');
const bcd = new BridgeCrossingDetector();
const bcr = bcd.detect(headerPath);
console.log('Crossings:', bcr.crossings.length);
for (const c of bcr.crossings) {
  console.log(`  [${c.severity}] ${c.handler} → ${c.culprit} (line ${c.lineNumber})`);
  console.log(`    Context: ${c.lineContext.substring(0, 80)}`);
  console.log(`    Suggestion: ${c.suggestion.substring(0, 80)}`);
}

console.log('\n=== RenderTrapDetector ===');
const rtd = new RenderTrapDetector();
const rtr = rtd.detect(headerPath);
console.log('Traps:', rtr.traps.length);
for (const t of rtr.traps) {
  console.log(`  [${t.severity}] ${t.component} ← ${t.propType} (${t.propName}) line ${t.lineNumber}`);
  console.log(`    Parent: ${t.parentComponent}`);
  console.log(`    Context: ${t.lineContext.substring(0, 80)}`);
}

console.log('\n=== SharedValueLineageTracer ===');
const svt = new SharedValueLineageTracer();
const svr = svt.trace(headerPath);
console.log('SharedValues:', svr.sharedValues.length);
for (const sv of svr.sharedValues) {
  console.log(`  ${sv.name} = ${sv.initialValue} | mutated: ${sv.isMutated} | consumed: ${sv.isConsumedByAnimatedStyle} | directJSX: ${sv.isUsedDirectlyInJSX}`);
  if (sv.mutationSites.length > 0) {
    console.log(`    Mutations (${sv.mutationSites.length}):`);
    for (const site of sv.mutationSites) {
      console.log(`      • ${site.substring(0, 80)}`);
    }
  }
  if (sv.consumptionSites.length > 0) {
    console.log(`    Consumed (${sv.consumptionSites.length}):`);
    for (const site of sv.consumptionSites) {
      console.log(`      • ${site.substring(0, 80)}`);
    }
  }
}
console.log('Issues:', svr.issues.length);
for (const issue of svr.issues) {
  console.log(`  [${issue.severity}] ${issue.sharedValue}: ${issue.description.substring(0, 100)}`);
}

console.log('\n✅ Real-world test complete');
