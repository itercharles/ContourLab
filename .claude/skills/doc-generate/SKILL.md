---
name: doc-generate
description: Render all DHF specification documents, traceability and SBOM from current item state
---

# Doc Generate

Render the DHF documents from the current item state. Rendered documents are not stored in the
DHF: `build release` writes them to an output directory, and without `--write` it is a preview
that changes nothing in the repository.

## Step 1: Check the DHF first

```
medharness --dhf DHF verify dhf
```

If it fails, stop and report the errors. Do not render from an invalid DHF.

## Step 2: Render

```
medharness --dhf DHF build release --version 0.0.0-preview --out-dir /tmp/dhf-preview
```

Use `--doc-format pdf` for PDF output (needs `medharness[docs]` plus cairo/pango). Add
`--junit <dir>` for each JUnit results directory to include test evidence in the traceability
report.

## Step 3: Report results

List what was written under `/tmp/dhf-preview` (specifications, traceability, SBOM), and any
`WARN [release]` lines from stderr. If the command exits non-zero, report the `errors` from its
JSON output (for example an incomplete CR or an unassessed defect).
