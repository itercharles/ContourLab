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

The spec must use this structure:

1. `Summary`
2. `Implementation Plan`
3. `DHF Impact`
4. `Verification`
5. `Implementation Checklist`
6. `Open Questions`

Keep the spec concrete enough that a follow-up implementation agent can execute
it directly, but no longer than the CR warrants.
