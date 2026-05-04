---
name: cr-implement
description: Implement an approved CR — read the Plan Spec, write code and tests, update DHF items, open PR
argument-hint: "<CR-ID>  e.g. CR-035"
---

# CR Implement

Given a CR ID, execute the full implementation cycle end-to-end.

## Step 1: Read the Plan Spec

Locate and read the approved Plan Spec in the DHF repo:

```
../WebTPS-DHF/docs/cr-specs/<CR-ID>-Spec.md
```

Extract:
- **Intended outcomes** — the acceptance criteria
- **Scope** — which files/workspaces are affected
- **Implementation steps** — the ordered task list
- **Test plan** — what automated tests are required
- **DHF items** — which items need to be created or updated

If the spec does not exist or the CR is not in `implementing` state, stop and tell the user.

## Step 2: Check CR State

```bash
cd ../WebTPS-DHF
python -m compliantflow --dhf DHF dhf item get <CR-ID>
```

Confirm state is `implementing`. If not, do not proceed.

## Step 3: Create Implementation Branch

```bash
git checkout main && git pull origin main
git checkout -b feat/<CR-ID>-<short-title>
```

## Step 4: Implement

Follow the spec's implementation steps in order. Rules:

- **Shared types first** — if the spec changes the domain model, update `packages/shared-types/src/index.ts` before touching any app code
- **No scope creep** — implement exactly what the spec says; note any deviations
- **Tests alongside code** — write tests as part of each step, not after
  - Unit/component tests: colocate at `*.test.ts(x)`, annotate `@links:SRS-xxx`
  - E2e tests: add to `e2e/sys/` or `e2e/crs/` as appropriate, annotate `@links:SYS-xxx` or `@links:CRS-xxx`
- **UX** — invoke `/ux-design` before any new UI component

## Step 5: Validate Locally

Run **all** of the following that are relevant to the change:

```bash
pnpm --filter @webtps/client typecheck
pnpm --filter @webtps/client lint
pnpm --filter @webtps/client test
pnpm -r typecheck                          # if shared-types changed
dotnet build apps/api/api.csproj --configuration Release  # if API changed
```

Do not proceed if any command fails.

## Step 6: Update DHF Items

In `../WebTPS-DHF`, create or update the DHF items listed in the spec:

- New feature: UC → CRS → SYS → SRS → SWDD (use `/req-manage` in DHF context)
- New SOUP: SOUP item + `uses_soup` on affected SRS
- Architecture decision: SYSARCH + SWDD update

Validate:
```bash
cd ../WebTPS-DHF
python -m compliantflow --dhf DHF dhf validate schema
```

**Commit DHF changes on a separate branch in WebTPS-DHF** — do not mix DHF and product code in the same PR.

## Step 7: Open Implementation PR

```bash
gh pr create \
  --title "feat(<CR-ID>): <title from spec>" \
  --body "$(cat <<'EOF'
## Summary
<2-3 bullet points from intended outcomes>

## CR
<CR-ID> — <link to DHF CR>

## DHF items updated
<list exact file paths, or "No DHF update required — <reason>">

## Validation run
- [ ] `pnpm --filter @webtps/client typecheck` — ✓
- [ ] `pnpm --filter @webtps/client lint` — ✓
- [ ] `pnpm --filter @webtps/client test` — ✓ (N tests)
- [ ] <other commands run>

## Manual testing still required
<concrete steps>

## Residual risks
<what remains incomplete or unverified>
EOF
)"
```

## Step 8: Transition CR to Completed (after PR merges)

Once the Implementation PR is merged, transition the CR:

```bash
cd ../WebTPS-DHF
python -m compliantflow --dhf DHF dhf item transition <CR-ID> completed --by "Claude"
git add DHF/items/09_cr/<CR-ID>.yaml
git commit -m "cr: close <CR-ID> — implementation merged"
git push origin main
```
