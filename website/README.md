# CVE Lite CLI Website

This directory contains the Docusaurus-powered public documentation site for CVE Lite CLI.

The CLI package remains at the repository root. Website dependencies are isolated here so they do not become runtime dependencies of the scanner.

## Local Development

```bash
npm install
npm start
```

## Build

```bash
npm run build
```

The generated static site is written to `website/build/`, which is ignored by git.

## Deployment

The GitHub Pages workflow in `.github/workflows/docs-site.yml` builds this site on pushes to `main` that touch `website/**` or the workflow file.

## Content

Public guide pages live in `website/docs/`. The Markdown files under the repository-level `docs/` directory remain available for GitHub readers and can be copied into this site when they need first-class navigation.
