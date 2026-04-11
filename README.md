# WebTPS

Web-based Treatment Planning System for radiation therapy.

## Repositories

This project uses three repositories:

| Repo | Purpose |
|------|---------|
| **WebTPS** (this repo) | Application code — React frontend, Node.js API, Python compute |
| **WebTPS-DHF** | Design History File — requirements, risks, change requests, test evidence |
| **CompliantFlow** | Compliance analysis engine (Docker service used in CI) |

## Repository Layout

```
WebTPS/
├── apps/
│   ├── client/              — React 18 + TypeScript frontend (Vite, port 3000)
│   └── api/                 — ASP.NET Core API gateway (port 4000)
├── packages/
│   └── shared-types/        — Canonical TypeScript data model interfaces
├── docs/
│   ├── agent_environment.md — Environment contract for AI agents
│   └── agent_workflow.md    — Change workflow for AI agents
├── WebTPS_Plan_Spec.md      — Architecture spec and full feature roadmap
└── .github/workflows/       — CI/CD pipeline
```

## Setup

### Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9 (`npm install -g pnpm`)

### Install

```bash
pnpm install
```

### Development

```bash
pnpm dev          # frontend at http://localhost:3000
pnpm api          # API at http://localhost:4000
pnpm repo:up      # local Orthanc DICOM repo at http://localhost:8042
```

The Vite dev server proxies `/api` to port `4000` and `/dicom-web` to the
local Orthanc repository on port `8042`.

### Local DICOM Repository

WebTPS now loads imaging through a DICOMweb repository rather than directly
opening local files in the viewer. For local development, start the bundled
Orthanc service:

```bash
pnpm repo:up
```

Key endpoints:

- Web app: `http://localhost:3000`
- API: `http://localhost:4000`
- Orthanc UI: `http://localhost:8042/`
- DICOMweb root: `http://localhost:8042/dicom-web`

Use the repository panel in the app to upload DICOM instances into Orthanc for
development, then query and load series from the repository.

## Testing

```bash
pnpm -r test          # all workspaces
pnpm -r typecheck     # TypeScript check all workspaces
```

## Build

```bash
pnpm -r build
```

## Architecture

See [`WebTPS_Plan_Spec.md`](WebTPS_Plan_Spec.md) for the full architecture
specification, technology stack decisions, and phased feature roadmap.

### Phased Development

- **Phase 1** (Months 1-4): Contouring — DICOM viewer, contour tools, AI
  auto-segmentation, structure management, collaborative editing
- **Phase 2** (Months 5-7): Review — dose visualization, DVH, plan comparison,
  protocol compliance, report generation
- **Phase 3** (Months 8-14): Planning — beam geometry, optimization engine,
  dose calculation, MLC modeling, DICOM-RT export

## Compliance

Medical device compliance (IEC 62304, IEC 82304-1, ISO 14971) is managed in
the **WebTPS-DHF** repository. Each application feature must trace to a DHF
item. CI compliance checks run against WebTPS-DHF, not this repository.

## Agent Guidance

See [`CLAUDE.md`](CLAUDE.md), [`docs/agent_environment.md`](docs/agent_environment.md),
and [`docs/agent_workflow.md`](docs/agent_workflow.md).
