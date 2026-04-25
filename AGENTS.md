# AGENTS.md

This file is the Codex-specific entrypoint for this repository.

Shared repository guidance lives in:
- [`docs/agent_environment.md`](docs/agent_environment.md)
- [`docs/agent_workflow.md`](docs/agent_workflow.md)
- [`WebTPS-DHF/DHF/documents/specs/architecture_specification.md.j2`](../WebTPS-DHF/DHF/documents/specs/architecture_specification.md.j2)
- [`docs/strategy/product_strategy.md`](docs/strategy/product_strategy.md)
- [`docs/strategy/product_roadmap.md`](docs/strategy/product_roadmap.md)
- [`docs/strategy/technical_strategy.md`](docs/strategy/technical_strategy.md)
- [`docs/strategy/testing_strategy.md`](docs/strategy/testing_strategy.md)
- [`AI-harness/pre-analyze.md`](AI-harness/pre-analyze.md)
- [`AI-harness/post-implement.md`](AI-harness/post-implement.md)

Read those first.

## Codex-Specific Notes

Before implementing any request:
- review `AI-harness/pre-analyze.md`
- check the request against architecture, product, and technical strategy documents
- determine whether DHF updates are required
- if DHF changes are expected, list the candidate DHF files before
  implementation

After implementing any request:
- review `AI-harness/post-implement.md`
- state which validation commands were actually run
- state which DHF files changed, or why DHF was not updated
- for functional changes, work on a dedicated branch and use a PR before merge
- ensure the PR summarizes the change, lists DHF updates, lists automated
  validation run, and lists remaining manual test steps
- after creating a PR, continue monitoring comments and CI, triage each comment,
  take action when needed, and reply on the PR

When updating agent guidance:
- put shared repository guidance in [`docs/agent_environment.md`](docs/agent_environment.md) or [`docs/agent_workflow.md`](docs/agent_workflow.md)
- add content here only if it is genuinely Codex-specific
