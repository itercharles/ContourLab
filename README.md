# ContourLab

Browser-based contouring workspace for radiation oncology.

ContourLab combines a React client, an ASP.NET Core API, a local Orthanc
DICOM repository, and a small auto-contouring service into a single development
environment for structure authoring, RTSTRUCT import and export, collaborative
contour editing, and AI-assisted draft generation.

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- .NET SDK 10
- Docker with Compose

Frontend-only work is also supported:

```bash
pnpm install
pnpm dev
```

For the full local stack:

```bash
pnpm local:setup
pnpm local:up
```

Default local endpoints:

| Service | URL |
| --- | --- |
| Frontend | `http://127.0.0.1:3000/workspace` |
| API | `http://127.0.0.1:4000/api/health` |
| Auto-contour service | `http://127.0.0.1:4010/health` |
| Orthanc DICOM repo | `http://127.0.0.1:8042` |
| DICOMweb proxy | `http://127.0.0.1:3000/dicom-web` |

More setup and troubleshooting detail lives in
[`docs/local_development.md`](docs/local_development.md).

## Daily Commands

```bash
pnpm local:doctor   # verify local prerequisites and health endpoints
pnpm local:down     # stop Docker-backed services
pnpm api            # API only
pnpm autocontour:service  # auto-contour service only
pnpm repo:up        # Orthanc only
pnpm repo:logs      # Orthanc logs
```

The Vite dev server proxies `/api` to port `4000` and `/dicom-web` to port
`8042`, so no `.env` file is required for the default local workflow.

## Importing DICOM Data

ContourLab delegates repository uploads to Orthanc Explorer 2.

1. Open `http://127.0.0.1:3000/workspace`.
2. Open the Repository panel from the left toolbar.
3. Click **Open patient browser** and then **+ Import DICOM**.
4. Upload a folder of `.dcm` files in the Orthanc tab.
5. Return to ContourLab. The worklist refreshes when the tab regains focus.

For frontend-only development, you can still load local DICOM studies by drag
and drop without running the API or Orthanc.

## Auto-Contouring

With the full stack running, you can load a CT study, open the `AI` tab in the
Structure panel, run the available model profile, and import the result as an
editable AI draft structure set. The imported draft is not saved back to the
repository until you explicitly save or export it.

Current v1 constraints:

- CT-only model support
- demo-scale transport path from browser to service
- very large series are rejected before upload
- the generated contours are draft suggestions that require human review

## Repository Layout

```text
ContourLab/
├── apps/
│   ├── client/              React 18 + TypeScript contouring UI
│   ├── api/                 ASP.NET Core API and integration endpoints
│   └── autocontour-service/ Separate auto-contour job service
├── packages/
│   └── shared-types/        Shared TypeScript models
├── DHF/                     Design history file, traceability, and generated docs
├── docs/                    Contributor and architecture documentation
├── scripts/                 CI and local automation helpers
└── .github/workflows/       Product CI/CD and CR automation
```

## Testing

```bash
pnpm --filter @contourlab/client lint
pnpm -r test
pnpm -r typecheck
dotnet test apps/api.tests/ContourLab.Api.Tests.csproj
```

## CI

GitHub Actions validates:

- frontend lint, typecheck, tests, and production build
- ASP.NET API restore, build, and tests
- local integration smoke via `pnpm local:doctor`
- requirement-to-test coverage and DHF artifact generation

## DHF And MedHarness

ContourLab is maintained with a design history file in `DHF/` and a
change-request workflow powered by
[MedHarness](https://github.com/itercharles/MedHarness).

Most contributors only need to:

1. open or discuss an issue
2. implement or review code changes
3. run the relevant local checks before opening a PR

Maintainers use the DHF and CR automation for traceability, review staging, and
artifact generation. The current workflow contract lives in
[`docs/medharness_integration.md`](docs/medharness_integration.md).

## Deployment

The repository includes a self-hosted GitHub Actions deployment path built
around `docker-compose.deploy.yml`. The local developer workflow does not depend
on it. Maintainer-oriented deployment notes live in
[`docs/local_development.md`](docs/local_development.md#maintainer-deployment-notes).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) for branch, PR, testing, and DHF
expectations.
