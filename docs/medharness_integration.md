# ContourLab And MedHarness Integration

## Purpose

This document records the MedHarness and DHFKit command surface that ContourLab
workflows depend on. Keep it aligned with `requirements.txt`, the workflow setup
actions, and `scripts/ci/check_medharness_contract.py`.

## Current Pin

- `medharness[full]==0.8.0`
- `dhfkit` is consumed through the pinned MedHarness install

## Sources Of Truth

- DHF root: `DHF/`
- CR items: `DHF/items/09_cr/CR-NNN.yaml`
- generated reviews: `docs/reviews/CR-NNN-Code-Review.md`
- MedHarness setup action: [`.github/actions/medharness-setup/action.yml`](../.github/actions/medharness-setup/action.yml)
- contract guard: [`scripts/ci/check_medharness_contract.py`](../scripts/ci/check_medharness_contract.py)

## Workflow Surfaces

### Issue Intake And CR Lifecycle

- `medharness cr workflow intake-github-issue-ci`
- `python -m medharness --dhf DHF ci generate-dhf`
- `python -m medharness --dhf DHF ci develop-cr`
- `python -m medharness ci github-event`
- `python -m medharness ci approve-gate`
- `python -m medharness ci advance-stage`
- `python -m medharness --dhf DHF ci cr-status`
- `medharness cr workflow complete-from-github-pr`
- `medharness --dhf DHF dhf item transition CR-NNN ...`

### CI Gates

- `medharness ci dhf-validate --dhf DHF ...`
- `medharness --dhf DHF ci validate-branch ...`
- `medharness --dhf DHF ci validate-code ...`
- `medharness ci test-coverage --dhf DHF --junit-dir ...`
- `medharness --dhf DHF ci evidence bundle --out-dir ...`

### DHF Helpers

- `medharness --dhf DHF dhf context implementation ...`
- `dhfkit --dhf DHF dhf report`

`dhf report` moved out of `medharness` and now comes from `dhfkit`. The CI
contract checker already enforces that split.

## Usage Notes

- Commands that read DHF items require the global `--dhf DHF` flag before the
  subcommand.
- `generate-dhf` and `develop-cr` automatically manage Claude session threading
  when `--pr N` is supplied.
- `docs/reviews/` is intentionally tracked so generated review markdown can be
  committed by workflow runs.

## Update Checklist

When bumping MedHarness:

1. Update `requirements.txt` and `.github/actions/medharness-setup/action.yml`.
2. Run `python scripts/ci/check_medharness_contract.py`.
3. Run `medharness --dhf DHF doctor`.
4. Update this document only if the adopted command surface changed.
