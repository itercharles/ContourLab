# ContourLab And MedHarness Integration

## Purpose

This document records the MedHarness and DHFKit command surface that ContourLab
workflows depend on. Keep it aligned with `requirements.txt`, the workflow setup
actions, and `scripts/ci/check_medharness_contract.py`.

## Current Pin

- `medharness[docs]==0.69.2`
- One CLI, `medharness`; `dhfkit` is a library inside it with no command of its own

## Sources Of Truth

- DHF root: `DHF/`
- CR items: `DHF/items/09_cr/CR-NNN.yaml` for the older CRs, `DHF/items/07_cr/CR-NNN.yaml` for new ones (`item create` uses the default directory); find one by ID, not by path
- DHF config: `DHF/config/global.yaml` holds only ContourLab's overrides; every
  other default (doc types, lifecycle, traceability rules, spec templates) comes
  from the installed package
- MedHarness setup action: [`.github/actions/medharness-setup/action.yml`](../.github/actions/medharness-setup/action.yml)
- contract guard: [`scripts/ci/check_medharness_contract.py`](../scripts/ci/check_medharness_contract.py)

## Agent Setup (Claude Code)

Set up as MedHarness's `docs/agents.md` describes, in the repository so everyone who clones it has it:

- **Skill:** `.claude/skills/medharness/SKILL.md` (MedHarness's, plus a section for this repository), run as
  `/medharness`. It sits beside ContourLab's own `cr-implement` and `cr-status`.
- **Hooks**, in `.claude/settings.json`, scripts in `.claude/hooks/` (they need `jq` and `medharness` on `PATH`):
  - `Stop` (`medharness-stop.sh`): when `DHF/` has uncommitted changes and `verify dhf` fails, the agent is not
    allowed to finish and is handed the findings.
  - `PreToolUse` on `Edit|Write` (`medharness-no-hand-edits.sh`): an edit of a file under `DHF/items/` is refused;
    `medharness item create|update` is the way.
- The Stop hook runs the project's own `medharness` when `.venv/bin/medharness` exists, else the one on `PATH`. Set
  it up once with `python3.11 -m venv .venv && .venv/bin/pip install -r requirements.txt` (the pinned version needs Python
  3.11 or later). An older `medharness` on `PATH` reads this DHF wrongly ("Unknown doc type 'UC'") and would hold the agent
  for a fault that is not in the DHF.
- These are local feedback, not a control: whoever owns the checkout can change them. The control is CI
  (`verify dhf`, `verify impact`, `verify changes`, `verify tests` and branch protection). The hooks also apply to
  the Claude Code that the CR pipeline runs in Actions, which is the point.
- Tests: `tests/workflow/test_agent_hooks.py` runs both hooks for real; `test_agent_docs.py` checks every
  `medharness` command written in `CLAUDE.md` and `.claude/` against the installed CLI.

## Workflow Surfaces

### Issue Intake And CR Lifecycle

- `medharness --dhf DHF item create --type CR --data ...` (`issue-to-cr.yml`)
- `medharness --dhf DHF build plan --cr CR-NNN [--pr N]` (design generation and revision); a triage rejection exits 1 with `outcome: rejected` and the reason in `errors` (0.67.0 or later)
- `medharness --dhf DHF build code --cr CR-NNN [--pr N]` (implementation and revision)
- `build plan` and `build code` neither read nor move a CR's status (0.64 or later; they only need `implementation_notes` on the CR for `build code`): the pipeline moves it with `item transition`
- `medharness --dhf DHF item transition CR-NNN completed` when the code is approved (`code-approved`), and `... develop` to reopen a completed CR when changes are requested after approval (`revise-code`; 0.62.0 or later; refused for a CR a release lists)
- Event routing (event → CR, stage, action) is plain shell in `cr-lifecycle.yml`'s `detect` job: the stage comes from the PR's `cr:stage/<stage>` label or the dispatch input
- Design approval → code stage: the `detect` job acts on an `approved` review only when its `commit_id` is the PR's current head; a stale approval is ignored. The server-side enforcement is branch protection on `main` (Require approvals; Dismiss stale approvals when new commits are pushed)
- Who can drive the stages: the `detect` job acts on a review only when its `author_association` is `OWNER` or `MEMBER`. Code generation and design revision run with the repository PAT and the model key, and a revision feeds the review text to the agent, so a review from an outside collaborator, a contributor or a stranger is ignored. The owner can always start a stage with `workflow_dispatch`
- `medharness --dhf DHF item get CR-NNN` (implementation plan for the PR comment)
- `medharness --dhf DHF item transition CR-NNN <state>` (cancel, complete)

### CI Gates

Every gate prints `{gate, passed, summary, errors, warnings}` to stdout and
exits 0 (pass), 1 (fail) or 2 (usage error).

- `medharness --dhf DHF verify dhf --strict`
- `medharness --dhf DHF verify soup --strict --manifest ...` (`--strict` also fails an undocumented or misversioned component; known vulnerabilities always fail)
- `medharness --dhf DHF verify tests --strict --junit DIR ...` (`--strict` also fails a requirement with no verification method and a test `@links:` to an ID that is not in the DHF)
- `medharness --dhf DHF verify changes --cr CR-NNN --since-ref origin/main --code-path ...` (compares the working tree, so it also runs locally before a commit)
- `medharness --dhf DHF verify impact --cr CR-NNN --since-ref origin/main` (0.69.0; the CR's whole impact record, and whether what depends on a changed item was changed or reviewed; `verify changes` no longer checks the latter)
- `medharness --dhf DHF verify completion --cr CR-NNN --junit DIR ...` (reads the CR's `affected_items`)

### Artifacts And Releases

- `medharness --dhf DHF build release --version ... --out-dir ...` — dry run on
  every main push (evidence bundle); with `--write` in `release-baseline.yml` to
  record a REL item
  `build release` requires `--junit` and judges every requirement against it, as `verify tests --strict` does, whether or not a CR in the release touched it. `ci-pipeline.yml` passes the JUnit of the run it is in; `release-baseline.yml` downloads the JUnit artifacts of the successful CI run for the commit being released and fails if there is none.
- `medharness --dhf DHF build soup --manifest ...` — SOUP register sync (always writes the working tree).
  Run by hand after a dependency change; CI only checks the register (`verify soup --strict`) and reports,
  it does not change it.
  Pass `pnpm-lock.yaml`, not `package.json`: a `package.json` records the version-range floor
  (`^1.2.0` becomes `1.2.0`), not the installed version, so the vulnerability scan checks the wrong release.

## Usage Notes

- `--junit PATH` takes a file or a directory; a path that does not exist is a
  usage error (exit 2), so workflows `mkdir -p` the result directories first.

- `--dhf PATH` goes before the command and defaults to `DHF`.
- `build code` treats the whole repository except `DHF/` as code unless `MEDHARNESS_CODE_PATHS` narrows it; ContourLab's jobs set `apps/,packages/`.
- Items live in legacy directories (`09_cr/`, `01_req_crs/`, …). Reads find them by
  prefix and updates rewrite them in place; from 0.61.1 `item create` writes a new
  item beside the existing items of its type (a new CR lands in `09_cr/`). Before
  that it used the package's default directories, so new items had to be moved by hand.
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
