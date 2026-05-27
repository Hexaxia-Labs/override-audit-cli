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
  it('signals that --fix is coming in v0.2.0', () => {
    expect(HELP_TEXT).toMatch(/v0\.2\.0/);
  });
});
