# Contributing

## Branching

- Start from the latest `main`.
- Use a descriptive branch name such as `feat/...`, `fix/...`, or `chore/...`.
- Do not commit directly to `main`.

## Pull Requests

- Keep the PR title scoped to the change.
- Explain user-facing behavior changes and any DHF impact in the PR body.
- If the change touches workflows, docs, or DHF contracts, call that out
  explicitly so reviewers know where to focus.

## Local Validation

Run the narrowest checks that cover your change before opening a PR.

Typical commands:

```bash
pnpm --filter @contourlab/client lint
pnpm -r test
pnpm -r typecheck
dotnet test apps/api.tests/ContourLab.Api.Tests.csproj
pnpm local:doctor
```

## DHF And MedHarness

This repository keeps design-control artifacts in `DHF/` and uses MedHarness for
traceability and CR workflow automation. Not every change requires DHF edits,
but changes that introduce new behavior, risks, dependencies, or workflow
contracts usually do.

If you are unsure whether a change needs DHF updates, mention it in the PR and a
maintainer can scope it.
