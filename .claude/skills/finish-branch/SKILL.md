---
name: finish-branch
description: Complete a development branch — verify tests, check PR requirements, and offer structured completion options
---

# Finish Branch

Use this when development work on a branch is done and it's time to hand off or merge.

## Step 1: Verify Tests Pass

Run the full validation suite before anything else. If anything fails, stop here and fix it first.

```
pnpm --filter @webtps/client typecheck
pnpm --filter @webtps/client test
pnpm --filter @webtps/client lint
dotnet build apps/api/api.csproj --no-restore -v q
```

**Do not proceed if any command fails.**

## Step 2: Run Post-Implement Checklist

Invoke `/post-implement` and confirm all 8 checklist items are addressed, especially:
- DHF impact assessed and documented
- Branch/PR requirements determined
- Manual test plan written

## Step 3: Determine Base Branch

```
git log --oneline main..HEAD
```

Identify what's been added since `main` and confirm the branch name follows convention:
- `feature/short-description`
- `fix/short-description`
- `refactor/short-description`
- `claude/short-description` (Claude-authored changes)

## Step 4: Choose One of Four Options

Present exactly these options without elaboration:

1. **Merge to main locally** — for docs/process changes or tooling with no DHF impact
2. **Push and open a Pull Request** — required for any functional change (product behavior, UI, API, shared types, DHF items)
3. **Keep branch as-is** — leave open for later
4. **Discard** — requires typing "discard" to confirm; irreversible

**Any change that touches product behavior, UI, API contracts, shared types, or DHF items requires Option 2.**

## Step 5: If Opening a PR

The PR description must include:
- Summary of the change
- Change class (`feature` / `bugfix` / `refactor` / `docs/process`)
- DHF files changed, or explicit statement that no DHF update was needed
- Validation commands run and their results
- Manual test steps still required
- Residual risks or follow-up items

After creating the PR, note that CI and review comments must be monitored until the PR is resolved — the work is not done at PR creation.
