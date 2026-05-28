import { formatAdvisoryDbFreshness, relativeAge } from "../src/utils/time.js";
import { stripAnsi } from "../src/utils/chalk.js";

describe("relativeAge", () => {
  it("returns 'just synced' when timestamp is within the last minute", () => {
    expect(relativeAge(Date.now() - 5 * 1000)).toBe("just synced");
  });

  it("returns minutes when timestamp is within the last hour", () => {
    expect(relativeAge(Date.now() - 5 * 60 * 1000)).toBe("synced 5 minutes ago");
  });

  it("uses singular minute for exactly one minute", () => {
    expect(relativeAge(Date.now() - 60 * 1000)).toBe("synced 1 minute ago");
  });

  it("returns hours when timestamp is within the last day", () => {
    expect(relativeAge(Date.now() - 3 * 60 * 60 * 1000)).toBe("synced 3 hours ago");
  });

  it("uses singular hour for exactly one hour", () => {
    expect(relativeAge(Date.now() - 60 * 60 * 1000)).toBe("synced 1 hour ago");
  });

  it("returns days when timestamp is older than a day", () => {
    expect(relativeAge(Date.now() - 2 * 24 * 60 * 60 * 1000)).toBe("synced 2 days ago");
  });

  it("uses singular day for exactly one day", () => {
    expect(relativeAge(Date.now() - 24 * 60 * 60 * 1000)).toBe("synced 1 day ago");
  });

  it("clamps future timestamps to 'just synced'", () => {
    expect(relativeAge(Date.now() + 60 * 60 * 1000)).toBe("just synced");
  });
});

describe("formatAdvisoryDbFreshness", () => {
  it("returns 'unknown' when lastSyncAt is null", () => {
    expect(stripAnsi(formatAdvisoryDbFreshness(null))).toBe("unknown");
  });

  it("returns 'unknown' when lastSyncAt cannot be parsed", () => {
    expect(stripAnsi(formatAdvisoryDbFreshness("not-a-date"))).toBe("unknown");
  });

  it("includes the relative age and the raw timestamp when parseable", () => {
    const iso = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(stripAnsi(formatAdvisoryDbFreshness(iso))).toBe(`synced 5 minutes ago (${iso})`);
  });
});
