---
name: post-implement
description: Run the post-implementation checklist after completing a change and before handoff
---

# Post-Implement Checklist

After implementation, work through each section below and state your answers out loud. Do not hand off until all items are addressed.

## 1. Scope Review

- Was the implemented change actually limited to the agreed request?
- Did the change introduce unrelated behavior?
- Were any hidden assumptions added that should be documented?
- Was the final change still consistent with the original change class?

## 2. Direction Review

- Does the final implementation still align with
  `WebTPS-DHF/DHF/documents/specs/crs_specification.md.j2` (product context §2)?
- Does it still align with
  [WebTPS-DHF/DHF/documents/plans/development_plan.md](../../WebTPS-DHF/DHF/documents/plans/development_plan.md)?
- If the implementation diverged from the original plan, is that divergence
  justified and documented?

## 3. DHF Review

- Were DHF files updated when they should have been?
- If DHF was not updated, is the reason explicit?
- List the exact DHF files changed, or state clearly that no DHF update was
  required.

## 4. ADR / Dependency Review

- Was an ADR added when architecture boundaries or deployment/data-flow
  decisions changed?
- If not, is the reason explicit?
- Was a new dependency introduced?
- If yes, was the rationale, rejected alternative, owner, and DHF/SOUP impact
  made explicit?

## 5. Verification Review

- Which commands were actually run?
- Did tests pass?
- Did lint / typecheck / build pass where relevant?
- Was any smoke or workflow verification run?
- What was not verified?

Do not claim validation without naming the commands.

## 6. Delivery Review

- Does this change modify product behavior, workflow behavior, UI behavior,
  system integration behavior, or verification expectations?
- If yes, was the work done on a dedicated branch instead of directly on
  `main`?
- If yes, is a PR required before merge?
- Does the PR description include:
  - a concise summary of the change
  - the exact DHF files changed, or a statement that no DHF update was needed
  - the automated tests and validation commands that were run
  - the manual tests still required, with concrete steps
- After PR creation, is there a follow-up plan to monitor review comments and
  CI outcomes until the PR is resolved?
- If review comments exist, has each comment been triaged into one of:
  - fix now
  - do not fix, with rationale
  - ask for clarification
  - defer to a follow-up item
- Has each review comment received a response?

Functional changes should not be treated as complete until branch / PR
requirements and validation disclosure requirements are satisfied.

## 7. Residual Risk Review

- For infra / DevOps changes, what is the rollback path?
- For integration changes, where would a developer look first when the change
  fails in local or CI environments?
- What remains risky, incomplete, or manual?
- Are there warnings or follow-up items that should be carried into the next
  task?
- Should a new roadmap / infrastructure item be created from this work?

## 8. Definition Of Done Check

Before final handoff, confirm that the work is only treated as done if:

- scope stayed aligned with the agreed request
- product and technical strategy were still respected
- DHF impact was assessed and documented
- ADR / dependency impact was assessed and documented
- relevant validation was actually run and named
- branch / PR requirements were met when applicable
- PR follow-up responsibilities were explicit when applicable
- remaining manual testing is explicit
- residual risks are explicit

---

## Handoff Statement

Produce a concise statement covering:

1. **What changed**: Summary of actual changes made
2. **Change class**: Confirmed class from pre-analyze
3. **Checklist items reviewed**: List each of the 8 checklist sections and their outcome
4. **Validation commands run**: Name every command actually executed and whether it passed
5. **DHF files changed**: Exact file paths, or explicit statement that no DHF update was required
6. **ADR/dependency**: Whether an ADR was added or a dependency was introduced
7. **Branch/PR status**: Branch name and PR link, or statement that no PR is required and why
8. **Manual testing still required**: Concrete steps remaining
9. **Residual risks**: What remains incomplete, risky, or unverified

Do not claim the work is done until this statement can be produced in full.
