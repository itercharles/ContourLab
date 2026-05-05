# Summary

Describe the change concisely.

## DHF Updates

- List exact DHF/ files changed (or: `No DHF update required`)
- Or state explicitly: `No DHF update required`

## Automated Validation

List the commands actually run, for example:

- `pnpm --filter @webtps/client lint`
- `pnpm --filter @webtps/client test`
- `pnpm --filter @webtps/client typecheck`
- `pnpm --filter @webtps/client build`
- `pnpm --filter @webtps/shared-types typecheck`
- `pnpm --filter @webtps/shared-types build`
- `dotnet build apps/api/api.csproj --configuration Release`
- `pnpm local:doctor`

## Manual Testing Required

Describe the manual testing still required, including concrete steps.

Example:

1. Start local services with `pnpm local:up`
2. Open `http://localhost:3000/workspace`
3. Select a patient and verify latest image and RTSS auto-open
4. Edit a contour and verify `Push Changes` enables
5. Push changes and verify a new RTSTRUCT is available in the repository

## Remaining Risk / Follow-up

List any residual risk, known gaps, or follow-up items.
