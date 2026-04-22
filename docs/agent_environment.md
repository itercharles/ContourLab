# Agent Environment

WebTPS is a web-based radiation therapy Treatment Planning System — a monorepo
containing the React frontend, ASP.NET Core API gateway, shared domain types,
and local development tooling. Local development also depends on a
DICOMweb-capable repository for image access. The default developer setup uses
Orthanc via Docker.

Compliance and traceability (DHF, requirements, change requests) are managed in
the **WebTPS-DHF** repository. Compliance analysis runs via the **CompliantFlow**
Docker service. Do not confuse application code changes in this repo with DHF
changes — they are separate repositories with separate workflows.

This document defines the stable operating context for any LLM or coding agent
working in this repository.

## Sources Of Truth

1. [`README.md`](../README.md) — repository layout and setup
2. [`packages/shared-types/src/index.ts`](../packages/shared-types/src/index.ts) —
   canonical data model (Patient, Study, Volume, StructureSet, TreatmentPlan)
3. [`WebTPS_Plan_Spec.md`](../WebTPS_Plan_Spec.md) — broader historical spec
   and roadmap context; use with care when it conflicts with newer strategy or
   architecture documents
4. [`.github/workflows/ci-pipeline.yml`](../.github/workflows/ci-pipeline.yml) —
   enforced acceptance path
5. [`docs/architecture/system_architecture.md`](architecture/system_architecture.md) —
   architecture baseline and evolution constraints
6. [`docs/strategy/product_strategy.md`](strategy/product_strategy.md) and
   [`docs/strategy/product_roadmap.md`](strategy/product_roadmap.md) — current product
   direction and delivery priorities
7. [`docs/strategy/technical_strategy.md`](strategy/technical_strategy.md) and
   [`docs/strategy/testing_strategy.md`](strategy/testing_strategy.md) — architecture
   and verification direction
8. [`docs/process/cr_automation_workflow.md`](process/cr_automation_workflow.md) —
   CR-driven automation workflow and PR gating model
9. [`docs/process/github_automation_design.md`](process/github_automation_design.md) —
   GitHub event, label, and approval mapping for CR automation
10. [`docs/process/reviewer_authorization_policy.md`](process/reviewer_authorization_policy.md) —
   authorized-approver rules for automation gates
11. [`docs/process/stage1_workflow_scaffold.md`](process/stage1_workflow_scaffold.md) —
   current Stage 1 implementation scaffold
12. [`docs/process/stage2_workflow_scaffold.md`](process/stage2_workflow_scaffold.md) —
   current Stage 2 implementation scaffold
13. [`docs/process/implementation_followup_scaffold.md`](process/implementation_followup_scaffold.md) —
   current implementation review-follow-up scaffold
14. [`docs/process/completion_sync_scaffold.md`](process/completion_sync_scaffold.md) —
   current completion-state synchronization scaffold
15. Agent entrypoint: [`CLAUDE.md`](../CLAUDE.md)

## Repository Layout

```
WebTPS/
├── apps/
│   ├── client/          — React 18 + TypeScript frontend (Vite)
│   └── api/             — ASP.NET Core 10 Web API (C#, port 4000)
├── packages/
│   └── shared-types/    — Canonical TypeScript data model interfaces
├── docs/                — Agent documentation
├── WebTPS_Plan_Spec.md  — Full architecture and feature spec
└── .github/workflows/   — CI/CD pipeline
```

## Environment Contract

### JavaScript / TypeScript

Uses **pnpm workspaces**. Always run pnpm from the repo root.

```bash
pnpm install                              # install all workspace deps
pnpm dev                                  # run frontend dev server (port 3000)
pnpm --filter @webtps/client dev          # frontend only
pnpm api                                  # run ASP.NET Core API (port 4000)
pnpm repo:up                              # run local Orthanc DICOM repo (port 8042)
pnpm repo:down                            # stop local Orthanc DICOM repo
pnpm -r build                             # build all workspaces
pnpm -r test                              # test all workspaces
pnpm -r typecheck                         # typecheck all workspaces
```

Node.js ≥ 20, pnpm ≥ 9, and .NET SDK 10 are required.

### Key Conventions

- **Data model**: All shared TypeScript interfaces live in
  `packages/shared-types/src/index.ts`. Import as `@webtps/shared-types`.
- **Frontend**: `apps/client/` — React 18, Vite, Tailwind CSS. Entry: `src/main.tsx`.
- **API**: `apps/api/` — ASP.NET Core 10 Web API on port 4000. Entry: `Program.cs`. Controllers in `Controllers/`.
- **Proxy**: Vite dev server proxies `/api` and `/ws` to `localhost:4000`.
- **DICOM repo**: Vite dev server proxies `/dicom-web` to the local Orthanc
  repository on `localhost:8042`.
- **Styling**: Tailwind CSS. No inline styles. Prefer utility classes.
- **Type safety**: TypeScript strict mode throughout. No `any` types.

## Related Repositories

- **WebTPS-DHF** — Design History File, compliance items, governance
- **CompliantFlow** — Compliance analysis engine (Docker service)

For DHF changes (requirements, change requests, risks):
- Work in the WebTPS-DHF repository, not here.
- CI in this repo does not run compliance checks — that is WebTPS-DHF's responsibility.

## Standard Command Surface

```bash
# Development
pnpm install
pnpm dev                     # frontend at http://localhost:3000/about

# Testing
pnpm -r test
pnpm --filter @webtps/client test

# Type checking
pnpm -r typecheck

# Build
pnpm -r build
```
