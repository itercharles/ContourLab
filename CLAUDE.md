# CLAUDE.md

## Project

ContourLab is a web-based radiation therapy Treatment Planning System — React frontend,
ASP.NET Core 10 API, shared TypeScript domain types, and local DICOM tooling (Orthanc via Docker).

Compliance and traceability (requirements, change requests, risks) live in the **`DHF/`** directory
of this repository — single-repo layout managed by MedHarness.

## Repo Layout

```
apps/client/           — React 18 + TypeScript (Vite, port 3000)
apps/api/              — ASP.NET Core 10 API (C#, port 4000)
packages/shared-types/ — Canonical TypeScript domain model (zero runtime deps)
DHF/                   — Design History File (items, config, documents, test-results)
DHF/items/             — YAML DHF items by type (CR, SYS, SRS, RISK, etc.)
DHF/config/            — DHF configuration (change-controlled)
DHF/documents/         — Spec and plan templates
tests/workflow/        — CR workflow tests: event routing, CR lifecycle, verify changes, commit step
.github/workflows/     — CI pipeline and CR automation
```

## Toolchain

Node.js ≥20, pnpm ≥9, .NET SDK 10, Python ≥3.11

## Key Commands

```bash
pnpm install                              # install all workspace deps
pnpm dev                                  # frontend dev server (port 3000)
pnpm api                                  # API dev server (port 4000)
pnpm repo:up                              # start local Orthanc (port 8042)
pnpm repo:down                            # stop local Orthanc
pnpm local:doctor                         # health check all local services
pnpm workflow:test                        # CR workflow tests (no model, no GitHub; needs medharness installed)
pnpm --filter @contourlab/client test         # frontend tests
pnpm --filter @contourlab/client typecheck    # typecheck frontend
pnpm -r typecheck                         # typecheck all workspaces
pnpm -r build                             # build all workspaces

# DHF operations (Python) — one CLI: medharness
pip install -r requirements.txt           # one-time setup
medharness --dhf DHF item list --type CR              # list all CRs
medharness --dhf DHF item get CR-NNN                  # get CR details
medharness --dhf DHF item transition CR-NNN <state>
medharness --dhf DHF verify dhf                       # schema, links, cycles, coverage
medharness --dhf DHF build release --version 0.0.0-preview --out-dir /tmp/dhf-preview  # render specs, traceability, SBOM (preview; changes nothing)
```

## Key Conventions

- **Data model**: All shared types in `packages/shared-types/src/index.ts`, imported as
  `@contourlab/shared-types`. Define model before feature.
- **Proxy**: Vite proxies `/api` and `/ws` → `localhost:4000`; `/dicom-web` → Orthanc `localhost:8042`
- **TypeScript**: strict mode throughout, no `any`
- **Styling**: Tailwind only, no inline styles, dark clinical theme (see `/ux-design`)
- **DHF**: DHF items live at `DHF/items/`. Use `medharness --dhf DHF ...` for everything: item
  CRUD (`item`), checks (`verify`) and generation (`build`). The CR design plan lives in the
  CR's `implementation_notes` field — read it with `medharness --dhf DHF item get CR-NNN`.
  - **Read** DHF items only with `medharness item list --type <TYPE>` and `medharness item get <ID>`
    (`get` includes every ID the item links to).
  - **Write** only with `medharness item create|update|transition`, never by editing files under
    `DHF/`: these check the schema before writing, allocate IDs, enforce the lifecycle and change
    only the fields you pass.
  - After any DHF change, run `medharness --dhf DHF verify dhf`.
- **Commits**: in CI, `build plan` / `build code` leave their work uncommitted and the workflow
  commits it. An agent running those stages must not commit, push, or open a PR itself.

### DHF Facade API Quick Reference

```bash
# Every command prints JSON to stdout and a readable log to stderr.
# Gates exit 0 (pass), 1 (fail), 2 (usage error).

# Read and write items
medharness --dhf DHF item get SRS-001
medharness --dhf DHF item list --type SRS
medharness --dhf DHF item update CR-034 --data '{"affected_items": ["SRS-001"]}'
medharness --dhf DHF item transition CR-034            # list where it can go
medharness --dhf DHF item transition CR-034 develop

# Check the DHF: schema, links, cycles, coverage (--strict fails on coverage gaps)
medharness --dhf DHF verify dhf --strict

# Requirement → test coverage from JUnit results (file or directory)
medharness --dhf DHF verify tests --junit apps/client/test-results

# Did a CR deliver what it recorded (affected_items present and verified)?
medharness --dhf DHF verify completion --cr CR-034 --junit apps/client/test-results

# Did the branch change the items the CR lists? (compares the working tree)
medharness --dhf DHF verify changes --cr CR-034 --since-ref origin/main

# Render specifications, traceability and SBOM into --out-dir (no --write: a preview)
medharness --dhf DHF build release --version 0.0.0-preview --out-dir /tmp/dhf-preview
```

