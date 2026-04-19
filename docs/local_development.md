# Local Development

WebTPS provides a small set of local environment commands for a complete
frontend, API, and DICOM repository setup.

## One-Time Setup

```bash
pnpm local:setup
```

This command checks required tooling, installs JavaScript dependencies, restores
the ASP.NET API project, and starts the local Orthanc DICOM repository.

Required tools:

- Node.js 20+
- pnpm 9+
- .NET SDK 10
- Docker with Docker Compose support

If pnpm is missing, install or activate it through Corepack:

```bash
corepack enable
corepack prepare pnpm@latest --activate
```

Supported platforms:

- macOS
- Linux
- Windows 10/11 with PowerShell, Windows Terminal, or WSL

On Windows, use Docker Desktop with the WSL2 backend enabled and make sure
Docker Desktop is running before executing setup/start commands.

Required local ports:

- `3000` for the Vite frontend.
- `4000` for the ASP.NET API.
- `8042` for the Orthanc HTTP/DICOMweb service.

## Start WebTPS

```bash
pnpm local:up
```

This command starts:

- Orthanc DICOM repo with persisted Docker volume data.
- ASP.NET API on `http://127.0.0.1:4000`.
- Vite frontend on `http://127.0.0.1:3000`.

Open:

```text
http://127.0.0.1:3000/workspace
```

Press `Ctrl+C` to stop API/frontend processes started by this command. Orthanc
continues running so DICOM data remains available.

If API or frontend are already running, `local:up` detects the occupied ports and
prints the active URLs instead of starting duplicate processes.

## Check The Environment

```bash
pnpm local:doctor
```

The doctor command checks required tooling, ports, and local HTTP health.

On Windows, run the doctor command from the same shell family you use for
development. If Docker checks fail, verify that Docker Desktop is running and
that the current user has access to Docker.

## Stop The Local Repository

```bash
pnpm local:down
```

This stops the Docker Compose services. Orthanc data remains in the Docker
volume unless the volume is explicitly deleted.
