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
- WebTPS resolves that policy through `scripts/ci/resolve_cr_design_route.py`
  rather than duplicating the decision tree inline in workflow bash.

### MedHarness CLI Usage

The current `medharness==0.3.8` contract in this repo is:

| Command | Expected form |
| --- | --- |
| `validate-spec` | `python -m medharness ci validate-spec --cr <CR> --spec <PATH> --dhf DHF` |
| `validate-design` | `python -m medharness --dhf DHF ci validate-design --cr <CR> --spec <PATH>` |
| `validate-code` | `medharness --dhf DHF ci validate-code --cr <CR> --spec <PATH>` |
| `validate-branch` | `medharness --dhf DHF ci validate-branch --cr <CR> [--code-path ...]` |
| `dhf-validate` | `medharness ci dhf-validate --dhf DHF ...` |
| `test-coverage` | `medharness ci test-coverage --dhf DHF ...` |

`validate-design`, `validate-code`, and `validate-branch` receive the DHF path
through the global `--dhf` option. Do not pass `--dhf` as a subcommand-local
option for those commands.

## Operational Checklist For A MedHarness Bump

When updating the pinned `medharness` version:

1. Update the version in `requirements.txt` and `.github/actions/medharness-setup/action.yml` — both must match or `check_medharness_contract.py` will fail.
2. Run `python scripts/ci/check_medharness_contract.py` locally.
3. Open a PR — the `medharness-contract` CI job verifies CLI help flag shapes, spec validation, and workflow invocation patterns automatically.
