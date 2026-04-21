# Pre-Analyze Checklist

Review this checklist before implementing any user request.

## 1. Request Framing

- What user outcome is actually being asked for?
- Which change class best fits this request?
  - `docs/process`
  - `infra/devops`
  - `bugfix`
  - `feature`
  - `architecture`
- Which workspace owns the change: `apps/client`, `apps/api`,
  `packages/shared-types`, or repository-wide docs / tooling?

Expected gate by class:

- `docs/process`: doc consistency check, no DHF by default, no PR by default
- `infra/devops`: validation + rollback thinking + observability expectations
- `bugfix`: regression test expectation
- `feature`: branch, PR, DHF assessment, automated validation, manual test plan
- `architecture`: ADR required, branch, PR, DHF assessment, validation plan

## 2. Product Direction Check

- Is the request consistent with [docs/strategy/product_strategy.md](../docs/strategy/product_strategy.md)?
- Is it aligned with the current phase in
  [docs/strategy/product_roadmap.md](../docs/strategy/product_roadmap.md)?
- Does it strengthen the current priority, or is it pulling scope forward too
  early?
- Should the request be narrowed because it conflicts with current product
  focus?

If the request conflicts with product direction, state the conflict before
implementation.

## 3. Technical Direction Check

- Is the request consistent with
  [docs/strategy/technical_strategy.md](../docs/strategy/technical_strategy.md)?
- Does it preserve repository-first architecture?
- Does it keep shared types authoritative?
- Does it add infrastructure or abstractions that will be hard to validate or
  maintain?
- Does it introduce machine-local, developer-local, or environment-coupled
  assumptions?

If the request conflicts with technical direction, state the conflict before
implementation.

## 4. Architecture Decision Check

- Does the request change architecture boundaries, deployment shape, data flow,
  storage location, integration responsibility, or external dependency model?
- If yes, should an ADR be added in `docs/adr/`?
- If yes, identify the ADR title before implementation.

## 5. Dependency Introduction Check

- Does the change add or materially change an npm package, NuGet package,
  container image, hosted service, or external tool dependency?
- If yes, why is the existing stack insufficient?
- What alternative was considered and rejected?
- Who is expected to maintain this dependency?
- Does this trigger SOUP / DHF impact?

New dependencies should not be introduced without answering these questions.

## 6. DHF Impact Check

- Will this request modify product behavior, requirements, architecture
  decisions, risk posture, or verification expectations?
- If yes, which **specific DHF items** are likely to change?
- If no, record that this is repo-process / tooling / documentation-only and
  explain why DHF impact is not expected.

Before implementation, list candidate DHF files explicitly when DHF updates are
expected.

## 7. Validation Plan

- What is the narrowest meaningful test or verification command?
- What broader validation is required before handoff?
- Does the request need unit tests, component tests, integration smoke
  verification, or doc consistency checks?

## Suggested Output Format

Before implementation, the agent should be able to state:

- intended change scope
- change class and expected gate
- product / technical fit
- ADR impact if any
- dependency impact if any
- expected DHF impact, including concrete files when applicable
- planned validation commands
