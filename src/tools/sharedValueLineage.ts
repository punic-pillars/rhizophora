// ============================================================
// sharedValueLineage.ts — trace_shared_value_lineage tool handler
// SharedValue lifecycle tracer: creation → mutation →
// useAnimatedStyle consumption → direct-JSX-usage bug
// v0.4.1: Added prop propagation and non-worklet mutation display
// v0.9.0: Added Context Propagation and Context Consumer display
// ============================================================

import { SharedValueLineageTracer } from '../engine/SharedValueLineageTracer.js';
import { validateFilePath } from '../utils/validateFilePath.js';
import type { ToolResponse } from './shared.js';
import { success, error } from './shared.js';

const tracer = new SharedValueLineageTracer();

export function handleTraceSharedValueLineage(args: { filePath: string }): ToolResponse {
  try {
    validateFilePath(args.filePath);
    const report = tracer.trace(args.filePath);

    const lines: string[] = [];
    lines.push(`[SHARED-VALUE-LINEAGE] ${args.filePath}`);

    if (report.sharedValues.length === 0) {
      lines.push('[CLEAN] No useSharedValue declarations found.');
      return success(lines.join('\n'));
    }

    // ─── Summary Table ────────────────────────────────────────
    lines.push('[TABLE] Name | Init | Mutated | Consumed | DirectJSX | PropProp | NonWkMut | CtxProp | CtxCons');
    for (const sv of report.sharedValues) {
      const mutated = sv.isMutated ? 'yes' : 'no';
      const consumed = sv.isConsumedByAnimatedStyle ? 'yes' : 'no';
      const directJSX = sv.isUsedDirectlyInJSX ? 'BUG' : 'no';
      const propagated = sv.propPropagationSites.length > 0 ? `${sv.propPropagationSites.length}` : 'no';
      const nonWkMut = sv.isMutatedOutsideWorklet ? 'yes' : 'no';
      const ctxProp = sv.contextPropagationSites.length > 0 ? `${sv.contextPropagationSites.length}` : 'no';
      const ctxCons = sv.contextConsumerSites.length > 0 ? `${sv.contextConsumerSites.length}` : 'no';
      lines.push(`  ${sv.name} | ${sv.initialValue} | ${mutated} | ${consumed} | ${directJSX} | ${propagated} | ${nonWkMut} | ${ctxProp} | ${ctxCons}`);
    }

    // ─── Issues ───────────────────────────────────────────────
    if (report.issues.length > 0) {
      lines.push('');
      lines.push('[ISSUES]');
      for (const issue of report.issues) {
        const severity = issue.severity.toUpperCase();
        lines.push(`[${severity}] ${issue.sharedValue} | ${issue.description}`);
        lines.push(`  Location: ${issue.location}`);
        lines.push(`  Suggestion: ${issue.suggestion}`);
      }
    }

    // ─── Detailed Lineage ─────────────────────────────────────
    lines.push('');
    lines.push('[LINEAGE]');
    for (const sv of report.sharedValues) {
      lines.push(`  ◆ ${sv.name} = useSharedValue(${sv.initialValue})`);

      if (sv.mutationSites.length > 0) {
        lines.push(`    Mutations (${sv.mutationSites.length}): ${sv.mutationSites.join(', ')}`);
      } else {
        lines.push(`    Mutations: none`);
      }

      if (sv.consumptionSites.length > 0) {
        lines.push(`    Consumed (${sv.consumptionSites.length}): ${sv.consumptionSites.join(', ')}`);
      } else {
        lines.push(`    Consumed: none`);
      }

      if (sv.isUsedDirectlyInJSX) {
        lines.push(`    ⚠️ Direct JSX usage — BUG PATTERN`);
      }

      if (sv.propPropagationSites.length > 0) {
        lines.push(`    Prop Propagation (${sv.propPropagationSites.length}): ${sv.propPropagationSites.join(', ')}`);
      }

      if (sv.nonWorkletMutationSites.length > 0) {
        lines.push(`    Non-worklet Mutations (${sv.nonWorkletMutationSites.length}): ${sv.nonWorkletMutationSites.join(', ')}`);
      }

      if (sv.contextPropagationSites.length > 0) {
        lines.push(`    Context Propagation (${sv.contextPropagationSites.length}):`);
        for (const site of sv.contextPropagationSites) {
          const localTag = site.isLocal ? '' : ' (external)';
          lines.push(`      • ${site.contextName}Context.Provider value={{ ${site.propName} }} (line ${site.lineNumber})${localTag}`);
        }
      }

      if (sv.contextConsumerSites.length > 0) {
        lines.push(`    Context Consumers (${sv.contextConsumerSites.length}):`);
        for (const site of sv.contextConsumerSites) {
          const usageStr = site.usagePatterns.length > 0 ? site.usagePatterns.join(', ') : 'no usage detected';
          lines.push(`      • useContext(${site.contextName}Context) → { ${sv.name} } (line ${site.lineNumber}) — ${usageStr}`);
        }
      }
    }

    lines.push('');
    lines.push(`[SUMMARY] ${report.summary}`);
    return success(lines.join('\n'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return error(`[ERROR] ${args.filePath}: ${message}`);
  }
}
