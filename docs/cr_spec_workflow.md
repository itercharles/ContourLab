# CR Workflow

## Purpose

This document defines the CR-driven workflow for ContourLab. All DHF content —
CR items, requirements, risks, specs — lives in this repository under `DHF/`
and `docs/cr-specs/`.

## Sources of Truth

- `DHF/items/` — CR lifecycle, requirement/risk/design items
- `docs/cr-specs/` — CR specification documents
- `.github/workflows/issue-to-cr.yml` — CR intake from GitHub issues
- `.github/workflows/cr-lifecycle.yml` — design review and implementation stages
- `.github/workflows/cr-complete.yml` — CR completion on PR merge

## PR Topology

One `feat/CR-NNN` Draft PR carries both stages. Branch and PR are opened at
intake (with design already generated) and stay open until the implementation
is approved and merged.

```
feat/CR-NNN  ──commit: CR + design──▶  commit: implementation ──▶  merge
                   (intake)                  (gen-code)
                       │                          │
                  cr:stage/design            cr:stage/code
```

Stage position is tracked by a `cr:stage/*` label on the PR:

| Label | Stage |
|-------|-------|
| `cr:stage/design` | AI-generated DHF design awaiting review |
| `cr:stage/code` | AI-generated implementation awaiting code review |

## Stage Flow

### Intake

- Trigger: GitHub issue milestone set (issue owner only)
- Workflow: `issue-to-cr.yml`
- Steps:
  1. CR YAML created in `DHF/items/09_cr/`; pushed to `feat/CR-NNN` branch
  2. Draft PR opened with `cr:stage/design` label
  3. DHF design items generated immediately (no separate design-review step to wait for)
  4. Design committed; design summary and implementation plan posted as PR comments
- If design generation fails: re-trigger via workflow_dispatch (stage: `design`)

### Stage 1 — Design Review → Implementation

- Trigger: reviewer **approves** PR at `cr:stage/design`
- Workflow: `cr-lifecycle.yml` (`gen-code` job)
- Steps:
  1. `develop-cr` generates implementation code
  2. Implementation committed; label rotated to `cr:stage/code`; PR converted to ready
  3. CI pipeline watched — if it fails, a comment is posted and the job exits non-zero
- If `changes_requested`: `revise-design` re-runs `generate-dhf` and pushes; re-approve to continue

### Stage 2 — Code Review → Merge

- Trigger: reviewer **approves** PR at `cr:stage/code`
- Workflow: `cr-lifecycle.yml` (`code-approved` job)
- Output: "All stages complete — ready to merge" comment posted; human merges the PR
- If `changes_requested`: `revise-code` re-runs `develop-cr` and pushes; re-approve to continue

### Post-Merge

- Workflow: `cr-complete.yml`
- Steps:
  1. CR transitioned to `completed` in `DHF/items/09_cr/`
  2. Closure gate checks DHF traceability completeness and test evidence
  3. CI pipeline triggered on main (squash merges can inherit `[skip ci]` from lifecycle commits)

### Cancel

- Trigger: PR closed without merging (any stage)
- Workflow: `cr-lifecycle.yml`
- Output: CR YAML checked out from main, transitioned to `cancelled`, committed and pushed

## State Model

| State | Meaning |
|-------|---------|
| `draft` | CR created, not yet submitted |
| `in_review` | Draft PR open, design/code under review |
| `completed` | Implementation merged; DHF closed out |
| `cancelled` | PR closed without merging |

Normal flow: `draft → in_review → completed`

## Manual Re-run

If a stage gets stuck (Claude timeout, runner failure), re-trigger via:

**Actions → cr-lifecycle → Run workflow**

Inputs:
- `cr_id`: e.g. `CR-034`
- `stage`:
  - `design` — re-runs implementation generation (`gen-code`)
  - `code` — marks code as approved

## Runtime Prerequisites

Workflows use `GITHUB_TOKEN` for read operations and `ACTIONS_PAT` (a PAT with
`contents:write` and `pull-requests:write`) for commits that need to trigger
downstream CI.

Repository variables:
- `CR_DESIGN_MODEL` — Claude model for DHF design generation
- `CR_DEVELOP_MODEL` — Claude model for implementation

Secrets:
- `ANTHROPIC_API_KEY`
- `ACTIONS_PAT`
