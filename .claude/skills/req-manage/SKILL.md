---
name: req-manage
description: Analyze and manage UC, CRS, SYS, and SRS requirement coverage and traceability
---

> **Primarily CI-invoked** — the CR lifecycle workflow runs this automatically during spec and design generation. Invoke manually only to review or fix DHF impact outside the automated pipeline.


# req-manage skill

## Purpose

Guides requirement creation, coverage review, and traceability validation in
the WebTPS repository. Invoke before adding new product features, after a
significant change cycle, or whenever requirement coverage is in doubt.
During CR analysis, use it to decide whether `CRS`, `SYS`, or `SRS` items need
updates; do not create or edit items during analysis. During CR design, use it
to create or update requirement and SWDD items with correct traceability.

## Requirement Hierarchy

```
UC (Use Case)
  └─ CRS (Customer Requirement)     derives_from: [UC-xxx]
       └─ SYS (System Requirement)  satisfies: [CRS-xxx]
            └─ SRS (Software Req.)  derives_from: [SYS-xxx]
                 └─ SWDD (Design)   implements: [SRS-xxx]

RISK                                related_requirements: [SYS-xxx]
  └─ RCM (Risk Control Measure)     mitigates: [RISK-xxx]
       └─ implements: [SYS-xxx]     (risk control implemented through SYS)

SOUP                                used by SRS items via uses_soup: [SOUP-xxx]
```

Rules:
- Every CRS must derive from at least one UC
- Every SYS must satisfy at least one CRS
- Every SRS must derive from at least one SYS
- Every SWDD must implement at least one SRS
- RISK.related_requirements must reference SYS items (not SRS)
- RCM.mitigates must reference RISK items
- Every SYS must satisfy at least one CRS — including infrastructure SYS items; if no existing CRS fits, create a new CRS (e.g. CRS-010 for system reachability)

## Item ID Naming

| Type   | Prefix | Directory             |
|--------|--------|-----------------------|
| UC     | UC-    | DHF/items/00_uc/      |
| CRS    | CRS-   | DHF/items/01_req_crs/ |
| SYS    | SYS-   | DHF/items/02_req_sys/ |
| SRS    | SRS-   | DHF/items/03_req_srs/ |
| SWDD   | SWDD-  | DHF/items/05_swdd/    |
| RISK   | RISK-  | DHF/items/12_risks/   |
| RCM    | RCM-   | DHF/items/13_rcm/     |
| SOUP   | SOUP-  | DHF/items/11_soup/    |

Assign the next sequential number within each type.

## When to Create Items

| Trigger                          | Minimum items to create or update          |
|----------------------------------|--------------------------------------------|
| New user-facing feature          | UC → CRS → SYS → SRS (in order)           |
| New SOUP dependency              | SOUP item + uses_soup on affected SRS      |
| New identified hazard            | RISK → RCM → link RCM to SYS              |
| Architecture decision            | SYSARCH + update affected SRS derives_from |
| CR implemented                   | Transition CR status to completed          |

## Coverage Check Procedure

Run these commands to identify gaps:

```bash
# List all items by type
python -m medharness --dhf DHF dhf item list --type UC
python -m medharness --dhf DHF dhf item list --type CRS
python -m medharness --dhf DHF dhf item list --type SYS
python -m medharness --dhf DHF dhf item list --type SRS

# Validate schema (catches missing required fields)
python -m medharness --dhf DHF dhf validate schema

```

Then manually verify:
1. Every SRS has a SYS parent that reflects the correct system-level behavior
2. Every SYS is observable at the system boundary (not a software implementation detail)
3. RISK items reference SYS (not SRS)
4. New SOUP entries have corresponding uses_soup on the SRS items that depend on them

## Requirements Quality Rules

Apply these rules to every item you create or modify:

| Rule | What it means |
|---|---|
| **No conflict** | Must not contradict any existing item at the same or adjacent level. If a conflict exists, resolve it by updating the conflicting item. |
| **Clear hierarchy** | Each item must be a proper specialisation of its parent — more specific, never a generalisation. Do not skip levels (e.g. SRS cannot link directly to UC). |
| **Atomicity** | One requirement per item. Do not combine multiple requirements with "and" or list multiple acceptance criteria under a single ID. |
| **Verifiability** | Every requirement must be testable. Avoid vague terms: "fast", "easy", "appropriate", "sufficient". State a concrete, measurable criterion. |
| **No duplication** | Before creating a new item, check whether an existing item already covers the same need. If so, update it rather than adding a new one. |
| **Downward completeness** | The set of child items should together fully address the parent intent — not just partially. |

## Creating and Updating Items

**Always use the CLI — do not write YAML files directly.**

```bash
# Create a new item
python -m medharness --dhf DHF dhf item create \
  --type <TYPE> \
  --data '<JSON>' \
  --author "<your name>"

# Update an existing item
python -m medharness --dhf DHF dhf item update <ITEM_ID> \
  --data '<JSON>' \
  --author "<your name>"
```

The `--data` JSON follows the field schemas below. IDs are assigned by the CLI on creation.

## Item Field Reference

### UC
```json
{ "title": "<verb phrase describing the user goal>",
  "content": "<narrative: actor, preconditions, numbered primary flow, postconditions>" }
```

### CRS
```json
{ "title": "<user group> shall <observable behavior>",
  "content": "As a <role>, I need to <capability> so that <outcome>.",
  "user_group": "<role>",
  "derives_from": ["UC-NNN"],
  "priority": "Critical | High | Medium | Low" }
```

### SYS
```json
{ "title": "System shall <system-boundary behavior>",
  "content": "<precise system-level behavioral description — independent of implementation>",
  "category": "Functional | Performance | Security | Usability | Reliability | Maintainability",
  "verification_method": ["Test"],
  "critical_safety": false,
  "satisfies": ["CRS-NNN"] }
```

### SRS
```json
{ "title": "Software shall <software-level behavior>",
  "content": "<precise software implementation requirement>",
  "derives_from": ["SYS-NNN"],
  "verification_method": ["Test"],
  "critical_safety": false }
```

## Skill Workflow

When invoked, perform these steps in order:

1. **Identify scope** — determine what feature or change is being addressed
2. **Check existing coverage** — run the coverage check commands above
3. **Check for conflicts and duplicates** — read existing items of each type you plan to touch before writing anything
4. **List gaps** — identify missing UC, CRS, SYS, or SRS items for the scope
5. **Create items top-down via CLI** — UC first, then CRS, then SYS, then SRS; apply quality rules to each
6. **Validate schema** — run `python -m medharness --dhf DHF dhf validate schema` after creation
7. **Validate traceability** — run `python -m medharness --dhf DHF dhf validate traceability`; fix any orphans or uncovered pairs
8. **Report** — summarize new items created, gaps remaining, and any traceability issues found
