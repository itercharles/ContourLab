# Agent Workflow

This document defines how an agent should operate inside the environment
described in [`docs/agent_environment.md`](agent_environment.md).

## Change Workflow

1. Orient
   - Read `CLAUDE.md`.
   - Read [`docs/agent_environment.md`](agent_environment.md).
   - Identify which workspace owns the change: `apps/client`, `apps/api`,
     or `packages/shared-types`.
   - If the change involves new or modified requirements, create or update the
     corresponding DHF items in the **WebTPS-DHF** repository first.

2. DHF — update before and after code changes
   **This is mandatory, not optional.** Every non-trivial code change must be
   accompanied by DHF updates in **WebTPS-DHF**. Use the table below to decide
   which item types need updating:

   | Code change type | DHF items to update |
   |---|---|
   | New feature / capability | UC → CRS → SYS → SRS → SWDD (create or update) |
   | New external library | SOUP entry (version, safety class, purpose) |
   | Architecture decision | ARCH / SWDD |
   | Hazard identified | RISK + RCM |
   | CR implemented | Transition CR status to `completed` |

   Rules:
   - Create a CR before starting significant work; transition it to `completed`
     in the same commit as the implementing code.
   - SRS items must derive from SYS items (`derives_from: [SYS-xxx]`).
   - SWDD items must reference the SRS they implement (`implements: [SRS-xxx]`).
   - RISK items must have a corresponding RCM (`mitigates: RISK-xxx`).
   - Do not leave CRs in `planned` status after code ships.

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
   - Summarize what changed, what was tested, what DHF items were updated,
     and any remaining risk.

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
