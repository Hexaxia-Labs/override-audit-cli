import { jest } from "@jest/globals";
import type { OsvVuln } from "../src/types.js";
import {
  clearPackumentCache,
  resolveLowestKnownNonVulnerableVersion,
} from "../src/remediation/npm-registry.js";

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function mockPackument(versions: string[]) {
  fetchMock.mockResolvedValue({
    ok: true,
    json: async () => ({
      versions: Object.fromEntries(versions.map(version => [version, {}])),
    }),
  });
}

function createVuln(id: string, events: Array<{ introduced?: string; fixed?: string; last_affected?: string }>): OsvVuln {
  return {
    id,
    affected: [
      {
        package: {
          ecosystem: "npm",
          name: "tar",
        },
        ranges: [{ type: "SEMVER", events }],
      },
    ],
  };
}

describe("resolveLowestKnownNonVulnerableVersion", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    clearPackumentCache();
  });

  it("skips vulnerable intermediate versions and returns the lowest known non-vulnerable target", async () => {
    mockPackument(["1.0.0", "1.0.1", "1.0.2", "1.0.3", "1.0.4"]);
    const vulnerabilities: OsvVuln[] = [
      createVuln("OSV-1", [{ introduced: "0" }, { fixed: "1.0.2" }]),
      createVuln("OSV-2", [{ introduced: "1.0.2" }, { fixed: "1.0.4" }]),
    ];

    const result = await resolveLowestKnownNonVulnerableVersion("tar", "1.0.0", vulnerabilities);

    expect(result.resolvedVersion).toBe("1.0.4");
    expect(result.note).toBeNull();
    expect(result.verified).toBe(true);
    expect(result.candidatesChecked).toBe(4);
    expect(result.candidatesKnownVulnerable).toBe(3);
    expect(result.candidatesUnknownCoverage).toBe(0);
  });

  it("handles overlapping advisory ranges by validating against all advisories", async () => {
    mockPackument(["6.2.1", "6.2.2", "6.2.3", "6.2.4", "6.2.5", "6.2.6"]);
    const vulnerabilities: OsvVuln[] = [
      createVuln("OSV-A", [{ introduced: "0" }, { fixed: "6.2.4" }]),
      createVuln("OSV-B", [{ introduced: "6.2.3" }, { fixed: "6.2.6" }]),
    ];

    const result = await resolveLowestKnownNonVulnerableVersion("tar", "6.2.1", vulnerabilities);

    expect(result.resolvedVersion).toBe("6.2.6");
    expect(result.note).toBeNull();
    expect(result.verified).toBe(true);
    expect(result.candidatesChecked).toBe(5);
    expect(result.candidatesKnownVulnerable).toBe(4);
    expect(result.candidatesUnknownCoverage).toBe(0);
  });

  it("returns null with an incomplete-data note when advisory ranges cannot be evaluated", async () => {
    mockPackument(["2.0.0", "2.0.1", "2.0.2"]);
    const vulnerabilities: OsvVuln[] = [
      {
        id: "OSV-INCOMPLETE",
        affected: [
          {
            package: {
              ecosystem: "npm",
              name: "tar",
            },
            ranges: [],
          },
        ],
      },
    ];

    const result = await resolveLowestKnownNonVulnerableVersion("tar", "2.0.0", vulnerabilities);

    expect(result.resolvedVersion).toBeNull();
    expect(result.note).toContain("incomplete");
    expect(result.verified).toBe(false);
    expect(result.candidatesChecked).toBe(2);
    expect(result.candidatesKnownVulnerable).toBe(0);
    expect(result.candidatesUnknownCoverage).toBe(2);
  });
});
