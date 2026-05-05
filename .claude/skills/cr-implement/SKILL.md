---
name: cr-implement
description: Implement an approved CR — read the Plan Spec, write code and tests, update DHF items, open PR
argument-hint: "<CR-ID>  e.g. CR-035"
---

# CR Implement

Given a CR ID, execute the full implementation cycle end-to-end.

## Step 1: Read the Plan Spec

Locate and read the approved Plan Spec in this repo:

```
docs/cr-specs/<CR-ID>-Spec.md
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
medharness --dhf DHF dhf item get <CR-ID>
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

Create or update the DHF items listed in the spec directly in this repo's `DHF/items/`:

- New feature: UC → CRS → SYS → SRS → SWDD
- New SOUP: SOUP item + `uses_soup` on affected SRS
- Architecture decision: SYSARCH + SWDD update

Validate:
```bash
medharness --dhf DHF dhf validate schema
```

**Include DHF changes in the same Implementation PR** — the single-repo model means product code and DHF items live together.

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
<list exact DHF/items/ file paths, or "No DHF update required — <reason>">

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

## Step 8: CR Completes Automatically

When the Implementation PR merges, `cr-complete.yml` automatically transitions the CR to `completed` and commits the state change to `DHF/items/09_cr/<CR-ID>.yaml`. No manual step needed.
