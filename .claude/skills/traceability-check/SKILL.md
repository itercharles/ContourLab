---
name: traceability-check
description: Show which SYS, SRS, and CRS requirements have no test coverage, and suggest what tests to add
---

# Traceability Check

Identify requirement gaps — items that exist in the DHF but have no passing test linked via `@links:`.

## Step 1: Find All Annotated Tests

Search for all `@links:` annotations in the codebase:

```bash
grep -rn "@links:" apps/client/src apps/client/e2e apps/api.tests \
  --include="*.ts" --include="*.tsx" --include="*.cs" \
  | grep -oE '@links:[A-Z]+-[0-9]+' | sort | uniq -c | sort -rn
```

This shows which DHF items are currently covered by tests and how many tests each has.

## Step 2: List All Verifiable Requirements

```bash
# SRS items
grep -l "verification_method" ../WebTPS-DHF/DHF/items/03_req_srs/*.yaml \
  | xargs grep -l "Test" | xargs -I{} basename {} .yaml | sort

# SYS items
grep -l "verification_method" ../WebTPS-DHF/DHF/items/02_req_sys/*.yaml \
  | xargs grep -l "Test" | xargs -I{} basename {} .yaml | sort

# CRS items (validation)
ls ../WebTPS-DHF/DHF/items/01_req_crs/*.yaml \
  | xargs -I{} basename {} .yaml | sort
```

## Step 3: Identify Gaps

Compare Step 1 output against Step 2. Report:

| Requirement | Title (from YAML) | Test count | Location |
|-------------|-------------------|------------|----------|
| SRS-017 | ... | 2 | api.tests |
| SYS-002 | ... | 0 | **MISSING** |
| ... | | | |

Flag any item with 0 tests as **NOT VERIFIED**.

## Step 4: Suggest Next Tests

For each NOT VERIFIED item, recommend the test type and location:

| Item | Suggested test type | Suggested location |
|------|--------------------|--------------------|
| SYS-002 | Playwright e2e | `e2e/sys/` |
| SRS-00x | Vitest unit/component | colocated with component |
| CRS-00x | Playwright e2e | `e2e/crs/` |

Rules:
- **SYS** items → Playwright system test (`e2e/sys/`), `@links:SYS-xxx`
- **SRS** items → Vitest unit/component test, `@links:SRS-xxx`; or .NET xUnit for API SRS, `@links:SRS-xxx`
- **CRS** items → Playwright clinical workflow test (`e2e/crs/`), `@links:CRS-xxx`

## Step 5: Summary

State:
- Total verifiable requirements: N
- Covered: N (%)
- NOT VERIFIED: list them
- Recommended next action: which item to tackle first and why
