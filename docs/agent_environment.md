# Agent Environment

WebTPS is a web-based radiation therapy Treatment Planning System — a monorepo
containing the React frontend, Node.js API gateway, and Python compute services.

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
3. [`WebTPS_Plan_Spec.md`](../WebTPS_Plan_Spec.md) — architecture spec and feature roadmap
4. [`.github/workflows/ci-pipeline.yml`](../.github/workflows/ci-pipeline.yml) —
   enforced acceptance path
5. Agent entrypoint: [`CLAUDE.md`](../CLAUDE.md)

## Repository Layout

```
WebTPS/
├── apps/
│   ├── client/          — React 18 + TypeScript frontend (Vite)
│   └── server/          — Node.js API gateway (Express)
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
pnpm --filter @webtps/server dev          # server only
pnpm -r build                             # build all workspaces
pnpm -r test                              # test all workspaces
pnpm -r typecheck                         # typecheck all workspaces
```

Node.js ≥ 20 and pnpm ≥ 9 are required.

### Key Conventions

- **Data model**: All shared TypeScript interfaces live in
  `packages/shared-types/src/index.ts`. Import as `@webtps/shared-types`.
- **Frontend**: `apps/client/` — React 18, Vite, Tailwind CSS. Entry: `src/main.tsx`.
- **Server**: `apps/server/` — Express on port 4000. Entry: `src/index.ts`.
- **Proxy**: Vite dev server proxies `/api` and `/ws` to `localhost:4000`.
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
