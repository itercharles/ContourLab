# WebTPS And MedHarness Integration

## Purpose

This document defines the operational contract between WebTPS workflows and the
pinned `medharness` CLI. The goal is to keep CR automation stable when either
workflow logic or the `medharness` package changes.

## Sources Of Truth

- Human-reviewed CR plan: `docs/cr-specs/CR-NNN-Spec.md`
- Machine-readable CR metadata: `docs/cr-specs/CR-NNN-Spec.json`
- DHF root in this repository: `DHF/`
- MedHarness version pin: [medharness-setup action](../.github/actions/medharness-setup/action.yml)

## Contract

### Spec Inputs

- `Spec.md` is the reviewed document.
- `Spec.json` is the machine-readable companion emitted by `medharness`.
- WebTPS CR lifecycle routing uses `Spec.json`.
- Missing `Spec.json` is a CI failure, not a reason to silently default a route.
- WebTPS locally treats `affected_items: []` plus `proposed_new_items: []` as a
  code-only signal and may skip DHF design generation even when
  `pipeline_route` is still `standard`.

### MedHarness CLI Usage

The current `medharness==0.3.7` contract in this repo is:

| Command | Expected form |
| --- | --- |
| `validate-spec` | `python -m medharness ci validate-spec --cr <CR> --spec <PATH> --dhf DHF` |
| `validate-design` | `python -m medharness --dhf DHF ci validate-design --cr <CR> --spec <PATH>` |
| `validate-code` | `medharness --dhf DHF ci validate-code --cr <CR> --spec <PATH>` |
| `validate-branch` | `medharness --dhf DHF ci validate-branch --cr <CR> [--code-path ...]` |
| `dhf-validate` | `medharness ci dhf-validate --dhf DHF ...` |
| `test-coverage` | `medharness ci test-coverage --dhf DHF ...` |

The important rule is that `validate-design`, `validate-code`, and
`validate-branch` must receive the DHF path through the global `--dhf` option.
Do not pass `--dhf` as a subcommand-local option for those commands.

## CR-011 Failures Fixed

The following workflow defects were fixed during CR-011:

- `cr-lifecycle.yml` no longer passes the obsolete local `--dhf` flag to
  `validate-design`.
- `cr-lifecycle.yml` now fails hard when `CR-NNN-Spec.json` is missing.
- `ci-pipeline.yml` restores `contents: read` for `CR Branch Validation`.
- `ci-pipeline.yml` now calls `validate-branch` with global `--dhf`.
- `ci-pipeline.yml` now calls `validate-code` with global `--dhf`.
- CR-011 spec/test annotation text was normalized so deterministic
  `@links:` matching succeeds.

## Improvement Plan

### WebTPS

- Add a lightweight contract smoke check to CI for the pinned `medharness`
  version and the workflow invocation forms used in this repo.
- Reduce duplicated bash routing logic where possible and prefer one
  machine-readable source per decision.
- Keep the local "code-only / no DHF impact" bypass aligned with the
  `Spec.json` contract and warn when upstream routing disagrees.
- Keep workflow permissions minimal, but do not override job permissions in a
  way that drops `contents: read` for checkout.

### MedHarness

- Make CI subcommands consistent about DHF path handling.
- Normalize spec paths internally before relative-path operations.
- Make `test_plan.needs_new_tc` matching less brittle than literal prose plus
  punctuation.
- Improve route generation for code-only CRs where no DHF design updates are
  required.
- Add integration tests for the exact CLI forms used by downstream repos.

## Operational Checklist For A MedHarness Bump

When updating the pinned `medharness` version:

1. Run the MedHarness contract smoke check in CI.
2. Verify the CLI help output for `validate-spec`, `validate-design`,
   `validate-code`, and `validate-branch`.
3. Verify one committed spec passes `validate-spec`.
4. If CR lifecycle routing changed, verify `validate-design` directly against a
   known spec in a targeted workflow or local check.
5. Verify workflow files still use the approved invocation forms in this
   document.
