# Agent Workflow

This document defines how an agent should operate inside the environment
described in [`docs/agent_environment.md`](agent_environment.md).

## Change Workflow

0. Pre-analyze
   - Review [`../AI-harness/pre-analyze.md`](../AI-harness/pre-analyze.md).
   - Classify the request as `docs/process`, `infra/devops`, `bugfix`,
     `feature`, or `architecture`.
   - Check the request against
     [`architecture/system_architecture.md`](architecture/system_architecture.md).
   - Check the request against:
     - [`strategy/product_strategy.md`](strategy/product_strategy.md)
     - [`strategy/product_roadmap.md`](strategy/product_roadmap.md)
     - [`strategy/technical_strategy.md`](strategy/technical_strategy.md)
     - [`strategy/testing_strategy.md`](strategy/testing_strategy.md)
   - Determine whether the request conflicts with current product or technical
     direction.
   - Determine whether an ADR is required.
   - Determine whether a new dependency is being introduced and justify it.
   - Determine whether DHF updates are expected and list the candidate DHF
     files before implementation when applicable.

1. Orient
   - Read `CLAUDE.md`.
   - Read [`docs/agent_environment.md`](agent_environment.md).
   - Identify which workspace owns the change: `apps/client`, `apps/api`,
     or `packages/shared-types`.
   - If the change involves new or modified requirements, create or update the
     corresponding DHF items in the **WebTPS-DHF** repository first.

2. DHF — assess before and after code changes
   Use the pre-analyze step to decide whether the request changes product
   behavior, requirements, architecture decisions, risk posture, or
   verification expectations in a way that requires updates in
   **WebTPS-DHF**. When DHF impact is expected, list the candidate files before
   implementation and update them as part of the same change cycle. Use the
   table below to decide which item types need updating:

   | Code change type | DHF items to update |
   |---|---|
   | New feature / capability | UC → CRS → SYS → SRS → SWDD (create or update) |
   | New external library | SOUP entry (version, safety class, purpose) |
   | Architecture decision | ARCH / SWDD |
   | Hazard identified | RISK + RCM |
   | CR implemented | Transition CR status to `completed` |

   Rules:
   - Create a CR before starting significant work when the change affects
     product behavior, system design, risk, or formal verification scope;
     transition it to `completed` in the same commit as the implementing code.
   - SRS items must derive from SYS items (`derives_from: [SYS-xxx]`).
   - SWDD items must reference the SRS they implement (`implements: [SRS-xxx]`).
   - RISK items must have a corresponding RCM (`mitigates: RISK-xxx`).
   - Do not leave CRs in active pre-completion states after implementation has
     shipped; transition them according to the CR automation workflow.
   - If DHF was intentionally not updated, state why in the final handoff.

3. Tests — write or update alongside every code change
   **Every functional change requires test coverage.** Follow this checklist:

   - **New pure function** (calculator, parser, formatter): write a unit test
     file alongside it (`*.test.ts` next to the source or in `__tests__/`).
   - **New React component**: write a component test covering render, user
     interaction, and edge cases.
   - **New store action**: test the state transition directly.
   - **Bug fix**: add a regression test that would have caught the bug.
   - **Refactor**: verify existing tests still pass; add tests for any
     previously untested paths touched.

   Test file location: colocated `*.test.ts(x)` next to the source file.
   Run before committing: `pnpm --filter @webtps/client test`

4. Design — apply the UX skill for any UI work
   Before modifying or creating UI components, invoke `/ux-design` to load the
   clinical design system. All new components must comply with:
   - The color palette and typography scale in `.claude/skills/ux-design/SKILL.md`
   - OHIF-style viewport chrome conventions
   - Compact, keyboard-efficient interaction patterns

5. Modify
   - Keep changes in the workspace that owns the behavior.
   - Data model changes go in `packages/shared-types` first, then consuming
     workspaces.
   - Do not duplicate type definitions across workspaces.

6. Validate locally
   - Run the narrowest test target first.
   - Then run the full workspace test suite.
   - TypeCheck all workspaces before opening a PR.

