---
name: dhf-validate
description: Validate DHF item schemas and run the DHF utils test suite
---

# DHF Validate

Run full local DHF validation:

## 1. Schema Validation

Validate all DHF item YAML files against their type schemas:
```
python -m medharness --dhf DHF dhf validate schema
```

Report any schema errors with the file path and field that failed.

## 2. DHF Utils Test Suite

Run the utility test suite:
```
```

Report test results: passed, failed, skipped counts. Show full output for any failures.

## 3. Summary

After both checks, state:
- Whether schema validation passed or failed (with error details if failed)
- Whether all tests passed (with failure details if not)
- Whether the DHF is in a valid state for a PR
