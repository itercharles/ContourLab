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

- **Node.js 20+** — check with `node --version`. If you use a version manager
  (`nvm`, `fnm`, or `volta`), run `nvm install 20 && nvm use 20` (or equivalent)
  before proceeding.
- **pnpm 9+** — check with `pnpm --version`. Install via Corepack if missing:
  ```bash
  corepack enable
  corepack prepare pnpm@latest --activate
  ```
- **.NET SDK 10** — required for the API (`apps/api`). Download from
  [dot.net](https://dot.net).
- **Docker Desktop or Docker Engine with Compose** — required to run the local
  Orthanc DICOM repository.

On Windows, install Docker Desktop with the **WSL2 backend** enabled and ensure
it is running before executing setup or start commands. Run all commands from
PowerShell, Windows Terminal, or a WSL shell.

Required local ports: `3000` (frontend), `4000` (API), `8042` (Orthanc).

> **Frontend-only mode:** If you only need the React client (no DICOM repository
> or API), you can skip the .NET SDK and Docker requirements entirely:
> ```bash
> pnpm install
> pnpm dev
> ```
> The app opens at `http://localhost:3000/workspace` and supports local file-drop
> loading of DICOM files without any backend services.

### One-Time Setup

```bash
pnpm local:setup
```

Installs JavaScript dependencies, restores the ASP.NET API, checks Docker, and
starts the local Orthanc DICOM repository.

### Start The Full Local Environment

```bash
pnpm local:up
```

Starts or verifies the complete development stack:

| Service | URL |
|---------|-----|
| Frontend | `http://127.0.0.1:3000/workspace` |
| API | `http://127.0.0.1:4000/api/health` |
| Orthanc DICOM repo | `http://127.0.0.1:8042` |
| DICOMweb (via proxy) | `http://127.0.0.1:3000/dicom-web` |

Press `Ctrl+C` to stop API/frontend processes. Orthanc keeps running with
persisted Docker volume data.

### Check The Local Environment

```bash
pnpm local:doctor
```

Checks required commands, Docker daemon access, local ports, and HTTP health
endpoints.

### Stop The Local Repository

```bash
pnpm local:down
```

Stops Docker Compose services. Orthanc data remains in the Docker volume unless
the volume is explicitly deleted.

### Manual Development Commands

```bash
pnpm install      # install JS dependencies
pnpm dev          # frontend only at http://localhost:3000
pnpm api          # API only at http://localhost:4000
pnpm repo:up      # Orthanc DICOM repo only at http://localhost:8042
pnpm repo:down    # stop Orthanc
pnpm repo:logs    # stream Orthanc container logs
```

The Vite dev server proxies `/api` → port `4000` and `/dicom-web` → port `8042`.
No `.env` file is required — all defaults work out of the box.

### Importing DICOM Data

The Orthanc repository ships with **no authentication** (open for local
development). Its web UI at `http://127.0.0.1:8042` requires no login.

To load DICOM data for development, import it through the WebTPS UI:

1. Open `http://127.0.0.1:3000/workspace`.
2. Click the **patient folder icon** in the left toolbar (or press the Navigator
   button) to open the Repository panel.
3. Click **"Open patient browser"** at the top of the panel, then click
   **"+ Import DICOM"** in the modal header.
4. Select a folder of `.dcm` files — the browser will recurse into
   subdirectories automatically.
5. After import completes, click **Refresh** (or wait for the auto-poll) and
   the new studies appear in the patient list.

Alternatively, import via **Settings → Import DICOM Data** (useful for bulk
initial loads). DICOM data persists in a named Docker volume across restarts;
run `pnpm repo:down && docker volume rm webtps_orthanc-db` to wipe it.

Sample DICOM datasets for testing are available from:
- [TCIA (The Cancer Imaging Archive)](https://www.cancerimagingarchive.net/) —
  free public CT datasets
- [OsiriX sample DICOM files](https://www.osirix-viewer.com/resources/dicom-image-library/) —
  small pre-packaged studies

More detail: [`docs/local_development.md`](docs/local_development.md).

## Deployed Build

The GitHub Actions deploy workflow builds the app and serves it via PM2 on
different ports to avoid conflicting with the local dev server:

| | Dev server | Deployed build |
|--|------------|----------------|
| Frontend | `http://127.0.0.1:3000` | `http://<workstation-ip>:3001` |
| API | `http://127.0.0.1:4000` | `http://<workstation-ip>:4001` |
| Orthanc | `http://127.0.0.1:8042` | `http://127.0.0.1:8042` (shared) |

Both can run simultaneously. The deployed build binds on `0.0.0.0` — anyone on
the same network can reach it at the workstation's IP (`ipconfig` to find it).
See [`docs/local_development.md`](docs/local_development.md) for PM2 setup and
first-time deploy instructions.

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
