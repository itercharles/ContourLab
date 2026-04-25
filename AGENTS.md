# AGENTS.md

This file is the Codex-specific entrypoint for this repository.

Shared repository guidance lives in:
- [`WebTPS-DHF/DHF/documents/specs/architecture_specification.md.j2`](../WebTPS-DHF/DHF/documents/specs/architecture_specification.md.j2)
- [`WebTPS-DHF/DHF/documents/specs/crs_specification.md.j2`](../WebTPS-DHF/DHF/documents/specs/crs_specification.md.j2)
- [`WebTPS-DHF/DHF/documents/plans/development_plan.md`](../WebTPS-DHF/DHF/documents/plans/development_plan.md)
- [`../WebTPS-DHF/docs/cr_spec_workflow.md`](../WebTPS-DHF/docs/cr_spec_workflow.md)
- [`CLAUDE.md`](CLAUDE.md)

Read those first.

## Codex-Specific Notes

Before implementing any request:
- check the request against architecture, product, and technical strategy documents
- determine whether DHF updates are required
- if DHF changes are expected, list the candidate DHF files before
  implementation

After implementing any request:
- state which validation commands were actually run
- state which DHF files changed, or why DHF was not updated
- for functional changes, work on a dedicated branch and use a PR before merge
- ensure the PR summarizes the change, lists DHF updates, lists automated
  validation run, and lists remaining manual test steps
- after creating a PR, continue monitoring comments and CI, triage each comment,
  take action when needed, and reply on the PR

When updating agent guidance:
- put shared repository guidance in [`CLAUDE.md`](CLAUDE.md) or
  [`../WebTPS-DHF/docs/cr_spec_workflow.md`](../WebTPS-DHF/docs/cr_spec_workflow.md)
- add content here only if it is genuinely Codex-specific
