# CR Analysis Prompt

You are working in the DHF repository for WebTPS.

Inputs:
- CR item: `DHF/items/09_cr/{{cr_id}}.yaml`
- Custom checklist: `.github/prompts/cr-analyze-checklist.md`
- Impact skills: `/product-impact`, `/req-manage`, `/architecture-impact`,
  `/risk-impact`, `/soup-impact`, `/test-impact`
- Product repo: `itercharles/WebTPS`
- Repository context: `CLAUDE.md`, `README.md`, and `docs/cr_spec_workflow.md`

Task:
1. Read the CR and repository context.
2. Read the custom checklist and incorporate it into the generated spec.
3. Produce a concise technical implementation spec at `docs/cr-specs/{{cr_id}}-Spec.md`.
   Use a plan-style output: short sections, direct bullets, and only the analysis
   needed to implement and review the change.
4. Do not modify other files in this step.
5. Do not edit the CR item YAML or any CR lifecycle/status fields. CR state
   transitions are performed only by the DHF utility in the workflow.

For small or mechanical changes, keep the spec short. Do not enumerate hundreds
of speculative risks, files, or test permutations. Prefer "No DHF item changes
expected" or "No open questions" when that is the accurate answer.

The `DHF Impact` section must explicitly use the impact skills and state each
area as `Required`, `Not required`, or `Follow-up needed` with a one-sentence
justification:
- `/product-impact`: product direction, UC, and CRS alignment.
- `/req-manage`: requirements impact across CRS, SYS, and SRS.
- `/architecture-impact`: SYSARCH and architecture specification impact.
- `/risk-impact`: RISK and RCM impact.
- `/soup-impact`: SOUP and dependency impact.
- `/test-impact`: development, verification, validation, and manual test impact.

The spec file MUST begin with a YAML front-matter block, followed by the markdown sections.
The front-matter is machine-read by CI validation — missing or wrong fields will fail the build.

```
---
cr_id: "{{cr_id}}"
direction_fit: in-scope        # one of: in-scope | scope-expansion | out-of-scope
affected_items:                # DHF item IDs this CR touches; use [] if none
  - SYS-001
test_plan:
  auto_covered:                # SRS/SYS items covered by existing automated tests
    - SRS-001
  needs_new_tc:                # items requiring new test cases
    - SRS-002
  must_be_manual:              # items that can only be verified manually
    []
---
```

`direction_fit` meanings:
- `in-scope`: fits the current product roadmap without extending scope
- `scope-expansion`: adds capability beyond the current roadmap
- `out-of-scope`: conflicts with or is outside the product strategy

`affected_items` must reference IDs that **already exist** in DHF (SYS-NNN, SRS-NNN, CRS-NNN, RISK-NNN, etc.).
Use `[]` if no existing items are affected. Do NOT invent new IDs — if the CR requires a new DHF item
(e.g. a new CRS), note it in `DHF Impact` prose and leave `affected_items: []`; the design phase will create it.

The markdown sections follow the front-matter block:

1. `Summary`
2. `Implementation Plan`
3. `DHF Impact`
4. `Verification`
5. `Implementation Checklist`
6. `Open Questions`

Keep the spec concrete enough that a follow-up implementation agent can execute
it directly, but no longer than the CR warrants.
