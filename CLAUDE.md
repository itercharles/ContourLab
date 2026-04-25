# CLAUDE.md

## Project

WebTPS is a web-based radiation therapy Treatment Planning System — React frontend,
ASP.NET Core 10 API, shared TypeScript domain types, and local DICOM tooling (Orthanc via Docker).

Compliance and traceability (requirements, change requests, risks) live in the **WebTPS-DHF**
repository — a separate workflow from application code. Do not update DHF items in this repo.

## Repo Layout

```
apps/client/           — React 18 + TypeScript (Vite, port 3000)
apps/api/              — ASP.NET Core 10 API (C#, port 4000)
packages/shared-types/ — Canonical TypeScript domain model (zero runtime deps)
docs/                  — Architecture, strategy, process docs
.github/workflows/     — CI pipeline
```

## Toolchain

Node.js ≥20, pnpm ≥9, .NET SDK 10

## Key Commands

```bash
pnpm install                              # install all workspace deps
pnpm dev                                  # frontend dev server (port 3000)
pnpm api                                  # API dev server (port 4000)
pnpm repo:up                              # start local Orthanc (port 8042)
pnpm repo:down                            # stop local Orthanc
pnpm local:doctor                         # health check all local services
pnpm --filter @webtps/client test         # frontend tests
pnpm --filter @webtps/client typecheck    # typecheck frontend
pnpm -r typecheck                         # typecheck all workspaces
pnpm -r build                             # build all workspaces
```

## Key Conventions

- **Data model**: All shared types in `packages/shared-types/src/index.ts`, imported as
  `@webtps/shared-types`. Define model before feature.
- **Proxy**: Vite proxies `/api` and `/ws` → `localhost:4000`; `/dicom-web` → Orthanc `localhost:8042`
- **TypeScript**: strict mode throughout, no `any`
- **Styling**: Tailwind only, no inline styles, dark clinical theme (see `/ux-design`)

## Sources of Truth

1. `packages/shared-types/src/index.ts` — canonical data model
2. `WebTPS-DHF/DHF/documents/specs/architecture_specification.md.j2` — architecture baseline (software items, goals, data flow, evolution rules)
3. `WebTPS-DHF/DHF/documents/specs/crs_specification.md.j2` — product direction, roadmap, user priorities, guardrails
4. `WebTPS-DHF/DHF/documents/plans/development_plan.md` — technical direction, testing strategy, DevOps
5. `.github/workflows/ci-pipeline.yml` — enforced acceptance path

## Change Workflow

Every non-trivial change starts from a CR in WebTPS-DHF and passes through three stages,
each gated by human approval:

| Stage | Where | Produced by |
|---|---|---|
| 1. CR PR | WebTPS-DHF | Human |
| 2. Plan Spec PR | WebTPS-DHF | Agent (after CR PR approved) |
| 3. Implementation PR | WebTPS | Agent (after Plan Spec approved) |

### CR Status Model

| Status | Meaning |
|---|---|
| `draft` | CR created, not yet submitted |
| `in_review` | CR PR open, awaiting human approval |
| `designing` | CR approved; agent generating plan spec |
| `implementing` | Plan approved; agent implementing; Implementation PR active |
| `completed` | Implementation merged; DHF closed out |
| `cancelled` | CR declined |

### Agent Rules

1. **Pre-analyze** — run `/pre-analyze`; classify the change (docs, bugfix, feature,
   architecture); check against product/technical strategy; identify DHF impact
2. **DHF assessment** — decide which DHF items need updating:

   | Change type              | DHF items                           |
   |--------------------------|-------------------------------------|
   | New feature / capability | UC → CRS → SYS → SRS → SWDD         |
   | New external library     | SOUP entry (version, safety class)  |
   | Architecture decision    | SYSARCH / SWDD                      |
   | Hazard identified        | RISK + RCM                          |
   | CR implemented           | transition CR to `completed`        |

   Create a CR in WebTPS-DHF before starting significant work. If DHF was not updated, state why.

3. **Tests** — write alongside every functional change: unit tests for pure logic, component
   tests for React components, regression tests for bug fixes. Colocate at `*.test.ts(x)`.
   Add `@links:SRS-xxx` or `@links:SYS-xxx` annotations to tests that verify DHF requirements.
4. **Design** — invoke `/ux-design` before any UI work.
5. **Modify** — keep changes in the workspace that owns the behavior; shared types first.
6. **Validate locally**:
   ```bash
   pnpm --filter @webtps/client test
   pnpm --filter @webtps/client lint && pnpm --filter @webtps/client typecheck
   dotnet build apps/api/api.csproj --configuration Release   # API changes
   pnpm -r typecheck                                           # data model changes
   ```
7. **Handoff** — run `/post-implement`; open PR with CR ID in title, change summary,
   DHF files updated, validation run, manual test plan.

### PR Conventions

**Never commit directly to `main`.** Always work on a branch. Before merging or
pushing, ask the user whether to open a PR or merge locally — do not decide unilaterally.

- Branch: `feature/`, `fix/`, `refactor/`, or `claude/`
- Title: `feat(CR-042): description` — always include CR ID
- Body: change summary · DHF files updated (or reason not to) · validation run · manual testing remaining
- After opening: monitor CI and review comments; every comment gets an explicit decision (fix / reply / defer / ask)

### Failure and Replan

- If implementation review invalidates the approved plan: return to `designing`, revise plan spec, get re-approval before continuing
- If agent cannot produce a viable plan: surface the blocker to the human, do not enter implementation
- Never merge without human approval; never advance stages based on AI-generated comments alone

## CI Phases

**Development Testing** (parallel)
- `dev-frontend` — lint · typecheck · build
- `dev-api` — restore · build
- `dev-shared-types` — typecheck · build
- `dev-integration` — full stack startup · `pnpm local:doctor` smoke check

**Verification Testing** (parallel, after dev builds pass)
- `verify-srs` — Vitest with `@links` annotations → `verify-srs-junit` artifact (IEC 62304 §5.5–5.6)
- `verify-sys` — Playwright system tests → `verify-sys-junit` artifact (IEC 62304 §5.7)

**Validation Testing** (parallel, after dev builds pass)
- `validate-crs` — Playwright clinical workflow tests → `validate-crs-junit` artifact (IEC 62304 §5.8)

**Compliance Check** (after all testing passes — final gate for PRs)
- `compliance` — IEC 62304 · IEC 82304-1 checks

**Artifacts + Deploy** (main branch only, after compliance)
- `generate-artifacts` — DHF spec PDFs · plan PDFs · traceability JSON report
- `deploy` — self-hosted workstation deployment via PM2

## Design Rules

- Edit over create; no abstraction for one-offs
- Shared types first — define model before feature
- Self-documenting code; comments only for non-obvious WHY
- No inline styles; Tailwind only; no `rounded-xl`; `text-xs` in panels
- No `any` types; TypeScript strict throughout

## Skills

- `/pre-analyze` — pre-implementation checklist before starting any change
- `/post-implement` — post-implementation checklist before handoff
- `/ux-design` — UX design guidance for clinical imaging components
- `/systematic-debugging` — structured debugging methodology
- `/verify` — verify work is complete before claiming done
- `/finish-branch` — complete a branch with tests, checklist, and PR options
