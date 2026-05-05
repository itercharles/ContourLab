# Software Integration Plan

**Standard:** IEC 62304:2006+AMD1:2015 §5.1.5, §5.6
**Status:** Active

## 1. Purpose

This document describes the plan for integrating WebTPS software items and performing
integration testing in accordance with IEC 62304 §5.6.

## 2. Software Item Decomposition

WebTPS is composed of the following software items:

| Software Item | Technology | Role |
|---|---|---|
| `apps/client` | React 18 + TypeScript | Clinical UI, viewport rendering, workflow state |
| `apps/api` | ASP.NET Core 10 (C#) | HTTP gateway, service integration, security boundary |
| `packages/shared-types` | TypeScript | Canonical domain model shared between client and API |
| Orthanc (DICOM repository) | Docker | External DICOM storage and DICOMweb interface |

## 3. Integration Sequence

Software items are integrated incrementally, bottom-up:

1. **Shared types baseline** — `@webtps/shared-types` is built and typechecked first.
   All domain model changes originate here.

2. **API unit integration** — `apps/api` imports shared types and is built and tested
   independently of the frontend.

3. **Frontend unit integration** — `apps/client` imports shared types, is linted,
   typechecked, and verified with Vitest (Test-SRS).

4. **Full stack integration** — frontend + API + Orthanc are started together.
   The `dev-integration` CI phase runs `pnpm local:doctor` to confirm all services
   respond correctly and proxies are configured.

5. **System-level integration testing** — Playwright Test-SYS tests drive the browser
   against the full running stack, verifying integration across all software item boundaries.

## 4. Integration Testing

Integration tests are defined as `SWTEST` items with `linked_requirements` pointing to
`SYS-xxx` items and executed via the `verify-sys` CI phase.

**CI integration phases:**

| CI Job | What is integrated | Pass criteria |
|---|---|---|
| `dev-integration` | frontend + API + Orthanc startup | All health endpoints respond; `local:doctor` passes |
| `verify-sys` | Full stack functional behaviour | All Playwright Test-SYS tests PASS |

**Artifact:** `verify-sys-junit` (JUnit XML, uploaded on every CI run)

## 5. Interface Definitions

Software item interfaces are defined and enforced by `@webtps/shared-types`:

- **Client ↔ API**: REST over `/api/*` (proxied by Vite in dev, served directly in prod).
  Request/response types defined in `packages/shared-types/src/index.ts`.
- **Client ↔ Orthanc**: DICOMweb over `/dicom-web/*` (proxied). Standard WADO-RS/STOW-RS.
- **API ↔ Orthanc**: DICOMweb direct call from API services.
- **WebSocket**: `/ws` proxy for real-time updates (viewport sync, progress).

Any change to a shared interface requires a change to `shared-types` first, followed
by updates to both client and API consumers, validated by `pnpm -r typecheck`.

## 6. Test Procedure Evaluation

Integration test procedures are evaluated for adequacy before release:

- All SYS items have at least one linked passing Test-SYS test case
- Test cases have unambiguous pass/fail criteria
- Tests are repeatable and independent of each other
- The test environment matches the validated configuration documented in the Validation Plan

## 7. Regression Testing

All integration tests re-run on every pull request. CI enforces green build before merge.
Test results are stored as GitHub Actions artifacts and feed into the DHF traceability report.
