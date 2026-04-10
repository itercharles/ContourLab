# Agent Workflow

This document defines how an agent should operate inside the environment
described in [`docs/agent_environment.md`](agent_environment.md).

## Change Workflow

1. Orient
   - Read `CLAUDE.md`.
   - Read [`docs/agent_environment.md`](agent_environment.md).
   - Identify which workspace owns the change: `apps/client`, `apps/server`,
     or `packages/shared-types`.
   - If the change involves new or modified requirements, create or update the
     corresponding DHF items in the **WebTPS-DHF** repository first.
2. Modify
   - Keep changes in the workspace that owns the behavior.
   - Data model changes go in `packages/shared-types` first, then consuming
     workspaces.
   - Do not duplicate type definitions across workspaces.
3. Validate locally
   - Run the narrowest test target first.
   - Then run the full workspace test suite.
   - TypeCheck all workspaces before opening a PR.
4. Check merge gates
   - Use the CI phases in `ci-pipeline.yml` as the acceptance model.
5. Handoff
   - Summarize what changed, what was validated, and any remaining risk.

## Validation Usage

- Frontend UI change: `pnpm --filter @webtps/client test`
- Server change: `pnpm --filter @webtps/server test`
- Data model change: `pnpm -r typecheck` (all consumers must still compile)
- Before merge: `pnpm -r test && pnpm -r typecheck && pnpm -r build`

## PR Workflow

When work is tied to a change request (CR) in WebTPS-DHF, reference the CR ID
in the PR title:

```
feat(CR-001): add About page infrastructure
```

If no CR exists yet, create one in WebTPS-DHF before opening the PR.

### Branch naming

- `feature/`, `fix/`, `refactor/` — human-initiated work
- `claude/` — Claude Code sessions

## CI Model

GitHub Actions defines the acceptance path:

1. Phase 1: Frontend lint + typecheck + test
2. Phase 2: Server lint + typecheck + test
3. Phase 3: Build all workspaces

## Design Rules

- Prefer editing existing files over creating new ones.
- Do not add abstraction layers for one-off operations.
- Shared types go in `packages/shared-types`, not in app-local files.
- Do not add comments explaining what code does — write self-documenting code.
- Follow the existing Tailwind + React patterns in `apps/client/src/pages/About.tsx`.
