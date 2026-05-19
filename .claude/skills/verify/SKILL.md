---
name: verify
description: Verify that work is actually complete by running fresh evidence-gathering commands before making any completion claim
---

# Verification Before Completion

**NO COMPLETION CLAIMS WITHOUT FRESH VERIFICATION EVIDENCE.**

"Should work," "probably passes," and "looks good" are not verification. For a medical device codebase, false completion claims are a compliance risk, not just a quality issue.

## The Five-Step Gate

Before stating any task is done, complete all five steps:

1. **Identify** the exact command that proves your assertion
2. **Execute** it fresh — not from a previous run, not from memory
3. **Read** the full output and exit code
4. **Confirm** the results actually match your claim
5. **Only then** state your conclusion, citing the command and its output

## Standard Verification Commands for ContourLab

| Claim | Command |
|-------|---------|
| Frontend compiles | `pnpm --filter @contourlab/client typecheck` |
| Frontend tests pass | `pnpm --filter @contourlab/client test` |
| Frontend lint clean | `pnpm --filter @contourlab/client lint` |
| API builds | `dotnet build apps/api/api.csproj --no-restore -v q` |
| Shared types compile | `pnpm --filter @contourlab/shared-types typecheck` |
| Full stack healthy | `pnpm local:doctor` |
| DHF schema valid | `medharness --dhf DHF dhf validate schema` |

## What Is Not Verification

- Stating that a change "is straightforward" or "should not break anything"
- Relying on the PostToolUse hook output from a previous edit
- Trusting that CI will catch it
- Saying tests pass because you wrote them correctly

## Before Handoff Checklist

Run and show output for each applicable command:
- [ ] Typecheck passed
- [ ] Tests passed (name the count)
- [ ] Lint passed
- [ ] API builds (if API files were changed)
- [ ] `pnpm local:doctor` passes (if integration was touched)
- [ ] DHF schema valid (if DHF items were changed)

If any command fails, do not hand off. Fix and re-verify.
