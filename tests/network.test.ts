import { isLikelyBlockedAdvisoryRequestError, isRateLimitError, isServerError, isSslCertificateError, extractErrorMessage } from "../src/utils/network.js";

describe("extractErrorMessage", () => {
  it("returns the message of a plain Error", () => {
    expect(extractErrorMessage(new Error("something went wrong"))).toBe("something went wrong");
  });

  it("walks the cause chain to surface nested SSL errors", () => {
    const cause = new Error("self signed certificate in certificate chain");
    const outer = new Error("fetch failed");
    (outer as any).cause = cause;
    expect(extractErrorMessage(outer)).toBe("fetch failed: self signed certificate in certificate chain");
  });

  it("returns String(error) for non-Error values", () => {
    expect(extractErrorMessage("raw string error")).toBe("raw string error");
  });
});

describe("isSslCertificateError", () => {
  it("returns true when error code is a known SSL code", () => {
    const err = Object.assign(new Error("fetch failed"), { code: "SELF_SIGNED_CERT_IN_CHAIN" });
    expect(isSslCertificateError(err)).toBe(true);
  });

  it("returns true when SSL code is on error.cause", () => {
    const cause = Object.assign(new Error("self-signed certificate in certificate chain"), { code: "SELF_SIGNED_CERT_IN_CHAIN" });
    const outer = Object.assign(new Error("fetch failed"), { cause });
    expect(isSslCertificateError(outer)).toBe(true);
  });

  it("returns true for all known SSL error codes", () => {
    for (const code of ["CERT_UNTRUSTED", "UNABLE_TO_VERIFY_LEAF_SIGNATURE", "DEPTH_ZERO_SELF_SIGNED_CERT", "CERT_HAS_EXPIRED", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY"]) {
      expect(isSslCertificateError(Object.assign(new Error("x"), { code }))).toBe(true);
    }
  });

  it("falls back to message matching when no code is present", () => {
    expect(isSslCertificateError(new Error("self signed certificate in certificate chain"))).toBe(true);
    expect(isSslCertificateError(new Error("self-signed certificate in certificate chain"))).toBe(true);
    expect(isSslCertificateError(new Error("certificate has expired"))).toBe(true);
    expect(isSslCertificateError(new Error("unable to verify the first certificate"))).toBe(true);
  });

  it("returns false for unrelated network errors", () => {
    expect(isSslCertificateError(Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" }))).toBe(false);
    expect(isSslCertificateError(new Error("fetch failed"))).toBe(false);
    expect(isSslCertificateError(new Error("403 Forbidden"))).toBe(false);
    expect(isSslCertificateError("not an error")).toBe(false);
  });
});

describe("isLikelyBlockedAdvisoryRequestError", () => {
  it("returns true for OSV failures that look like blocked or restricted network access", () => {
    expect(
      isLikelyBlockedAdvisoryRequestError(
        "OSV batch query failed for https://api.osv.dev: fetch failed",
      ),
    ).toBe(true);

    expect(
      isLikelyBlockedAdvisoryRequestError(
        "OSV batch query failed for https://api.osv.dev: OSV batch query failed: 403 Forbidden",
      ),
    ).toBe(true);
  });

  it("returns false for non-OSV errors", () => {
    expect(isLikelyBlockedAdvisoryRequestError("Invalid value for --osv-url: not-a-url")).toBe(false);
  });

  it("returns false for OSV errors that do not look like blocked network access", () => {
    expect(
      isLikelyBlockedAdvisoryRequestError(
        "OSV vuln fetch failed for OSV-404 via https://api.osv.dev: OSV vuln fetch failed for OSV-404: 404 Not Found",
      ),
    ).toBe(false);
  });

  it("returns false for OSV rate-limit and server responses", () => {
    for (const message of [
      "OSV batch query failed for https://api.osv.dev: OSV batch query failed: 429 Too Many Requests",
      "OSV batch query failed for https://api.osv.dev: OSV batch query failed: 503 Service Unavailable",
    ]) {
      expect(isLikelyBlockedAdvisoryRequestError(message)).toBe(false);
    }
  });
});

describe("isRateLimitError", () => {
  it("returns true for OSV 429 responses", () => {
    expect(
      isRateLimitError(
        "OSV batch query failed for https://api.osv.dev: OSV batch query failed: 429 Too Many Requests",
      ),
    ).toBe(true);
  });

  it("matches OSV errors case-insensitively", () => {
    expect(
      isRateLimitError(
        "osv batch query failed for https://api.osv.dev: osv batch query failed: 429 Too Many Requests",
      ),
    ).toBe(true);
  });

  it("returns false for non-OSV 429 responses", () => {
    expect(isRateLimitError("API failed: 429 Too Many Requests")).toBe(false);
  });
});

describe("isServerError", () => {
  it("returns true for OSV 5xx responses", () => {
    for (const message of [
      "OSV batch query failed for https://api.osv.dev: OSV batch query failed: 500 Internal Server Error",
      "OSV batch query failed for https://api.osv.dev: OSV batch query failed: 503 Service Unavailable",
    ]) {
      expect(isServerError(message)).toBe(true);
    }
  });

  it("returns false for OSV client errors", () => {
    expect(
      isServerError(
        "OSV vuln fetch failed for OSV-404 via https://api.osv.dev: OSV vuln fetch failed for OSV-404: 404 Not Found",
      ),
    ).toBe(false);
  });

  it("returns false for non-OSV 5xx responses", () => {
    expect(isServerError("API failed: 500 Internal Server Error")).toBe(false);
  });
});
