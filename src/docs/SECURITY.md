# Security Policy

For the project's threat model, trust boundaries, and how common implementation weaknesses are countered, see the [Security Assurance Case](https://owasp.org/cve-lite-cli/docs/security-assurance-case).

## Supported versions

CVE Lite CLI is an actively developing project. Security fixes will generally be applied to the latest released version.

## Reporting a vulnerability

If you believe you have found a security issue in CVE Lite CLI itself, please report it responsibly.

Please include:

- a clear description of the issue
- affected version or commit
- steps to reproduce
- possible impact
- any suggested mitigation

Please avoid opening a public GitHub issue for undisclosed security problems in the tool itself.

Until a dedicated security contact is added, please use the repository contact path or open a private security advisory through GitHub if available.

## Scope

This policy covers security issues in CVE Lite CLI itself.

It does not cover:

- vulnerabilities found in third-party projects scanned by CVE Lite CLI
- public advisory data from OSV
- general package vulnerabilities that are already publicly disclosed elsewhere

## Disclosure approach

The goal is to investigate reports promptly, confirm impact, prepare a fix where appropriate, and disclose responsibly once users have a path to update.

## Verifying releases

CVE Lite CLI signs both the source code release (the git tag) and the build artifact (the release tarball). Either signature is sufficient on its own; the project provides both because the OpenSSF Best Practices guidance treats source releases and generated deliverables as separately signable.

### Source code (signed git tags)

Starting with releases after v1.12.1, every release tag is a GPG-signed annotated tag. The project lead's GPG public key is published on GitHub and can be fetched from:

```
https://github.com/sonukapoor.gpg
```

Public key fingerprint:

```
17B6 4876 B931 03E3 7E86  DA5D 3306 B2C5 600C A6DB
```

To verify a tag locally:

```bash
# Import the project lead's public key (one-time)
curl -sSL https://github.com/sonukapoor.gpg | gpg --import

# Clone the repo and verify a tag
git clone https://github.com/OWASP/cve-lite-cli.git
cd cve-lite-cli
git tag -v vX.Y.Z
```

A successful verification prints `Good signature from "Sonu Kapoor <sonukapoor@gmail.com>"`.

The private key is held only on the project lead's local machine — not on GitHub, not on the npm registry, not in CI. This satisfies the OpenSSF requirement that the private signing key not live on a site that distributes the software.

### Release tarballs (Sigstore Artifact Attestations)

Each GitHub release attaches an `cve-lite-cli-X.Y.Z.tgz` asset that has been signed at build time using GitHub's Sigstore-backed Artifact Attestations. The signing keys are ephemeral OIDC-issued keys generated per build, so no long-lived private signing key exists on either GitHub or the npm registry.

To verify a downloaded tarball:

```bash
gh attestation verify cve-lite-cli-X.Y.Z.tgz --repo OWASP/cve-lite-cli
```

A successful verification confirms the artifact was produced by the project's release workflow at the corresponding tag, providing SLSA Level 2 equivalent build provenance.

### npm-installed package

The npm registry adds an ECDSA signature to every published package. To verify your installed copy:

```bash
npm audit signatures
```

Note that the npm registry signature is independent of the project's own signing keys above — it confirms the package was distributed by the npm registry, not that it was produced by the CVE Lite CLI maintainers.
