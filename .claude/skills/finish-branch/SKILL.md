---
name: finish-branch
description: Complete a development branch — run validation, assess DHF impact, and open PR or merge
---

# Finish Branch

Use when development work on a branch is done. Works through validation, DHF review, and delivery in one pass.

## Step 1: Validate

Run all commands relevant to the change. Do not skip any that apply.

```bash
pnpm --filter @contourlab/client typecheck
pnpm --filter @contourlab/client lint
pnpm --filter @contourlab/client test
pnpm -r typecheck                          # if shared-types changed
dotnet build apps/api/api.csproj --configuration Release  # if API changed
```

**Stop here if anything fails.**

## Step 2: Scope and DHF Review

Answer these before opening a PR:

- Did the implementation stay within the agreed scope?
- Does it align with `DHF/documents/specs/crs_specification.md.j2` and the active roadmap phase?
- **DHF impact**: which DHF files changed, or state explicitly why no DHF update was needed
- **ADR**: was an architecture boundary crossed? If so, was an ADR added?
- **SOUP**: was a new npm/NuGet/container dependency introduced? If so, was a SOUP item created?

## Step 3: Determine Delivery Path

Check what's changed since main:
```bash
git log --oneline main..HEAD
```

Choose one:

1. **Open a PR** — required for any change that touches product behavior, UI, API, shared types, or DHF items
2. **Merge locally** — only for docs/process changes with no DHF impact and no product behavior change
3. **Keep branch open** — if work is incomplete
4. **Discard** — type "discard" to confirm; irreversible

## Step 4: PR Description (if opening PR)

Title format: `feat(CR-NNN): description` or `fix: description`

Body must include:
- **Summary**: what changed and why (2–4 bullet points)
- **CR**: CR ID and link, or "No CR — docs/process change"
- **DHF files changed**: exact paths, or "No DHF update required — <reason>"
- **Validation run**: every command executed and whether it passed
- **Manual testing still required**: concrete steps
- **Residual risks**: what remains incomplete or unverified

## Step 5: After PR is Open

- Monitor CI — fix any failures on the branch
- Address every review comment explicitly: fix / reject with reason / defer / ask
- Work is done when the PR merges and CI passes — not at PR creation
