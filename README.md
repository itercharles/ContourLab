# WebTPS

Web-based Treatment Planning System for radiation therapy.

## Repository Layout

```
WebTPS/
├── apps/
│   ├── client/              — React 18 + TypeScript frontend (Vite, port 3000)
│   └── api/                 — ASP.NET Core API gateway (port 4000)
├── packages/
│   └── shared-types/        — Canonical TypeScript data model interfaces
├── DHF/                     — Design History File (items, config, documents)
│   ├── items/               — YAML DHF items (CR, SYS, SRS, RISK, etc.)
│   ├── config/              — DHF configuration (change-controlled)
│   └── documents/           — Spec and plan templates
├── docs/cr-specs/           — CR specification documents
├── docs/                    — Architecture, ADRs, local development notes
└── .github/workflows/       — CI/CD pipeline and CR automation
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

DICOM file import is delegated to **Orthanc Explorer 2** — clicking **Import
DICOM** in WebTPS opens the Orthanc UI in a new tab. To load test data:

1. Open `http://127.0.0.1:3000/workspace`.
2. Click the **patient folder icon** in the left toolbar to open the Repository
   panel, then click **"Open patient browser"**.
3. Click **"+ Import DICOM"** in the modal header. A new tab opens at
   Orthanc Explorer 2 (`http://<host>:8042/ui/app/index.html`). The exact host
   is derived from the configured DICOMweb endpoint, so it works for local
   (`localhost:8042`) and LAN (`<host-lan-ip>:8042`) setups without changing
   any code.
4. In the Orthanc tab, drag a folder of `.dcm` files onto the upload area
   (Orthanc handles RTSTRUCT, RTPLAN, and RTDOSE alongside CT/MR slices).
5. Return to the WebTPS tab — the worklist auto-refreshes when the tab regains
   focus, and the new studies appear in the patient list.

The same redirect button is also available from **Settings → Import DICOM
Data**. DICOM data persists in a named Docker volume across restarts; run
`pnpm repo:down && docker volume rm webtps_orthanc-db` to wipe it.

Sample DICOM datasets for testing are available from:
- [TCIA (The Cancer Imaging Archive)](https://www.cancerimagingarchive.net/) —
  free public CT datasets
- [OsiriX sample DICOM files](https://www.osirix-viewer.com/resources/dicom-image-library/) —
  small pre-packaged studies

More detail: [`docs/local_development.md`](docs/local_development.md).

## Deployed Build

The `CI Pipeline` deploy job runs on a Linux self-hosted runner and deploys the
app as a Docker Compose stack. The deployed stack uses different host ports to
avoid conflicting with the local dev server:

| | Dev server | Deployed build |
|--|------------|----------------|
| Frontend | `http://127.0.0.1:3000` | `http://AP-vS9RB5xoet8i.int.elekta.com:3001` |
| API | `http://127.0.0.1:4000` | `http://AP-vS9RB5xoet8i.int.elekta.com:4001` |
| Orthanc | `http://127.0.0.1:8042` | `http://AP-vS9RB5xoet8i.int.elekta.com:8042` |

Both can run simultaneously. Anyone on the Elekta network can reach the
deployed build at `AP-vS9RB5xoet8i.int.elekta.com`. See
[`docker-compose.deploy.yml`](docker-compose.deploy.yml) for the deployed stack
and [`docs/local_development.md`](docs/local_development.md) for runner setup
and operational commands.

The deploy workflow updates only the API and frontend containers. The Orthanc
DICOM repository is a persistent service and is not recreated for each app
release. Its database is bind-mounted from the host at
`${WEBTPS_ORTHANC_DATA_DIR:-./deploy-data/orthanc-db}`.

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
- Main-branch DHF artifact generation: specification PDFs, plan PDFs, and
  traceability PDF report

## Change Process

WebTPS uses a CR-driven workflow. Every non-trivial change — new feature, architecture
decision, external dependency — starts with a Change Request (CR) in this repository.

### How it works

1. **Open an issue in WebTPS** — describe the requested change. Maintainers review
   the issue and assign it to the current ISO-week milestone, e.g. `2026-W18`, when
   it is accepted. The `issue-to-cr` workflow automatically opens a CR PR.
2. **Approve the CR PR** — triggers automated analysis. The agent reads product strategy,
   architecture, and DHF context, then opens a Spec PR in `docs/cr-specs/`.
3. **Approve the Spec PR** — triggers automated DHF design. The agent opens a Design PR
   updating items in `DHF/items/`.
4. **Approve the Design PR** — triggers automated implementation. The agent opens an
   Implementation PR in this repo.
5. **Review the Implementation PR** — standard code review. Merge when satisfied.
   `cr-complete.yml` closes the CR automatically on merge.

No stage advances without explicit human approval. The agent cannot merge PRs.

The active weekly milestone is calculated automatically by the `issue-to-cr`
workflow using ISO-week naming such as `2026-W18`; maintainers only need to create
that milestone in GitHub and assign accepted issues to it.

### PR title format

Always include the CR ID:

```
feat(CR-042): add dose normalization to structure panel
fix(CR-031): correct version string in About page
```

### Branch naming

`feature/`, `fix/`, `refactor/`, or `claude/` prefix. Never commit directly to `main`.

### DHF impact

If your change introduces a new capability, external library, architecture decision, or
identified hazard — DHF items need updating. The Plan Spec PR will identify what is needed.

### DHF commands

DHF items live at `DHF/items/`. Use the `medharness` CLI:

```bash
medharness --dhf DHF dhf item list --type cr
medharness --dhf DHF dhf item get CR-034
medharness --dhf DHF dhf context for-stage develop --cr CR-034 --spec docs/cr-specs/CR-034-Spec.md
medharness --dhf DHF dhf item transition CR-034 completed --by "agent"
medharness --dhf DHF dhf validate schema
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
the `DHF/` directory of this repository. Each application feature must trace
to a DHF item.

## Agent Guidance

See [`CLAUDE.md`](CLAUDE.md) and the CR workflow in
[`docs/cr_spec_workflow.md`](docs/cr_spec_workflow.md).
