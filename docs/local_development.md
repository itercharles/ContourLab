# Local Development

WebTPS provides a small set of local environment commands for a complete
frontend, API, and DICOM repository setup.

## Prerequisites

| Tool | Minimum version | Check |
|------|----------------|-------|
| Node.js | 20 | `node --version` |
| pnpm | 9 | `pnpm --version` |
| .NET SDK | 10 | `dotnet --version` |
| Docker + Compose | any current | `docker compose version` |

**Node version managers:** If you use `nvm`, `fnm`, or `volta`, switch to Node
20 before running any commands:

```bash
nvm install 20 && nvm use 20   # nvm
fnm use 20                     # fnm
```

**pnpm missing:** Enable via Corepack (bundled with Node.js 16.9+):

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

**Platform notes:**
- macOS and Linux work as-is.
- Windows 10/11: install Docker Desktop with the **WSL2 backend** enabled.
  Ensure Docker Desktop is running before executing setup or start commands.
  Run commands from PowerShell, Windows Terminal, or a WSL shell — all three
  work.

**Required local ports:** `3000` (frontend), `4000` (API), `8042` (Orthanc).

**No `.env` file needed.** The Vite dev server proxies `/dicom-web` to
`http://localhost:8042` and `/api` to `http://localhost:4000` automatically.
All defaults work out of the box.

## Frontend-Only Mode

If you only need the React client and do not have Docker or the .NET SDK
installed, you can run the frontend standalone:

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000/workspace`. In this mode the Repository panel shows
an empty worklist (no Orthanc backend), but you can still load DICOM files
directly by dragging a folder onto the file drop zone in the Navigator panel.

## One-Time Setup

```bash
pnpm local:setup
```

Checks required tooling, installs JavaScript dependencies, restores the ASP.NET
API project, and starts the local Orthanc DICOM repository.

## Start WebTPS

```bash
pnpm local:up
```

Starts the complete development stack:

| Service | URL |
|---------|-----|
| Frontend | `http://127.0.0.1:3000/workspace` |
| API | `http://127.0.0.1:4000/api/health` |
| Orthanc DICOM repo | `http://127.0.0.1:8042` |
| DICOMweb (via proxy) | `http://127.0.0.1:3000/dicom-web` |

Press `Ctrl+C` to stop API/frontend processes. Orthanc continues running so
DICOM data remains available across restarts.

If the API or frontend are already running, `local:up` detects the occupied
ports and prints the active URLs instead of starting duplicate processes.

## Check The Environment

```bash
pnpm local:doctor
```

Checks required tooling, ports, and local HTTP health endpoints.

On Windows, run from the same shell family you use for development. If Docker
checks fail, verify that Docker Desktop is running and that your user account has
access to the Docker socket.

## Stop The Local Repository

```bash
pnpm local:down
```

Stops the Docker Compose services. Orthanc data remains in the Docker volume
(`webtps_orthanc-db`) unless explicitly deleted.

To wipe all stored DICOM data and start fresh:

```bash
pnpm local:down
docker volume rm webtps_orthanc-db
```

## Importing DICOM Data

The local Orthanc repository has **no authentication** — its web UI at
`http://127.0.0.1:8042` requires no login and is open by design for local
development.

### Import through the WebTPS UI

WebTPS does not handle DICOM file upload itself. Both **Patient browser →
Import DICOM** and **Settings → Import DICOM Files** open the Orthanc Explorer
upload UI in a new tab. After uploading there, return to WebTPS — the worklist
auto-refreshes when the tab regains focus.

1. Open `http://127.0.0.1:3000/workspace`.
2. Click the **Navigator** button in the left toolbar (folder icon) to open the
   left sidebar.
3. In the Repository panel, click **"Open patient browser"**.
4. In the patient browser modal, click **"+ Import DICOM"** in the top-right of
   the header bar. A new tab opens at Orthanc Explorer 2
   (`http://<host>:8042/ui/app/index.html`). The host comes from the configured
   DICOMweb endpoint, so it works the same in local and LAN setups without code
   changes.
5. In the Orthanc tab, drag the study folder onto the upload area. Orthanc
   handles RTSTRUCT, RTPLAN, and RTDOSE alongside CT/MR slices.
