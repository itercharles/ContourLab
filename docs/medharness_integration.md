# ContourLab And MedHarness Integration

## Purpose

This document records the MedHarness and DHFKit command surface that ContourLab
workflows depend on. Keep it aligned with `requirements.txt`, the workflow setup
actions, and `scripts/ci/check_medharness_contract.py`.

## Current Pin

- `medharness[docs]==0.49.1`
- One CLI, `medharness`; `dhfkit` is a library inside it with no command of its own

## Sources Of Truth

- DHF root: `DHF/`
- CR items: `DHF/items/09_cr/CR-NNN.yaml` for the older CRs, `DHF/items/07_cr/CR-NNN.yaml` for new ones (`item create` uses the default directory); find one by ID, not by path
- DHF config: `DHF/config/global.yaml` holds only ContourLab's overrides; every
  other default (doc types, lifecycle, traceability rules, spec templates) comes
  from the installed package
- MedHarness setup action: [`.github/actions/medharness-setup/action.yml`](../.github/actions/medharness-setup/action.yml)
- contract guard: [`scripts/ci/check_medharness_contract.py`](../scripts/ci/check_medharness_contract.py)

## Workflow Surfaces

### Issue Intake And CR Lifecycle

- `medharness --dhf DHF item create --type CR --data ...` (`issue-to-cr.yml`)
- `medharness --dhf DHF build plan --cr CR-NNN [--pr N]` (design generation and revision)
- `medharness --dhf DHF build code --cr CR-NNN [--pr N]` (implementation and revision)
- Event routing (event → CR, stage, action) is plain shell in `cr-lifecycle.yml`'s `detect` job: the stage comes from the PR's `cr:stage/<stage>` label or the dispatch input
- Design approval → code stage: the `detect` job acts on an `approved` review only when its `commit_id` is the PR's current head; a stale approval is ignored. The server-side enforcement is branch protection on `main` (Require approvals; Dismiss stale approvals when new commits are pushed)
- `medharness --dhf DHF item get CR-NNN` (implementation plan for the PR comment)
- `medharness --dhf DHF item transition CR-NNN <state>` (cancel, complete)

### CI Gates

Every gate prints `{gate, passed, summary, errors, warnings}` to stdout and
exits 0 (pass), 1 (fail) or 2 (usage error).

- `medharness --dhf DHF verify dhf --strict`
- `medharness --dhf DHF verify soup --manifest ...`
- `medharness --dhf DHF verify tests --junit DIR ...`
- `medharness --dhf DHF verify changes --cr CR-NNN --since-ref origin/main --code-path ...` (compares the working tree, so it also runs locally before a commit)
- `medharness --dhf DHF verify completion --cr CR-NNN --junit DIR ...` (reads the CR's `affected_items`)

### Artifacts And Releases

- `medharness --dhf DHF build release --version ... --out-dir ...` — dry run on
  every main push (evidence bundle); with `--write` in `release-baseline.yml` to
  record a REL item
- `medharness --dhf DHF build soup --manifest ...` — SOUP register sync (always writes the working tree)

## Usage Notes

- `--junit PATH` takes a file or a directory; a path that does not exist is a
  usage error (exit 2), so workflows `mkdir -p` the result directories first.

- `--dhf PATH` goes before the command and defaults to `DHF`.
- `build code` treats the whole repository except `DHF/` as code unless `MEDHARNESS_CODE_PATHS` narrows it; ContourLab's jobs set `apps/,packages/`.
- Items live in legacy directories (`09_cr/`, `01_req_crs/`, …). Reads find them by
  prefix and updates rewrite them in place; `item create` writes new items to the
  package's default directories (a new CR lands in `07_cr/`).
- Workflows that record a DHF change from `main` (complete, cancel, SOUP sync,
  release) push a `chore/*` branch and open a PR; `main` is protected.
- Who opens a PR decides who can review it. The `chore/*` PRs above are opened with
  `ACTIONS_PAT` (the maintainer's account), so CI runs on them and the maintainer
  merges them with a review bypass. The CR design PR that intake opens is opened with
  the workflow token, so the bot is its author: GitHub bars an author from approving or
  requesting changes on their own PR, and those two reviews are the design and code gates.

## Tests

`tests/workflow/` runs in the `MedHarness Contract` job and locally with `pnpm workflow:test`.
No model and no GitHub: the `detect` routing, a CR's lifecycle and `verify changes` on a
scratch copy of the DHF, and gen-code's commit step against a local git remote with a stub
`gh`. The real AI stages (`build plan|code` with a model) are not covered.

## Update Checklist

When bumping MedHarness:

1. Update `requirements.txt` and `.github/actions/medharness-setup/action.yml`.
2. Run `python scripts/ci/check_medharness_contract.py`.
3. Run `medharness --dhf DHF verify dhf`.
4. Run `pnpm workflow:test`.
5. Update this document only if the adopted command surface changed.
