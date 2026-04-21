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

## Local Setup

### Prerequisites

- Node.js 20 or newer
- pnpm 9 or newer
- .NET SDK 10
- Docker Desktop or Docker Engine with Docker Compose support
- macOS, Linux, or Windows 10/11 with PowerShell

If pnpm is not installed, enable it through Corepack:

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

On Windows, install Docker Desktop with the WSL2 backend enabled. Run the
commands from PowerShell, Windows Terminal, or a WSL shell. Docker Desktop must
be running before starting the local DICOM repository. Ports `3000`, `4000`, and
`8042` must be available.

### One-Time Setup

```bash
pnpm local:setup
```

This installs JavaScript dependencies, restores the ASP.NET API, checks Docker,
and starts the local Orthanc DICOM repository.

### Start The Full Local Environment

```bash
pnpm local:up
```

This starts or verifies the complete development stack:

- Frontend: `http://127.0.0.1:3000/workspace`
- API: `http://127.0.0.1:4000/api/health`
- Orthanc: `http://127.0.0.1:8042`
- DICOMweb through the frontend proxy: `http://127.0.0.1:3000/dicom-web`

Press `Ctrl+C` to stop API/frontend processes started by `local:up`. Orthanc
keeps running with persisted Docker volume data.

### Check The Local Environment

```bash
pnpm local:doctor
```

This checks required commands, Docker daemon access, local ports, and HTTP
health endpoints.

### Stop The Local Repository

```bash
pnpm local:down
```

This stops Docker Compose services. Orthanc data remains in the Docker volume
unless the volume is explicitly deleted.

### Manual Development Commands

```bash
pnpm install      # install JS dependencies
pnpm dev          # frontend only at http://localhost:3000
pnpm api          # API only at http://localhost:4000
pnpm repo:up      # Orthanc DICOM repo only at http://localhost:8042
pnpm repo:down    # stop Orthanc
```

The Vite dev server proxies `/api` to port `4000` and `/dicom-web` to the local
Orthanc repository on port `8042`. Use the repository panel in the app to import
DICOM instances into Orthanc for development, then query and load series from
the repository.

More detail: [`docs/local_development.md`](docs/local_development.md).

## Testing

```bash
pnpm --filter @webtps/client lint
pnpm -r test          # all workspaces
pnpm -r typecheck     # TypeScript check all workspaces
dotnet build apps/api/api.csproj --configuration Release
```

## CI

GitHub Actions validates:

- Frontend lint, typecheck, test, and build
- ASP.NET API restore and build
- Shared types typecheck and build
- Integration smoke startup of Orthanc + API + frontend via `pnpm local:doctor`

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
