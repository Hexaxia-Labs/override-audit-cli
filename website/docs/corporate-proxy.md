---
sidebar_label: Corporate SSL Proxy
---

# Corporate SSL Proxy

Many enterprise networks route outbound HTTPS traffic through a corporate proxy that performs SSL inspection. The proxy presents its own certificate instead of the destination's certificate, and Node.js will reject the connection unless it trusts the proxy's CA certificate.

CVE Lite CLI makes HTTPS calls to the OSV API (`api.osv.dev`) when fetching advisory data. If your network uses SSL inspection, those calls will fail with a certificate error until you provide your corporate CA certificate.

---

## Symptoms

If the OSV API is reachable in a browser but `cve-lite` fails with an error like any of the following, you are likely behind an SSL inspection proxy:

```
self signed certificate in chain
SELF_SIGNED_CERT_IN_CHAIN
unable to verify the first certificate
CERT_UNTRUSTED
certificate has expired
```

---

## One-time setup (recommended)

Save the certificate path once and every future scan will use it automatically:

```bash
cve-lite config set ca-cert /path/to/corporate-ca.crt
```

CVE Lite CLI stores the path in `~/.cve-lite-cli/config.json`. You do not need to pass `--ca-cert` on every invocation after this.

To confirm the saved value:

```bash
cve-lite config show
```

To remove it:

```bash
cve-lite config unset ca-cert
```

---

## Per-invocation (flag override)

If you only need the cert for a single scan, pass it directly:

```bash
cve-lite . --ca-cert /path/to/corporate-ca.crt
```

The `--ca-cert` flag takes precedence over any saved config value for that run.

---

## Getting your corporate CA certificate

Your IT or security team can provide the CA certificate. A few common ways to export it:

**From the system keychain (macOS):**
1. Open Keychain Access.
2. Find the root CA your proxy uses (usually named after your company or the proxy vendor).
3. Right-click and choose Export. Save as `.pem` or `.crt`.

**From a browser (Chrome/Firefox):**
1. Navigate to any HTTPS site.
2. Click the padlock icon and view the certificate chain.
3. Export the root CA certificate as PEM.

**From an existing `.pfx` / `.p12` bundle (OpenSSL):**
```bash
openssl pkcs12 -in corporate.pfx -nokeys -cacerts -out corporate-ca.pem
```

The certificate file must be in PEM format - a plain text file starting with `-----BEGIN CERTIFICATE-----`.

---

## Advisory sync over a proxy

The same certificate applies when syncing the offline advisory DB:

```bash
cve-lite advisories sync
```

If you have set `ca-cert` in the config, advisory sync picks it up automatically. For air-gapped environments, sync on a machine with OSV access and transfer the resulting `.db` file, then scan offline:

```bash
# On a machine with OSV access
cve-lite advisories sync --output /path/to/advisories.db

# On the restricted machine
cve-lite . --offline-db /path/to/advisories.db
```

See [Offline Advisory DB](./offline-advisory-db.md) for the full offline workflow.
