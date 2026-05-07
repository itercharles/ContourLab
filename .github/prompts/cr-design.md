# CR Design Prompt

You are working in the DHF repository for WebTPS.

Inputs:
- CR item: `DHF/items/09_cr/{{cr_id}}.yaml`
- Spec: `docs/cr-specs/{{cr_id}}-Spec.md`
- Design skills: `/product-impact`, `/req-manage`, `/architecture-impact`,
  `/risk-impact`, `/soup-impact`, `/test-impact`
- Repository context: `CLAUDE.md`, `README.md`, and `docs/cr_spec_workflow.md`

Task:
1. Read the CR item, the approved spec, and the repository context.
2. Update or create the relevant DHF items under `DHF/items/` using the
   appropriate skill for each document category.
3. If the CR calls for generating specification documents, create or update them under `DHF/documents/specs/` or `DHF/documents/plans/`.
4. After writing or updating DHF items, run the following command to validate
   traceability and check for orphan items or broken coverage chains:

       python -m medharness --dhf DHF dhf validate traceability

   Read the output. If it reports orphan items or uncovered coverage pairs that
   your changes introduced, fix them before finishing. Repeat until the output
   shows no new gaps.
5. Do not modify files outside `DHF/`.
6. Do not edit the CR item YAML or any CR lifecycle/status fields. CR state
   transitions are performed only by the DHF utility in the workflow.

Use these skills for design edits:
- `/product-impact`: UC and CRS updates or creation.
- `/req-manage`: CRS, SYS, SRS, and SWDD requirement/design traceability updates.
- `/architecture-impact`: SYSARCH and architecture specification updates.
- `/risk-impact`: RISK and RCM updates.
- `/soup-impact`: SOUP item updates for dependency changes.
- `/test-impact`: test strategy/design updates, including required Test-SRS,
  Test-SYS, Test-CRS, and manual checks. Do not create SWTEST YAML unless a
  SWTEST doc type exists in `DHF/config/doc_types/`.

The design updates must:
- Trace back to the CR and spec
- Be concrete enough for an implementation agent to act on directly
- Follow existing DHF item structure and numbering conventions
- For specification documents, follow the existing templates under `DHF/documents/specs/` when applicable, or use clear structured Markdown with document metadata, version, and section headings
