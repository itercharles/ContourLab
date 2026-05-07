---
name: cr-create
description: Guided wizard to create a new Change Request item in the DHF
argument-hint: "[brief title of the change]"
---

# CR Create Wizard

Guide the user through creating a new Change Request (CR) in the DHF.

## Step 1: Gather information

Ask the user for:
- **Title**: One-line description of the change (if not provided as argument)
- **Rationale**: Why is this change needed? (product direction, defect fix, regulatory, etc.)
- **Scope**: Which workspaces are likely affected? (`apps/client`, `apps/api`, `packages/shared-types`, DHF only)
- **Priority**: Low / Medium / High
- **Author**: Who is requesting this change?

## Step 2: Check existing CRs

Before creating, check for duplicates:
```
python -m medharness --dhf DHF dhf item list --type cr
```

If a similar CR exists, show it to the user and confirm they want to create a new one.

## Step 3: Determine next CR ID

```
python -m medharness --dhf DHF dhf item list --type cr
```

Find the highest existing CR number and increment by 1 (e.g., if CR-011 exists, new ID is CR-012).

## Step 4: Create the CR

```
python -m medharness --dhf DHF dhf item create --type cr --data '{
  "id": "CR-NNN",
  "title": "<title>",
  "rationale": "<rationale>",
  "scope": ["<workspace>"],
  "priority": "<priority>",
  "author": "<author>",
  "state": "new"
}'
```

## Step 5: Confirm and next steps

After creation, show the new CR item and explain the next steps:
1. Commit the new CR YAML to a branch and push
2. Go to https://github.com/itercharles/WebTPS/issues and open a GitHub issue
   with the CR title, then set its milestone — `issue-to-cr.yml` will
   automatically open the `feat/CR-NNN` Draft PR and transition the CR to `in_review`
3. Once the PR is approved, the `cr-lifecycle.yml` workflow generates the spec, design, and implementation automatically
