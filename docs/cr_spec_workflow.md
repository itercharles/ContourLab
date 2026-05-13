# CR And Spec Workflow

## Purpose

This document defines the CR-driven workflow for WebTPS. All DHF content —
CR items, requirements, risks, specs — lives in this repository under `DHF/`
and `docs/cr-specs/`.

## Sources of Truth

- `DHF/items/` — CR lifecycle, requirement/risk/design items
- `docs/cr-specs/` — CR specification documents (authoritative plan specs)
- `.github/workflows/cr-lifecycle.yml` — single workflow driving all CR stages
- `.github/workflows/issue-to-cr.yml` — CR intake from GitHub issues
- `.github/workflows/cr-complete.yml` — CR completion on PR merge

## PR Topology

One `feat/CR-NNN` Draft PR carries all stages. Branch and PR are opened at
intake and stay open until the implementation is approved and merged.

```
                                          ┌─ (standard + DHF impact) ──▶  commit: design ──┐
feat/CR-NNN  ──commit: CR YAML──▶  commit: spec ──┤                                         ├──▶  commit: code ──▶  merge
                                          └─ (code-only or doc-only) ─────────────────────┘
```

Stage position is tracked by a `cr:stage/*` label on the PR:

| Label | Stage |
|-------|-------|
| `cr:stage/cr` | CR definition awaiting human review |
| `cr:stage/spec` | AI-generated spec awaiting human review |
| `cr:stage/design` | AI-generated DHF design awaiting human review |
| `cr:stage/code` | AI-generated implementation awaiting code review |

## Stage Flow

### Intake

- Trigger: GitHub issue milestone set
- Workflow: `issue-to-cr.yml`
- Output: `feat/CR-NNN` Draft PR opened with `cr:stage/cr` label; CR YAML committed; CR transitioned to `in_review`

### Stage 1 — CR Review → Spec

- Trigger: reviewer **approves** PR at `cr:stage/cr`
- Workflow: `cr-lifecycle.yml`
- Output: `docs/cr-specs/CR-NNN-Spec.md` committed to branch; label rotated to `cr:stage/spec`
- If `changes_requested`: CR YAML is human-authored — update it manually and re-approve

### Stage 2 — Spec Review → Design (or direct to Code)

- Trigger: reviewer **approves** PR at `cr:stage/spec`
- Workflow: `cr-lifecycle.yml`
- Output depends on the spec's route:
  - **Standard with DHF impact** (`pipeline_route: standard`, non-empty `affected_items` or `proposed_new_items`): DHF design items committed; label rotated to `cr:stage/design`
  - **Code-only** (`pipeline_route: standard`, both `affected_items` and `proposed_new_items` empty): design skipped; proceeds directly to implementation; label rotated to `cr:stage/code`
  - **Doc-only** (`pipeline_route: doc-only`): design skipped; proceeds directly to implementation; label rotated to `cr:stage/code`
- If `changes_requested`: AI revises spec and pushes; re-approve to continue

### Stage 3 — Design Review → Implementation

- Trigger: reviewer **approves** PR at `cr:stage/design`
- Workflow: `cr-lifecycle.yml`
- Output: implementation code committed; Draft PR converted to ready; label rotated to `cr:stage/code`
- If `changes_requested`: AI revises design and pushes; re-approve to continue

### Stage 4 — Code Review → Merge

- Trigger: reviewer **approves** PR at `cr:stage/code`; human merges
- Workflow: `cr-complete.yml` (post-merge)
- Output: CR transitioned to `completed` in `DHF/items/09_cr/`
- If `changes_requested`: AI revises implementation and pushes; re-approve to continue

### Cancel

- Trigger: PR closed without merging (any stage)
- Workflow: `cr-lifecycle.yml`
- Output: CR YAML checked out to main, transitioned to `cancelled`, committed and pushed

## State Model

| State | Meaning |
|-------|---------|
| `draft` | CR created, not yet submitted |
| `in_review` | Draft PR open, spec/design/code under review |
| `completed` | Implementation merged; DHF closed out |
| `cancelled` | PR closed without merging |

Normal flow: `draft → in_review → completed`

Intermediate states (`designing`, `implementing`) are not used — the CR stays
`in_review` throughout all AI generation stages and transitions directly to
`completed` on merge.

## Manual Re-run

If a stage gets stuck (Claude timeout, runner failure), re-trigger via:

**Actions → cr-lifecycle → Run workflow**

Inputs:
- `cr_id`: e.g. `CR-034`
- `stage`: the stage to re-run (`cr`, `spec`, `design`, or `code`)

The workflow looks up the open `feat/CR-NNN` PR and runs the generate job for
that stage (`Generate Spec`, `Generate Design`, or `Generate Code`).

## Runtime Prerequisites

All workflows use `GITHUB_TOKEN` — no cross-repo secrets required.

Repository variables:
- `CR_ANALYZE_MODEL` — Claude model for spec generation
- `CR_DESIGN_MODEL` — Claude model for design generation
- `CR_DEVELOP_MODEL` — Claude model for implementation

Secrets:
- `ANTHROPIC_API_KEY`
