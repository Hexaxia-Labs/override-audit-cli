import type { ScanResult, Severity } from '../types.js';

const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low', 'info'];

export function renderHuman(result: ScanResult): string {
  const lines: string[] = [];
  lines.push(`override-audit  ${result.context.projectPath}  (${result.context.packageManager})`);
  lines.push('');

  if (result.findings.length === 0) {
    lines.push('  No findings.');
  } else {
    const grouped = groupBy(result.findings, f => f.severity);
    lines.push(`  ${result.findings.length} finding${result.findings.length === 1 ? '' : 's'}:`);
    lines.push('');
    for (const sev of SEVERITY_ORDER) {
      const list = grouped.get(sev);
      if (!list || list.length === 0) continue;
      lines.push(`  [${sev}]`);
      for (const f of list) {
        const code = f.subRuleId ?? f.ruleId;
        const action = f.remediation.action;
        const pin = typeof f.pinValue === 'string' ? f.pinValue : JSON.stringify(f.pinValue);
        lines.push(`    ${code}  ${f.package}  ${pin}  → ${action}`);
        lines.push(`        ${f.detail}`);
      }
      lines.push('');
    }
  }

  if (result.context.skippedDetectors.length > 0) {
    lines.push('  Skipped detectors (incomplete inputs):');
    for (const s of result.context.skippedDetectors) {
      lines.push(`    ${s.ruleId.split('-')[0]}  ${s.reason}`);
    }
  }

  return lines.join('\n') + '\n';
}

function groupBy<T, K>(arr: T[], key: (t: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const item of arr) {
    const k = key(item);
    const list = m.get(k) ?? [];
    list.push(item);
    m.set(k, list);
  }
  return m;
}
