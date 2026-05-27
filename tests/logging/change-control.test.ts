import {
  FileLogger, NullLogger, MemoryLogger, defaultLevel,
  type ChangeControlRecord,
} from '../../src/logging/change-control.js';
import { mkdirSync, rmSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const TMP = join(process.cwd(), 'tests', 'fixtures', '.cc-log-test');

function attempt(extra: Partial<ChangeControlRecord> = {}): ChangeControlRecord {
  return {
    type: 'remediation_attempt',
    attemptId: 'rem_test',
    timestamp: '2026-05-27T00:00:00.000Z',
    tool: 'override-audit-cli',
    toolVersion: '0.3.0',
    level: 'info',
    projectPath: '/p',
    dryRun: false,
    ...extra,
  } as ChangeControlRecord;
}

describe('NullLogger', () => {
  it('accepts records and does nothing', () => {
    const log = new NullLogger();
    expect(() => log.log(attempt())).not.toThrow();
    log.close();
  });
});

describe('MemoryLogger', () => {
  it('captures records in order', () => {
    const log = new MemoryLogger();
    log.log(attempt());
    log.log(attempt({ attemptId: 'rem_2' }));
    expect(log.records).toHaveLength(2);
    expect(log.records[0]!.attemptId).toBe('rem_test');
    expect(log.records[1]!.attemptId).toBe('rem_2');
  });
});

describe('FileLogger', () => {
  beforeEach(() => {
    rmSync(TMP, { recursive: true, force: true });
    mkdirSync(TMP, { recursive: true });
  });
  afterAll(() => rmSync(TMP, { recursive: true, force: true }));

  it('writes NDJSON: one record per line, each line is valid JSON', () => {
    const path = join(TMP, 'cc.log');
    const log = new FileLogger(path);
    log.log(attempt());
    log.log(attempt({ attemptId: 'rem_2' }));
    log.close();

    const lines = readFileSync(path, 'utf-8').trimEnd().split('\n');
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
    expect(JSON.parse(lines[0]!).attemptId).toBe('rem_test');
    expect(JSON.parse(lines[1]!).attemptId).toBe('rem_2');
  });

  it('appends to an existing file (does not truncate)', () => {
    const path = join(TMP, 'cc.log');
    writeFileSync(path, 'existing line\n');
    const log = new FileLogger(path);
    log.log(attempt());
    log.close();

    const content = readFileSync(path, 'utf-8');
    expect(content).toMatch(/^existing line/);
    expect(content).toContain('"remediation_attempt"');
  });

  it('filters records below the level threshold', () => {
    const path = join(TMP, 'cc.log');
    const log = new FileLogger(path, 'warn');
    log.log(attempt({ level: 'debug' }));    // dropped
    log.log(attempt({ level: 'info' }));     // dropped
    log.log(attempt({ level: 'warn' }));     // kept
    log.log(attempt({ level: 'error' }));    // kept
    log.close();

    const lines = readFileSync(path, 'utf-8').trimEnd().split('\n').filter(Boolean);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!).level).toBe('warn');
    expect(JSON.parse(lines[1]!).level).toBe('error');
  });
});

describe('defaultLevel', () => {
  it('flags failed records as error', () => {
    expect(defaultLevel('remediation_failed')).toBe('error');
  });
  it('flags other lifecycle records as info', () => {
    expect(defaultLevel('remediation_attempt')).toBe('info');
    expect(defaultLevel('remediation_applied')).toBe('info');
    expect(defaultLevel('remediation_skipped')).toBe('info');
    expect(defaultLevel('remediation_complete')).toBe('info');
  });
});
