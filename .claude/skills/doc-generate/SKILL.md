---
name: doc-generate
description: Generate all DHF specification documents from current item state
---

# Doc Generate

Generate all DHF specification documents from the current item state.

## Step 1: Validate first

Run schema validation before generating to catch errors early:
```
python -m medharness --dhf DHF dhf validate schema
```

If validation fails, stop and report the errors. Do not generate with invalid items.

## Step 2: Generate documents

```
python -m medharness --dhf DHF dhf doc generate ALL
```

## Step 3: Report results

List the files that were generated or updated in `DHF/documents/`. Note any documents that failed to generate.

## Step 4: Optional export

If the user wants PDF or other export formats:
```
python -m medharness --dhf DHF dhf doc export ALL
```
