import { HELP_TEXT } from '../../src/cli/help.js';

describe('HELP_TEXT', () => {
  it('mentions all v0.1.0 detection flags', () => {
    for (const flag of ['--json', '--severity', '--rule', '--include-sub-suspect', '--help', '--version']) {
      expect(HELP_TEXT).toContain(flag);
    }
  });
  it('mentions all v1 rule codes', () => {
    for (const code of ['OA001', 'OA002', 'OA003', 'OA004', 'OA005']) {
      expect(HELP_TEXT).toContain(code);
    }
  });
  it('documents the FIX section and the now-shipped --fix flag', () => {
    expect(HELP_TEXT).toMatch(/FIX\b/);
    expect(HELP_TEXT).toContain('--fix');
    expect(HELP_TEXT).toContain('--dry-run');
    expect(HELP_TEXT).toContain('--no-post-fix-rescan');
  });
  it('signals that change-control logging flags are coming in v0.3.0', () => {
    expect(HELP_TEXT).toMatch(/v0\.3\.0/);
  });
});
