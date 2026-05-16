# WebTPS And MedHarness Integration

## Purpose

This document defines the operational contract between WebTPS workflows and the
pinned `medharness` CLI. Keep it in sync with `requirements.txt` and
`scripts/ci/check_medharness_contract.py` whenever the pin is bumped.

## Sources Of Truth

- DHF root: `DHF/`
- CR item YAML: `DHF/items/09_cr/CR-NNN.yaml` (implementation plan lives in `implementation_notes`)
- Code review output: `docs/reviews/CR-NNN-Code-Review.md` (written by `develop-cr` review step)
- MedHarness version pin: [medharness-setup action](../.github/actions/medharness-setup/action.yml)

## Current Contract — `medharness==0.6.3`

### CR Lifecycle Commands

| Command | Workflow | Expected form |
|---|---|---|
| `cr workflow intake-github-issue-ci` | `issue-to-cr.yml` | `medharness cr workflow intake-github-issue-ci --issue N ...` |
| `ci github-event` | `cr-lifecycle.yml` detect | `medharness ci github-event --stage-label-prefix "cr:stage/" ...` |
| `ci generate-dhf` | `issue-to-cr.yml`, `cr-lifecycle.yml` | `python -m medharness --dhf DHF ci generate-dhf --cr CR-NNN [--pr N]` |
| `ci develop-cr` | `cr-lifecycle.yml` | `python -m medharness --dhf DHF ci develop-cr --cr CR-NNN [--pr N]` |
| `ci approve-gate` | `cr-lifecycle.yml` gen-code | `medharness ci approve-gate --cr CR-NNN --stage design --pr N` |
| `ci advance-stage` | `cr-lifecycle.yml` gen-design, gen-code | `medharness ci advance-stage --pr N --from-stage STAGE --to-stage STAGE [--issue N]` |
| `ci cr-status` | `cr-lifecycle.yml` detect | `medharness --dhf DHF ci cr-status --cr CR-NNN [--pr N] [--branch REF]` |
| `cr workflow complete-from-github-pr` | `cr-complete.yml` | `medharness cr workflow complete-from-github-pr ...` |
| `dhf item transition` | `cr-lifecycle.yml` cancel | `medharness --dhf DHF dhf item transition CR-NNN cancelled --by "..." --commit --push` |

### CI Gate Commands

| Command | Workflow | Expected form |
|---|---|---|
| `ci dhf-validate` | `ci-pipeline.yml` | `medharness ci dhf-validate --dhf DHF ...` |
| `ci validate-branch` | `ci-pipeline.yml` | `medharness --dhf DHF ci validate-branch ...` |
| `ci validate-code` | `ci-pipeline.yml` | `medharness --dhf DHF ci validate-code ...` |
| `ci test-coverage` | `ci-pipeline.yml` compliance | `medharness ci test-coverage --dhf DHF --junit-dir ... --requirement-type SRS/SYS/CRS` |
| `ci evidence bundle` | `ci-pipeline.yml` generate-artifacts | `medharness --dhf DHF ci evidence bundle --out-dir ... --junit-dir ...` |

### DHF Helper Commands

| Command | Workflow | Expected form |
|---|---|---|
| `dhf report` | `ci-pipeline.yml` dhf-validation | `medharness --dhf DHF dhf report` |
| `dhf context implementation` | `issue-to-cr.yml` | `medharness --dhf DHF dhf context implementation --cr CR-NNN --out-dir /tmp/...` |

### Auto-post PR Comments (0.6.3)

`generate-dhf` and `develop-cr` automatically post PR comments when `--pr N` is
supplied:

- **Warnings comment** — posted if any warnings are present (e.g., GitHub
  feedback env vars missing).
- **Error comment** — posted if the outcome is `completed_with_errors`.

Both commands now exit non-zero on `completed_with_errors` as well as
`tool_error`, so workflows gate on exit code alone. The "Surface warnings" and
"Gate on outcome" workflow steps are no longer needed.

### Stage Label Management (0.6.3)

`ci advance-stage` replaces direct `gh api -X DELETE/POST` label management.
It atomically removes the from-stage label and adds the to-stage label on both
the PR and optionally a linked issue. Uses `--label-prefix cr:stage/` by default.

### Session Threading (0.6.2)

`generate-dhf` and `develop-cr` automatically manage Claude session IDs when
`--pr N` is supplied. The session ID is stored in a PR comment after each run
and resumed on the next run for the same PR — no explicit `ci claude-session
get/put` calls are needed in workflows. The `ci claude-session` commands remain
available for manual inspection or custom tooling.

### `--dhf` Global Flag

All commands that read DHF items require the global `--dhf DHF` flag before the
subcommand. Commands that operate only via GitHub API (`ci approve-gate`,
`ci github-event`) do not take `--dhf`.

## Removed Commands

These commands existed in earlier versions and must not appear in workflows:

| Removed | Replaced by |
|---|---|
| `ci validate-spec` | `ci generate-dhf` (0.4+) |
| `ci validate-design` | `ci generate-dhf` (0.4+) |
| `ci design-cr` | `ci generate-dhf` (0.5+) |
| `ci analyze-cr` | `ci generate-dhf` (0.5+) |
| `cr=gen-design` dispatch | `--dispatch-action design=gen-code` in `ci github-event` (0.5+) |

## Code Review Output

`develop-cr`'s soft review step instructs Claude to write its review to
`docs/reviews/CR-NNN-Code-Review.md`. The `gen-code` workflow step commits all
changes with `git add -A`, so the review file is included in the implementation
commit automatically. The `docs/reviews/` directory is tracked in git via
`.gitkeep` to ensure it exists before Claude runs.

## Operational Checklist For A MedHarness Bump

When updating the pinned `medharness` version:

1. Update `requirements.txt` and `.github/actions/medharness-setup/action.yml` — both must match or the `medharness-contract` CI job will fail.
2. Run `python scripts/ci/check_medharness_contract.py` locally — verifies help flag shapes and workflow invocation patterns.
3. Run `medharness --dhf DHF doctor` locally — verifies Claude CLI, gh CLI, DHF config, and adapter health.
4. Add any new commands adopted in this bump to the contract check's `help_commands` dict and add enforcement rules for commands used in workflows.
5. Open a PR — CI validates the contract automatically.