## Sources of Truth

1. `packages/shared-types/src/index.ts` — canonical data model
2. `DHF/documents/specs/` — specification templates (architecture, CRS, etc.)
3. `DHF/documents/plans/development_plan.md` — technical direction, testing strategy, DevOps
4. `.github/workflows/ci-pipeline.yml` — enforced acceptance path

## Change Workflow

Every non-trivial change starts from a CR in this repo and passes through three stages,
each gated by human approval:

| Stage | Branch | Produced by |
|---|---|---|
| 1. CR Review | `feat/CR-NNN` | Human |
| 2. Design Review | `feat/CR-NNN` | Agent (`build plan` — DHF items + implementation plan) |
| 3. Implementation Review | `feat/CR-NNN` | Agent (`build code` — product code) |

Design and implementation live on the same branch, each committed separately.

### CR Status Model

| Status | Meaning |
|---|---|
| `new` | CR created, awaiting design review |
| `design` | `build plan` running or design under review |
| `develop` | `build code` running or implementation under review |
| `completed` | Implementation merged; DHF closed out |
| `rejected` | Triaged out during design |
| `cancelled` | PR closed without merging |

### Agent Rules

0. **Start from latest main** — before beginning any new task, always check out `main` and pull
   the latest: `git checkout main && git pull origin main`. Branch from there.

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

   Create a CR before starting significant work. If DHF was not updated, state why.

3. **Tests** — write alongside every functional change: unit tests for pure logic, component
   tests for React components, regression tests for bug fixes. Colocate at `*.test.ts(x)`.
   - Add `@links:SRS-xxx` or `@links:SYS-xxx` annotations to tests that verify DHF requirements.
   - For numbered test points (`T1:`, `T2:` on a requirement): embed `@testing:T1` in the test
     name (JS/TS) or use `@pytest.mark.dhf_testing("T1")` (Python) so the CI gate
     `medharness verify tests` can confirm every test point has passing coverage.
4. **Design** — `build plan` writes the implementation plan into the CR item's
   `implementation_notes`; treat that as the primary input for `build code`. Invoke
   `/ux-design` before any UI work.
5. **Modify** — keep changes in the workspace that owns the behavior; shared types first.
6. **Validate locally**:
   ```bash
   pnpm --filter @contourlab/client test
   pnpm --filter @contourlab/client lint && pnpm --filter @contourlab/client typecheck
   dotnet build apps/api/api.csproj --configuration Release   # API changes
   pnpm -r typecheck                                           # data model changes
   medharness --dhf DHF verify dhf                            # DHF item changes
   ```
7. **Handoff** — run `/post-implement`; open PR with CR ID in title, change summary,
   DHF files updated, validation run, manual test plan.

### PR Conventions

**Never commit directly to `main`.** Always work on a branch. Before merging or
pushing, ask the user whether to open a PR or merge locally — do not decide unilaterally.

- Branch: `feature/`, `fix/`, `refactor/`, or `feat/CR-NNN`
- Title: `feat(CR-042): description` — always include CR ID for CR-backed changes; use `chore(<scope>):` or `fix(<scope>):` for infra/housekeeping PRs with no CR
- Body: change summary · DHF files updated (or reason not to) · validation run · manual testing remaining
- After opening: monitor CI and review comments; every comment gets an explicit decision (fix / reply / defer / ask)

### Failure and Replan

- If implementation review invalidates the approved plan: return to `design`, revise the DHF items and `implementation_notes`, and get re-approval before continuing
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
- `compliance` — requirement-to-test coverage gate (SRS, SYS, CRS)

**Artifacts + Deploy** (main branch only, after compliance)
- `generate-artifacts` — DHF spec PDFs · traceability PDF · evidence bundle
- `deploy` — self-hosted workstation deployment via Docker

## Design Rules

- Edit over create; no abstraction for one-offs
- Shared types first — define model before feature
- Self-documenting code; comments only for non-obvious WHY
- No inline styles; Tailwind only; no `rounded-xl`; `text-xs` in panels
- No `any` types; TypeScript strict throughout

## Skills

**CR workflow**
- `/cr-implement <CR-ID>` — **primary entry point**: read the CR `implementation_notes`, implement, write tests, update DHF, open PR
- `/cr-status` — list all CRs and their current lifecycle states

**DHF operations**
- `/doc-generate` — regenerate all DHF specification documents
- `/traceability-check` — show which SYS/SRS/CRS items have no test coverage; suggest next tests

**Development**
- `/finish-branch` — validate, review DHF impact, open PR or merge
- `/ux-design` — UX design guidance before any UI work
- `/systematic-debugging` — structured debugging methodology
- `/verify` — verify work is complete before claiming done
- `/pre-analyze` — pre-implementation checklist (use for ad-hoc changes outside the CR workflow)
