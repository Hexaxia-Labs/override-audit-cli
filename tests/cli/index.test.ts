import { run } from '../../src/cli/index.js';
import { join } from 'path';

const F = (n: string) => join(process.cwd(), 'tests', 'fixtures', n);

function captureStreams() {
  const out: string[] = [], err: string[] = [];
  return {
    out, err,
    print: (s: string) => out.push(s),
    eprint: (s: string) => err.push(s),
  };
}

describe('run (bin entrypoint)', () => {
  it('exits 0 on a clean project', async () => {
    const s = captureStreams();
    const code = await run(['--json', F('scanner-clean')], { print: s.print, eprint: s.eprint });
    expect(code).toBe(0);
    expect(s.out.join('')).toContain('"findingCount": 0');
  });

  it('exits 1 when findings present at default severity', async () => {
    const s = captureStreams();
    const code = await run([F('scanner-hexmetrics')], { print: s.print, eprint: s.eprint });
    expect(code).toBe(1);
    expect(s.out.join('')).toContain('OA002');
  });

  it('exits 0 when findings are below --severity threshold', async () => {
    const s = captureStreams();
    const code = await run([F('scanner-hexmetrics'), '--severity', 'critical'], { print: s.print, eprint: s.eprint });
    expect(code).toBe(0);  // hexmetrics fixture has no critical findings
  });

  it('exits 2 on usage error (unknown flag)', async () => {
    const s = captureStreams();
    const code = await run(['--nonsense', F('scanner-clean')], { print: s.print, eprint: s.eprint });
    expect(code).toBe(2);
    expect(s.err.join('')).toContain('Unknown flag');
  });

  it('exits 0 with --fix on a clean project (nothing to fix)', async () => {
    const s = captureStreams();
    const code = await run(['--fix', F('scanner-clean')], { print: s.print, eprint: s.eprint });
    expect(code).toBe(0);
    expect(s.out.join('')).toContain('FIX');
  });

  it('exits 2 when --log-file is used (reserved for v0.3.0)', async () => {
    const s = captureStreams();
    const code = await run(['--log-file', '/tmp/x.log'], { print: s.print, eprint: s.eprint });
    expect(code).toBe(2);
    expect(s.err.join('')).toContain('v0.3.0');
  });

  it('prints help and exits 0 for --help', async () => {
    const s = captureStreams();
    const code = await run(['--help'], { print: s.print, eprint: s.eprint });
    expect(code).toBe(0);
    expect(s.out.join('')).toContain('override-audit');
  });

  it('prints version and exits 0 for --version', async () => {
    const s = captureStreams();
    const code = await run(['--version'], { print: s.print, eprint: s.eprint });
    expect(code).toBe(0);
    expect(s.out.join('').trim()).toMatch(/^\d+\.\d+\.\d+/);
  });
});
