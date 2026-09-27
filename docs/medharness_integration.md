# ContourLab And MedHarness Integration

## Purpose

This document records the MedHarness and DHFKit command surface that ContourLab
workflows depend on. Keep it aligned with `requirements.txt`, the workflow setup
actions, and `scripts/ci/check_medharness_contract.py`.

## Current Pin

- `medharness[docs]==0.39.0`
- `dhfkit` is consumed through the pinned MedHarness install

## Sources Of Truth

- DHF root: `DHF/`
- CR items: `DHF/items/09_cr/CR-NNN.yaml`
- DHF config: `DHF/config/global.yaml` holds only ContourLab's overrides; every
  other default (doc types, lifecycle, traceability rules, spec templates) comes
  from the installed package
- MedHarness setup action: [`.github/actions/medharness-setup/action.yml`](../.github/actions/medharness-setup/action.yml)
- contract guard: [`scripts/ci/check_medharness_contract.py`](../scripts/ci/check_medharness_contract.py)

## Workflow Surfaces

### Issue Intake And CR Lifecycle

- `dhfkit --dhf DHF item create --type CR --data ...` (`issue-to-cr.yml`)
- `medharness --dhf DHF build plan --cr CR-NNN [--pr N]` (design generation and revision)
- `medharness --dhf DHF build code --cr CR-NNN [--pr N]` (implementation and revision)
- `medharness workflow github-event ...` (event → CR, stage, action)
- `medharness workflow check-approval --cr CR-NNN --pr N` (review on the current head commit)
- `dhfkit --dhf DHF item get CR-NNN` (implementation plan for the PR comment)
- `dhfkit --dhf DHF item transition CR-NNN <state>` (cancel, complete)

### CI Gates

Every gate prints `{gate, passed, summary, errors, warnings}` to stdout and
exits 0 (pass), 1 (fail) or 2 (usage error).

- `medharness --dhf DHF verify dhf --fail-on-uncovered`
- `medharness --dhf DHF verify soup --manifest ...`
- `medharness --dhf DHF verify tests --junit-dir ...`
- `medharness --dhf DHF workflow check-changes --cr CR-NNN --since-ref origin/main --code-path ...`
- `medharness --dhf DHF verify completion --cr CR-NNN --junit-dir ...` (reads the CR's `affected_items`)

### Artifacts And Releases

- `medharness --dhf DHF build release --version ... --out-dir ...` — dry run on
  every main push (evidence bundle); with `--write` in `release-baseline.yml` to
  record a REL item
- `medharness --dhf DHF build dhf --manifest ... [--write]` — SOUP register sync

## Usage Notes

- `--dhf PATH` goes before the command on both CLIs and defaults to `DHF`.
- Items live in legacy directories (`09_cr/`, `01_req_crs/`, …). Reads find them by
  prefix and updates rewrite them in place; `item create` writes new items to the
  package's default directories (a new CR lands in `07_cr/`).
- Workflows that record a DHF change from `main` (complete, cancel, SOUP sync,
  release) push a `chore/*` branch and open a PR; `main` is protected.

## Update Checklist

When bumping MedHarness:

1. Update `requirements.txt` and `.github/actions/medharness-setup/action.yml`.
2. Run `python scripts/ci/check_medharness_contract.py`.
3. Run `medharness --dhf DHF doctor` and `medharness --dhf DHF verify dhf`.
4. Update this document only if the adopted command surface changed.
