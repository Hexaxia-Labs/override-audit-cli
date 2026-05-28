# Lessons learned

Per-session retrospectives from building `override-audit-cli`. Each file captures lessons specific to one session or phase of the project, plus any raw data we want to keep for future reference.

| Date | Phase | Doc |
|---|---|---|
| 2026-05-27 | Design + Plan 1 (Detection) | [`2026-05-27-design.md`](2026-05-27-design.md) |
| 2026-05-27 | Implementation (v0.1.0 to v0.3.0) | [`2026-05-27-build.md`](2026-05-27-build.md) |

The design doc captures patterns from the spec + brainstorming session: anchoring detectors to a real-world fleet example, mirroring parent-system contracts at the embed boundary, hard-scoping for shippability.

The build doc captures patterns from the implementation marathon: dogfood-driven rule discovery, severity-as-UX, doc-first as a forcing function, the raw before/after data for every release.

Future sessions add their own dated entries here.
