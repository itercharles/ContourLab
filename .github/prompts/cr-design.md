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

4. Before creating any item, list existing items of that type and apply these
   quality rules to everything you write:
   - **No conflict** — must not contradict any existing item at the same or adjacent level
   - **Hierarchy** — each item is a proper specialisation of its parent (UC→CRS→SYS→SRS→SWDD); do not skip levels
   - **Atomicity** — one requirement per item; no compound "and" requirements
   - **Verifiability** — no vague terms ("fast", "easy", "appropriate"); state a measurable criterion
   - **No duplication** — update an existing item rather than creating an overlapping one
   - **Downward completeness** — child items together fully address the parent intent

5. If the CR calls for specification documents, create or update them under
   `DHF/documents/specs/` or `DHF/documents/plans/` (direct file writes are
   permitted for documents, not for DHF items).

6. After all items are written, validate traceability:

       python -m medharness --dhf DHF dhf validate traceability

   If the output reports orphan items or uncovered coverage pairs introduced
   by your changes, fix them and re-validate. Repeat until clean.

7. Do not modify files outside `DHF/`.
8. Do not edit the CR item YAML or any CR lifecycle/status fields. CR state
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
