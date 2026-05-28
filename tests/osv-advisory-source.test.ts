import { jest } from "@jest/globals";
import type { PackageRef } from "../src/types.js";
import { OsvAdvisorySource } from "../src/advisory/osv-advisory-source.js";

const fetchMock = jest.fn();
global.fetch = fetchMock as unknown as typeof fetch;

function createPackages(): PackageRef[] {
  return [
    {
      name: "lodash",
      version: "4.17.20",
      ecosystem: "npm",
    },
    {
      name: "@scope/pkg",
      version: "1.2.3",
      ecosystem: "npm",
    },
  ];
}

describe("OsvAdvisorySource", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("queries the OSV batch endpoint with the expected request body and maps results", async () => {
    const packages = createPackages();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { vulns: [{ id: "OSV-123" }] },
          {},
        ],
      }),
    });

    const source = new OsvAdvisorySource("https://example.test");
    const results = await source.queryBatch(packages);

    expect(fetchMock).toHaveBeenCalledWith("https://example.test/v1/querybatch", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        queries: [
          {
            package: { ecosystem: "npm", name: "lodash" },
            version: "4.17.20",
          },
          {
            package: { ecosystem: "npm", name: "@scope/pkg" },
            version: "1.2.3",
          },
        ],
      }),
    });

    expect(results).toEqual([
      {
        package: "lodash",
        version: "4.17.20",
        vulnerabilities: [{ id: "OSV-123" }],
      },
      {
        package: "@scope/pkg",
        version: "1.2.3",
        vulnerabilities: [],
      },
    ]);
  });

  it("wraps non-ok batch responses with the configured base URL", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      statusText: "Bad Gateway",
    });

    const source = new OsvAdvisorySource("https://mirror.test");

    await expect(source.queryBatch(createPackages())).rejects.toThrow(
      "OSV batch query failed for https://mirror.test: OSV batch query failed: 502 Bad Gateway",
    );
  });

  it("wraps thrown batch fetch errors", async () => {
    fetchMock.mockRejectedValue(new Error("socket hang up"));

    const source = new OsvAdvisorySource("https://mirror.test");

    await expect(source.queryBatch(createPackages())).rejects.toThrow(
      "OSV batch query failed for https://mirror.test: socket hang up",
    );
  });

  it("fetches a single vulnerability by encoded id", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "GHSA-abcd/1234",
        aliases: ["CVE-2026-0001"],
      }),
    });

    const source = new OsvAdvisorySource("https://example.test");
    const vuln = await source.getVuln("GHSA-abcd/1234");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/v1/vulns/GHSA-abcd%2F1234",
    );
    expect(vuln).toMatchObject({
      id: "GHSA-abcd/1234",
      aliases: ["CVE-2026-0001"],
    });
  });

  it("wraps non-ok vulnerability fetch responses", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    const source = new OsvAdvisorySource("https://example.test");

    await expect(source.getVuln("OSV-404")).rejects.toThrow(
      "OSV vuln fetch failed for OSV-404 via https://example.test: OSV vuln fetch failed for OSV-404: 404 Not Found",
    );
  });

  it("wraps thrown vulnerability fetch errors", async () => {
    fetchMock.mockRejectedValue(new Error("network unavailable"));

    const source = new OsvAdvisorySource("https://example.test");

    await expect(source.getVuln("OSV-500")).rejects.toThrow(
      "OSV vuln fetch failed for OSV-500 via https://example.test: network unavailable",
    );
  });
});
