# CR Workflow

## Purpose

This document defines the CR-driven workflow for ContourLab. All DHF content —
CR items, requirements, risks, specs — lives in this repository under `DHF/`
and `docs/cr-specs/`.

## What you do, and when

A CR has six steps. You act at three of them; the rest is automatic. The **progress checklist** comment
on the CR's PR shows the current step and, when it is your turn, says what to do. It is edited in
place; when it becomes your turn a short new comment is added as well, because only a new comment
sends a notification.

| # | Step | Who | What happens | What you do |
|---|------|-----|--------------|-------------|
| 1 | Intake and design | automatic | You set a milestone on the issue. `CR Issue Intake` makes the CR, the `feat/CR-NNN` branch and a draft PR, then generates the design and posts its summary and the implementation plan. | Nothing. |
| 2 | Design review | **you** | The PR is at `cr:stage/design`. | Read the DHF changes and the plan. **Approve** to continue, or **Request changes** with comments to have the design revised. **Wait for the checklist to say it is your turn:** the PR exists for a few minutes before the design does, and a review given then is ignored (a comment says so). |
| 3 | Code and CI | automatic | `CR lifecycle` generates the code, pushes it and CI runs the full test set. | Nothing; wait for CI to be green. |
| 4 | Code review | **you** | The PR is at `cr:stage/code`. | Read the code. **Approve**, or **Request changes** with comments. You can still **Request changes** after approving: the CR is reopened first (see Stage 2). |
| 5 | Complete the CR | automatic | Your approval records the CR as `completed` in a commit on the branch (one line of the CR file changes) and CI runs again. | Nothing; wait for the checklist to say it is ready. |
| 6 | Merge | **you** | `CR lifecycle` says the CR is completed and CI passed. | **Squash-merge** the PR. The completion commit merges with the code, so there is no second PR. |

You act at three points: approve the design, approve the code, merge. Step 5 pushes a commit, which makes
GitHub dismiss your approval; the PR may show as not approved, and you merge it with your admin bypass.
If you request changes after approving, the CR is reopened, the code is revised, and you approve again.

A failure shows as a red step in the checklist, with what failed and a link to the run.

Runs for one CR go one after the other, in the order the events came; they do not cancel each other. If you
approve the code before the "your turn, step 4" notice (that is, while CI is still running on the generated
code), the approval waits for the generation run to finish, which waits for that CI, and the notice for step 4
then appears before the checklist moves on to step 5. Approving after the notice avoids the wait.

When the CR is complete (the PR is merged), the `cr:stage/*` labels are taken off its issue, so a closed issue
does not still say it is at the design stage.

**If a CR PR is merged without the code approval** (the checklist's step 5 never ran), the CR is still
`develop` on `main`. `CR completion` then falls back to the old path: it opens `chore: complete CR-NNN`,
waits for its checks and notifies you to merge it. That is the only case in which a second PR appears.

### What the run titles in the Actions list mean

| Title | Meaning |
|-------|---------|
| `CR Issue Intake \| #N \| issue title` | Step 1 for issue #N. |
| `feat/CR-NNN · design approved` / `code approved` | Your approval was received; code generation or "ready to merge" follows. |
| `feat/CR-NNN · design changes requested` / `code changes requested` | The design or code is being revised from your comments. |
| `feat/CR-NNN · comment, nothing to do` | A plain review comment: nothing starts. |
| `feat/CR-NNN · review ignored, the design is not ready` | You approved or requested changes before the design was generated; nothing started. Review again when the checklist says it is your turn. |
| `feat/CR-NNN · merged, checking the CR is recorded as completed` | The merge happened; this either marks the CR finished or, if it was merged without the code approval, opens the fallback close-out PR. |
| `feat/CR-NNN · close-out merged, CR finished` | Only after a fallback close-out PR. |
| `PR #N · not a CR, ignored` | Any other PR being reviewed (the lifecycle workflow), or any PR closing (the completion workflow): they start and skip what is not a CR. These rows are expected noise. |
| `CI · PR #N · title`, `CI · push to main` | The product CI/CD pipeline. A branch with a PR is built once, by the PR; only `main` is also built on push. |

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
  1. CR YAML created (a CR number whose `feat/CR-NNN` branch already exists on the remote is skipped, so the
     branch of a CR whose PR was closed is never overwritten); pushed to `feat/CR-NNN` branch
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
- Steps:
  1. The CR is moved to `completed` with `medharness item transition` (which refuses it when the CR record is
     incomplete) and committed and pushed to the branch with the PAT, so CI runs on it. CI's closure gate
     (`verify completion`) has already passed on the code being approved.
  2. The job waits for the CI run of that commit.
  3. The progress checklist moves to step 6 ("Merge this PR") and a notification comment is added; human merges the PR
- If `changes_requested`: `revise-code` re-runs `develop-cr` and pushes; re-approve to continue.
  If the code was already approved, the CR is `completed` on the branch and the AI stages refuse a completed
  CR, so `revise-code` first reopens it (`item transition CR-NNN develop`, in a commit of its own, `chore: reopen
  CR-NNN for revision`); the next approval completes it again. A CR that a release lists (`included_items`) cannot
  be reopened, since it has shipped: the job fails and the checklist says so, and the change needs a new CR

### Post-Merge

- Workflow: `cr-complete.yml`
- If the CR is already `completed` on the merged branch (the normal case, see Stage 2): the progress checklist
  is marked complete and nothing else happens.
- Otherwise (merged without the code approval), the fallback:
  1. CR transitioned to `completed`, committed to `chore/complete-CR-NNN` and a PR opened with the PAT
  2. The job waits for that PR's CI; the checklist then says "merge it" with a notification (or shows what failed)
  3. When you merge it (`close-out-merged` job) the checklist shows the CR as complete
- The pipeline never merges anything itself.

### A PR closed without merging

Nothing happens and nothing is recorded: a CR exists only on its branch until its PR merges, so `main` is
unchanged. The old `feat/CR-NNN` branch stays until someone deletes it. To start again from the same issue, set
its milestone again; the new CR takes the next free number, because intake skips any number whose `feat/CR-NNN`
branch is still on the remote.

## State Model

| State | Meaning |
|-------|---------|
| `draft` | CR created, not yet submitted |
| `in_review` | Draft PR open, design/code under review |
| `completed` | Implementation merged; DHF closed out |

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

The Claude Code CLI that the design and code jobs run is installed at an exact version in
[`.github/actions/cr-agent-setup/action.yml`](../.github/actions/cr-agent-setup/action.yml) (currently `2.1.300`),
because those jobs hold `ACTIONS_PAT` and the model key. A new release does not arrive by itself: to upgrade,
change the version there, and take one CR through design and code before relying on it. The contract check
fails if the install is not at an exact version.

Repository variables:
- `CR_DESIGN_MODEL` — Claude model for DHF design generation
- `CR_DEVELOP_MODEL` — Claude model for implementation

Secrets:
- `ANTHROPIC_API_KEY`
- `ACTIONS_PAT`
