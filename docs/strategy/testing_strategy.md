# Testing Strategy

## Objective

Testing exists to protect clinical workflow reliability, not to maximize raw
test count.

The test strategy should detect:

- repository workflow regressions
- contour review and RTSTRUCT behavior regressions
- integration mismatches between frontend, API, and DICOM repository
- failures introduced by AI-assisted implementation changes

## Test Pyramid

## 1. Fast Local Unit / Component Tests

Purpose:

- validate pure logic and isolated UI behavior

Examples:

- geometry calculators
- RTSTRUCT import/export helpers
- Zustand store transitions
- component interaction tests

Expected use:

- every functional code change should touch this layer first

## 2. Workspace Validation Tests

Purpose:

- ensure each workspace remains buildable and type-safe

Examples:

- frontend lint
- frontend typecheck
- frontend test suite
- frontend build
- shared-types typecheck and build
- API restore and build

Expected use:

- enforced in CI
- used before merge and before major local handoff

## 3. Integration Smoke Tests

Purpose:

- verify the runnable stack, not just isolated packages

Scope:

- local Orthanc repository starts
- API health endpoint responds
- frontend responds
- proxy and health expectations align with local development

Current mechanism:

- `pnpm local:doctor`

## 4. Workflow Regression Tests

Purpose:

- validate high-value end-to-end user paths

Priority candidate paths:

- patient select -> image load -> RTSS load
- contour edit -> local draft dirty -> push changes
- repository RTSTRUCT compare -> navigate changed ROI

These do not all need to be full browser E2E immediately, but they do need
repeatable verification coverage.

## Quality Gates

Minimum gates for infrastructure-hardening phase:

- `pnpm --filter @webtps/client lint`
- `pnpm --filter @webtps/client test`
- `pnpm --filter @webtps/client typecheck`
- `pnpm --filter @webtps/client build`
- `pnpm --filter @webtps/shared-types typecheck`
- `pnpm --filter @webtps/shared-types build`
- `dotnet build apps/api/api.csproj --configuration Release`
- `pnpm local:doctor`

## Test Evidence Expectations

For each non-trivial change, record:

- what was changed
- what was tested
- what was not tested
- any remaining risk

For changes with DHF impact, list the DHF items updated or intentionally left
unchanged with rationale.

## Testing Guardrails

Avoid:

- relying only on hand testing for workflow changes
- adding tests that assert implementation trivia instead of behavior
- adding flaky integration checks without deterministic setup
- claiming validation without naming the commands actually run