7. Check merge gates
   - Use the CI phases in `ci-pipeline.yml` as the acceptance model.

8. Handoff
   - Review [`../AI-harness/post-implement.md`](../AI-harness/post-implement.md).
   - Summarize what changed, what was tested, what DHF items were updated,
     and any remaining risk.

9. Branch / PR discipline for functional changes
   - If the change modifies product behavior, workflow behavior, UI behavior,
     integration behavior, or verification scope, do the work on a dedicated
     branch instead of directly on `main`.
   - Open a PR before merge.
   - The PR description must include:
     - a concise summary of the change
     - the exact DHF files changed, or an explicit statement that no DHF update
       was required
     - the automated validation commands that were run
     - the manual testing still required, with concrete steps
   - Documentation-only or repo-process-only changes may be handled without a
     PR when the user explicitly wants a direct local commit.

9a. PR follow-up discipline
   - After opening a PR, continue monitoring review comments and CI until the
     PR is resolved.
   - When practical, use a recurring thread follow-up or equivalent automation
     to check for new review feedback at a short interval.
   - For each new review comment, explicitly decide whether to:
     - fix immediately
     - reply with rationale and not fix
     - ask for clarification
     - defer to a follow-up item
   - Every review comment should receive a response. Do not silently ignore
     actionable feedback.
   - Follow [`process/pr_review_response_policy.md`](process/pr_review_response_policy.md)
     for comment triage and response behavior.

10. Definition of done
   - Do not treat implementation as complete when only code or docs were
     written.
   - Completion requires explicit review of direction fit, DHF impact, ADR /
     dependency impact, validation run, and manual testing still required.

## Validation Commands

- Frontend UI change: `pnpm --filter @webtps/client test`
- Frontend static checks: `pnpm --filter @webtps/client lint && pnpm --filter @webtps/client typecheck`
- API change: `dotnet build apps/api/api.csproj --configuration Release`
- Data model change: `pnpm -r typecheck` (all consumers must still compile)
- Before merge: `pnpm -r test && pnpm -r typecheck && pnpm -r build`

## PR Workflow

When work is tied to a change request (CR) in WebTPS-DHF, reference the CR ID
in the PR title:

```
feat(CR-002): implement DICOM MPR viewer
```

If no CR exists yet, create one in WebTPS-DHF before opening the PR.

PR description should always include:

1. Change summary
2. DHF updates
3. Automated validation run
4. Manual test plan / remaining manual verification

After PR creation, agents are expected to keep following the PR until comments
and CI outcomes are addressed or explicitly handed off.

For CR-driven delivery, also follow:

- [`process/cr_automation_workflow.md`](process/cr_automation_workflow.md)
- [`process/plan_spec_template.md`](process/plan_spec_template.md)
- [`process/github_automation_design.md`](process/github_automation_design.md)
- [`process/reviewer_authorization_policy.md`](process/reviewer_authorization_policy.md)
- [`process/stage1_workflow_scaffold.md`](process/stage1_workflow_scaffold.md)
- [`process/stage2_workflow_scaffold.md`](process/stage2_workflow_scaffold.md)
- [`process/plan_followup_scaffold.md`](process/plan_followup_scaffold.md)
- [`process/implementation_followup_scaffold.md`](process/implementation_followup_scaffold.md)
- [`process/completion_sync_scaffold.md`](process/completion_sync_scaffold.md)

### Branch naming

- `feature/`, `fix/`, `refactor/` — human-initiated work
- `claude/` — Claude Code sessions

## CI Model

GitHub Actions defines the acceptance path:

1. Phase 1: Frontend lint + typecheck + test + build
2. Phase 2: API restore + build
3. Phase 3: Shared types typecheck + build
4. Phase 4: Integration smoke check using local Orthanc + API + frontend + `pnpm local:doctor`

## Design Rules

- Prefer editing existing files over creating new ones.
- Do not add abstraction layers for one-off operations.
- Shared types go in `packages/shared-types`, not in app-local files.
- Do not add comments explaining what code does — write self-documenting code.
- Follow the clinical UX conventions in `.claude/skills/ux-design/SKILL.md`.
