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

### Import through the WebTPS UI (recommended)

1. Open `http://127.0.0.1:3000/workspace`.
2. Click the **Navigator** button in the left toolbar (folder icon) to open the
   left sidebar.
3. In the Repository panel, click **"Open patient browser"**.
4. In the patient browser modal, click **"+ Import DICOM"** in the top-right of
   the header bar.
5. A file picker opens. Select a folder containing `.dcm` files — the picker
   recurses into subdirectories, so you can select a study root folder.
6. Wait for the import to complete (a status message appears at the bottom of
   the panel).
7. The patient list refreshes automatically. Click a patient row to open their
   workspace and load the image set.

You can also import via **Settings → Import DICOM Data** — useful for a bulk
initial load before opening the workspace.

### Import via Orthanc web UI

For direct bulk uploads or to inspect stored instances:

1. Open `http://127.0.0.1:8042` in your browser.
2. Click **Upload** and drag DICOM files or a ZIP archive onto the upload area.

### Sample DICOM datasets

Public CT datasets suitable for development testing:

- [TCIA (The Cancer Imaging Archive)](https://www.cancerimagingarchive.net/) —
  free public datasets including head/neck, thorax, and pelvis CT series.
- [OsiriX DICOM sample library](https://www.osirix-viewer.com/resources/dicom-image-library/) —
  small pre-packaged studies in ZIP format, quick to download.

Download and extract a study, then import the folder through the UI steps above.

## Deployed Build (self-hosted CI/CD)

The GitHub Actions deploy workflow builds the app and serves it via PM2 on
**different ports** to avoid conflicting with the local dev server:

| | Dev server | Deployed build |
|--|------------|----------------|
| Frontend | `http://127.0.0.1:3000` | `http://AP-vS9RB5xoet8i.int.elekta.com:3001` |
| API | `http://127.0.0.1:4000` | `http://AP-vS9RB5xoet8i.int.elekta.com:4001` |
| Orthanc | `http://127.0.0.1:8042` | `http://127.0.0.1:8042` (shared) |

Both can run at the same time with no conflicts. The deployed build binds on
`0.0.0.0` — anyone on the Elekta network can reach it at
`AP-vS9RB5xoet8i.int.elekta.com`.

### First-time manual deploy

Before the automated workflow runs, seed PM2 manually once:

```powershell
cd C:\code\Prototype\webtps

# Build frontend
pnpm --filter @webtps/client build

# Start frontend on port 3001, proxying API on 4001
$env:WEBTPS_API_PORT = "4001"
pm2 start "pnpm --filter @webtps/client preview --host 0.0.0.0 --port 3001" --name webtps-client

# Publish and start API on port 4001
dotnet publish apps/api/api.csproj --configuration Release --output apps/api/publish
pm2 start "dotnet apps/api/publish/WebTPS.Api.dll --urls http://0.0.0.0:4001" --name webtps-api

pm2 save
```

### PM2 management

```powershell
pm2 list                   # show all processes and status
pm2 logs webtps-client     # stream frontend logs
pm2 logs webtps-api        # stream API logs
pm2 restart webtps-client  # manual restart
pm2 stop all               # stop deployed build (frees ports 3001/4001)
pm2 start all              # resume deployed build
```

Stopping PM2 does not affect the dev server — `pnpm dev` and `pnpm api` run
independently on their own ports.