6. Return to the WebTPS tab. The patient list auto-refreshes — click a patient
   row to open their workspace and load the image set.

The redirect button is also available from **Settings → Import DICOM Data**.

### Import via Orthanc web UI directly

You can also navigate to Orthanc Explorer directly without going through
WebTPS:

1. Open `http://127.0.0.1:8042/ui/app/index.html` (or the same URL on your
   LAN IP from another device).
2. Click **Upload** and drag DICOM files or a ZIP archive onto the upload area.

### Sample DICOM datasets

Public CT datasets suitable for development testing:

- [TCIA (The Cancer Imaging Archive)](https://www.cancerimagingarchive.net/) —
  free public datasets including head/neck, thorax, and pelvis CT series.
- [OsiriX DICOM sample library](https://www.osirix-viewer.com/resources/dicom-image-library/) —
  small pre-packaged studies in ZIP format, quick to download.

Download and extract a study, then import the folder through the UI steps above.

## Deployed Build (self-hosted CI/CD)

The `CI Pipeline` deploy job runs on a Linux self-hosted runner and deploys the
app as a Docker Compose stack. The deployed build uses **different host ports**
to avoid conflicting with the local dev server:

| | Dev server | Deployed build |
|--|------------|----------------|
| Frontend | `http://127.0.0.1:3000` | `http://AP-vS9RB5xoet8i.int.elekta.com:3001` |
| API | `http://127.0.0.1:4000` | `http://AP-vS9RB5xoet8i.int.elekta.com:4001` |
| Orthanc | `http://127.0.0.1:8042` | `http://AP-vS9RB5xoet8i.int.elekta.com:8042` |

Both can run at the same time with no conflicts. The deployed build binds on
`0.0.0.0` — anyone on the Elekta network can reach it at
`AP-vS9RB5xoet8i.int.elekta.com`.

The deployed stack is defined in [`../docker-compose.deploy.yml`](../docker-compose.deploy.yml):

- `webtps-client` serves the Vite production build through nginx on host port `3001`.
- `webtps-api` serves ASP.NET Core on host port `4001`.
- `webtps-orthanc` serves Orthanc on host ports `8042` and `4242`.
- DICOM data is bind-mounted from the host. By default it lives under
  `./deploy-data/orthanc-db`; set `WEBTPS_ORTHANC_DATA_DIR` on the runner to use
  a fixed data disk path such as `/srv/webtps/orthanc-db`.

### First-time runner setup

The Linux runner only needs Git, Docker Engine, the Docker Compose plugin, and a
GitHub Actions self-hosted runner registered with the `self-hosted` and `linux`
labels. Node.js, pnpm, and .NET are supplied by Docker build images.

Before the automated workflow runs, confirm Docker access from the runner user:

```bash
docker version
docker compose version
```

The CD workflow creates the data directory automatically. It only starts or
updates the persistent DICOM repository when the `webtps-orthanc` container is
missing, stopped, or running a different image ID; if the container is already
running with the expected image, CD leaves it unchanged. To do the same check
manually:

```bash
mkdir -p "${WEBTPS_ORTHANC_DATA_DIR:-./deploy-data/orthanc-db}"
docker compose -f docker-compose.deploy.yml up -d --no-recreate dicom-repo
docker compose -f docker-compose.deploy.yml ps
curl -sf http://127.0.0.1:8042/system
```

### Manual deploy and management

Deploying the application updates only the API and frontend containers. It does
not recreate Orthanc or remount DICOM data:

```bash
docker compose -f docker-compose.deploy.yml up -d --build --no-deps api client
docker compose -f docker-compose.deploy.yml ps
docker compose -f docker-compose.deploy.yml logs -f
docker compose -f docker-compose.deploy.yml restart api client
```

To stop the app without touching the repository:

```bash
docker compose -f docker-compose.deploy.yml stop api client
```

Avoid `docker compose down` for routine app releases because it stops the DICOM
repository as well. To wipe deployed DICOM data intentionally, stop Orthanc and
delete the host directory configured by `WEBTPS_ORTHANC_DATA_DIR`.
