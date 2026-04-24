---
name: pre-analyze
description: Run the pre-implementation checklist from AI-harness before starting any feature, bugfix, or architecture change
---

# Pre-Analyze Checklist

Before implementing, work through each section below and state your answers out loud. Do not begin writing code until you can answer all items.

!`cat AI-harness/pre-analyze.md`

---

## Checkpoint

State the following before proceeding:

1. **Change scope**: What exactly will change and what will not?
2. **Change class**: `docs/process` | `infra/devops` | `bugfix` | `feature` | `architecture`
3. **Product fit**: Is this aligned with `docs/strategy/product_strategy.md` and the current roadmap phase?
4. **Technical fit**: Is this aligned with `docs/strategy/technical_strategy.md`?
5. **ADR needed**: Yes/No — if yes, what is the ADR title?
6. **New dependency**: Yes/No — if yes, rationale and SOUP/DHF impact?
7. **DHF impact**: Which specific DHF items are expected to change, or state explicitly that no DHF update is required and why.
8. **Validation plan**: What commands will be run to verify this change?

If any item cannot be answered, stop and clarify with the user before proceeding.
