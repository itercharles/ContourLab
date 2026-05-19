---
paths:
  - "apps/api/**"
---

# API Rules (apps/api)

## Stack
- ASP.NET Core 10 Web API, C#
- OpenAPI via `Microsoft.AspNetCore.OpenApi`
- Dev server: `http://127.0.0.1:4000`
- Health endpoint: `GET /api/health`

## Conventions
- All endpoints under `/api/` prefix
- Return `ProblemDetails` for errors (RFC 7807)
- DICOMweb requests are proxied through the frontend Vite dev server (not direct from client to Orthanc)
- Do not add NuGet packages without DHF SOUP assessment

## Build & Validate
- Build: `dotnet build apps/api/api.csproj --no-restore -v q`
- Run: `cd apps/api && dotnet run --launch-profile http`
- Restore: `dotnet restore apps/api/api.csproj`

## Architecture Constraints
- API is a thin gateway — no business logic, no DICOM manipulation
- DICOM operations happen in the frontend via Cornerstone.js and dcmjs
- Shared domain types live in `packages/shared-types` and must not be duplicated in the API
