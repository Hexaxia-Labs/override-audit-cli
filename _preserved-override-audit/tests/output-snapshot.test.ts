import { scan } from '../src/scanner.js';
import { renderJson } from '../src/output/json.js';
import { join } from 'path';

const F = join(process.cwd(), 'tests', 'fixtures', 'hexmetrics-real-world');

describe('output schema snapshot (hexmetrics-real-world)', () => {
  it('matches the v1 contract structure', async () => {
    const result = await scan(F);
    const out = renderJson(result, {
      attemptId: 'rem_snapshot-fixed-id',
      toolVersion: '0.1.0',
      generatedAt: '2026-05-27T00:00:00.000Z',
    });
    // Replace projectPath with a stable token for snapshot stability across machines.
    out.projectPath = '/FIXTURE/hexmetrics-real-world';
    expect(out).toMatchSnapshot();
  });

  it('includes at least: 1 OA002 + 1 OA005 finding (the hexmetrics signature)', async () => {
    const result = await scan(F);
    const rules = result.findings.map(f => f.subRuleId ?? f.ruleId);
    expect(rules).toContain('OA002-FLOATING-TAG');
    expect(rules.some(r => r.startsWith('OA005'))).toBe(true);
  });
});
