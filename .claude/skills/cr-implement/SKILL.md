---
name: cr-implement
description: Implement an approved CR — read the plan on the CR, write code and tests, update DHF items, open PR
argument-hint: "<CR-ID>  e.g. CR-035"
---

# CR Implement

Given a CR ID, execute the full implementation cycle end-to-end.

## Step 1: Read the Plan

Read the approved plan on the CR itself (the design stage wrote it there):

```bash
medharness --dhf DHF item get <CR-ID>      # the plan is the implementation_notes field
```

Extract:
- **Intended outcomes** — the acceptance criteria
- **Scope** — which files/workspaces are affected
- **Implementation steps** — the ordered task list
- **Test plan** — what automated tests are required
- **DHF items** — which items need to be created or updated

If the CR has no `implementation_notes` or is not in `develop` state, stop and tell the user.

## Step 2: Check CR State

```bash
medharness --dhf DHF item get <CR-ID>
```

Confirm the status is `develop`. If not, do not proceed.

## Step 3: Create Implementation Branch

```bash
git checkout main && git pull origin main
git checkout -b feat/<CR-ID>-<short-title>
```

## Step 4: Implement

Follow the plan's implementation steps in order. Rules:

- **Shared types first** — if the plan changes the domain model, update `packages/shared-types/src/index.ts` before touching any app code
- **No scope creep** — implement exactly what the plan says; note any deviations
- **Tests alongside code** — write tests as part of each step, not after
  - Unit/component tests: colocate at `*.test.ts(x)`, annotate `@links:SRS-xxx`
  - E2e tests: add to `e2e/sys/` or `e2e/crs/` as appropriate, annotate `@links:SYS-xxx` or `@links:CRS-xxx`
- **UX** — invoke `/ux-design` before any new UI component

## Step 5: Validate Locally

Run **all** of the following that are relevant to the change:

```bash
pnpm --filter @contourlab/client typecheck
pnpm --filter @contourlab/client lint
pnpm --filter @contourlab/client test
pnpm -r typecheck                          # if shared-types changed
dotnet build apps/api/api.csproj --configuration Release  # if API changed
```

Do not proceed if any command fails.

## Step 6: Update DHF Items

Create or update the DHF items listed in the plan directly in this repo's `DHF/items/`:

- New feature: UC → CRS → SYS → SRS → SWDD
- New SOUP: SOUP item + `uses_soup` on affected SRS
- Architecture decision: SYSARCH + SWDD update

Validate:
```bash
medharness --dhf DHF verify dhf
```

**Include DHF changes in the same Implementation PR** — the single-repo model means product code and DHF items live together.

## Step 7: Open Implementation PR

```bash
gh pr create \
  --title "feat(<CR-ID>): <title from the plan>" \
  --body "$(cat <<'EOF'
## Summary
<2-3 bullet points from intended outcomes>

## CR
<CR-ID> — <link to DHF CR>

## DHF items updated
<list exact DHF/items/ file paths, or "No DHF update required — <reason>">

## Validation run
- [ ] `pnpm --filter @contourlab/client typecheck` — ✓
- [ ] `pnpm --filter @contourlab/client lint` — ✓
- [ ] `pnpm --filter @contourlab/client test` — ✓ (N tests)
- [ ] <other commands run>

## Manual testing still required
<concrete steps>

## Residual risks
<what remains incomplete or unverified>
EOF
)"
```

## Step 8: CR Completes Automatically

When the Implementation PR merges, `cr-complete.yml` checks the CR. If it is already `completed` (the pipeline records that on the branch when the code is approved) nothing more happens. If not, it opens a `chore: complete <CR-ID>` PR that moves the CR to `completed`: merge it.
