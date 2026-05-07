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
2. For each DHF item type you plan to touch, enumerate existing items first:

       python -m medharness --dhf DHF dhf item list --type <TYPE>

   Use this to detect conflicts and duplicates before writing anything.

3. Create or update DHF items exclusively through the medharness CLI —
   do NOT write YAML files directly:

   ```
   # Create
   python -m medharness --dhf DHF dhf item create \
     --type <TYPE> --data '<JSON>' --author "github-actions[bot]" --cr "{{cr_id}}"

   # Update
   python -m medharness --dhf DHF dhf item update <ITEM_ID> \
     --data '<JSON>' --author "github-actions[bot]" --cr "{{cr_id}}"
   ```

   IDs are assigned by medharness on creation.

4. If the CR calls for specification documents, create or update them under
   `DHF/documents/specs/` or `DHF/documents/plans/` (direct file writes are
   permitted for documents, not for DHF items).

6. After all items are written, validate traceability:

       python -m medharness --dhf DHF dhf validate traceability

   If the output reports orphan items or uncovered coverage pairs introduced
   by your changes, fix them and re-validate. Repeat until clean.

7. Do not modify files outside `DHF/`.
8. Do not edit the CR item YAML or any CR lifecycle/status fields. CR state
   transitions are performed only by the DHF utility in the workflow.

For each area of impact, read the corresponding skill file and follow its
rules, quality checklist, and CLI workflow:

- UC and CRS: read `.claude/skills/product-impact/SKILL.md`
- CRS, SYS, SRS, SWDD: read `.claude/skills/req-manage/SKILL.md`
- SYSARCH: read `.claude/skills/architecture-impact/SKILL.md`
- RISK and RCM: read `.claude/skills/risk-impact/SKILL.md`
- SOUP: read `.claude/skills/soup-impact/SKILL.md`
- Test design: read `.claude/skills/test-impact/SKILL.md`

The design updates must:
- Trace back to the CR and spec
- Be concrete enough for an implementation agent to act on directly
- Follow existing DHF item structure and numbering conventions
- For specification documents, follow the existing templates under `DHF/documents/specs/` when applicable, or use clear structured Markdown with document metadata, version, and section headings
