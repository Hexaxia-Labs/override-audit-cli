// Tests for cross-detector composite logic in scanner.ts (post-processing rules).

import { scan } from '../src/scanner.js';
import { join, dirname } from 'path';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';

const FIXTURE_ROOT = join(process.cwd(), 'tests', 'fixtures', '.composite-scanner');

function setupComposite(): string {
  // Constructs a fixture where:
  //   - override is "postcss": "^8.5.15"   (range — non-platform-binary target)
  //   - parent next@16 declares postcss="8.4.31" exact (triggers OA006)
  //   - installed postcss is 8.4.31 (below the override floor → triggers OA008)
  //   - Expected: OA006 escalates from medium to high because OA008 confirms.
  rmSync(FIXTURE_ROOT, { recursive: true, force: true });
  mkdirSync(FIXTURE_ROOT, { recursive: true });
  writeFileSync(
    join(FIXTURE_ROOT, 'package.json'),
    JSON.stringify({
      name: 'composite-fixture', version: '0.0.0',
      dependencies: { next: '^16.2.6' },
      overrides: { postcss: '^8.5.15' },
    }),
  );
  writeFileSync(
    join(FIXTURE_ROOT, 'package-lock.json'),
    JSON.stringify({
      name: 'composite-fixture', version: '0.0.0', lockfileVersion: 3,
      packages: {
        '': {},
        'node_modules/next': { version: '16.2.6' },
        'node_modules/postcss': { version: '8.4.31' },
      },
    }),
  );
  const next = join(FIXTURE_ROOT, 'node_modules', 'next');
  mkdirSync(next, { recursive: true });
  writeFileSync(
    join(next, 'package.json'),
    JSON.stringify({
      name: 'next', version: '16.2.6',
      dependencies: { postcss: '8.4.31' },   // exact pin — triggers OA006
    }),
  );
  const postcss = join(FIXTURE_ROOT, 'node_modules', 'postcss');
  mkdirSync(postcss, { recursive: true });
  writeFileSync(
    join(postcss, 'package.json'),
    JSON.stringify({ name: 'postcss', version: '8.4.31' }),   // BELOW override floor — triggers OA008
  );
  return FIXTURE_ROOT;
}

afterAll(() => {
  rmSync(FIXTURE_ROOT, { recursive: true, force: true });
});

describe('scanner composite: OA006 + OA008 escalation', () => {
  it('escalates OA006 from medium to high when OA008 also fires for the same target', async () => {
    const path = setupComposite();
    const { findings } = await scan(path);

    const oa006 = findings.find(f => f.ruleId === 'OA006-COUPLED-PLATFORM-BINARY' && f.package === 'postcss');
    const oa008 = findings.find(f => f.ruleId === 'OA008-VULNERABLE-TWIN' && f.package === 'postcss');

    expect(oa006).toBeDefined();
    expect(oa008).toBeDefined();
    expect(oa006!.severity).toBe('high');       // escalated from medium
    expect(oa006!.title).toContain('OA008 confirms');
  });
});
