# Local Development

ContourLab ships with a small set of local commands for frontend, API, and
Orthanc-backed DICOM repository development.

## Prerequisites

| Tool | Minimum version | Check |
| --- | --- | --- |
| Node.js | 20 | `node --version` |
| pnpm | 9 | `pnpm --version` |
| .NET SDK | 10 | `dotnet --version` |
| Docker + Compose | current | `docker compose version` |

Required local ports: `3000` (frontend), `4000` (API), `8042` (Orthanc).

No `.env` file is required for the default developer setup.

## Frontend-Only Mode

If you only need the React client:

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000/workspace`. In this mode the Repository panel is
empty because no backend is running, but you can still drag local DICOM studies
onto the Navigator drop zone.

## Full Stack Setup

One-time bootstrap:

```bash
pnpm local:setup
```

Start the full stack:

```bash
pnpm local:up
```

Default local endpoints:

| Service | URL |
| --- | --- |
| Frontend | `http://127.0.0.1:3000/workspace` |
| API | `http://127.0.0.1:4000/api/health` |
| Orthanc DICOM repo | `http://127.0.0.1:8042` |
| DICOMweb proxy | `http://127.0.0.1:3000/dicom-web` |

If the frontend or API is already running, `pnpm local:up` reuses the active
process instead of starting a duplicate.

## Common Commands

```bash
pnpm local:doctor   # verify tools, ports, and health endpoints
pnpm local:down     # stop Docker-backed services
pnpm api            # API only
pnpm repo:up        # Orthanc only
pnpm repo:logs      # Orthanc logs
```

To wipe the local Orthanc data volume:

```bash
pnpm local:down
docker volume rm contourlab_orthanc-db
```

## Importing DICOM Data

ContourLab opens Orthanc Explorer 2 for repository uploads.

1. Open `http://127.0.0.1:3000/workspace`.
2. Open the Repository panel from the left toolbar.
3. Click **Open patient browser**.
4. Click **+ Import DICOM** to open Orthanc Explorer in a new tab.
5. Drag a study folder or ZIP archive onto the upload area.
6. Return to ContourLab. The worklist refreshes when the tab regains focus.

You can also open Orthanc directly at
`http://127.0.0.1:8042/ui/app/index.html`.

Public sample datasets suitable for development testing:

- [TCIA](https://www.cancerimagingarchive.net/)
- [OsiriX DICOM sample library](https://www.osirix-viewer.com/resources/dicom-image-library/)

## Maintainer Deployment Notes

The repository includes a self-hosted deployment path for teams that want a
shared demo or review environment. The default deploy stack publishes the app on
ports `3001` (frontend), `4001` (API), and `8042` (Orthanc) on the target host.

Example external endpoints:

| Service | Example URL |
| --- | --- |
| Frontend | `http://<host>:3001` |
| API | `http://<host>:4001` |
| Orthanc | `http://<host>:8042` |

The deploy stack is defined in
[`../docker-compose.deploy.yml`](../docker-compose.deploy.yml). DICOM data is
persisted under `${CONTOURLAB_ORTHANC_DATA_DIR:-./deploy-data/orthanc-db}`.

### Runner Routing

Workflow runner selection is controlled through repository variables so the repo
can move between hosted and self-hosted capacity without code changes:

- `CONTOURLAB_DEFAULT_RUNS_ON_JSON`
- `CONTOURLAB_CODEGEN_RUNS_ON_JSON`
- `CONTOURLAB_DEPLOY_RUNS_ON_JSON`

Populate each variable with a JSON array of runner labels that exist in your own
runner fleet, for example:

```text
["self-hosted","linux","contourlab-ci"]
```

The CR lifecycle code-generation jobs should stay on a separate runner pool from
normal CI if they both push commits and then wait on follow-up CI runs.
