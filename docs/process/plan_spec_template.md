# Plan Spec Template

Save each approved plan specification as:

- `docs/CRxxx-Spec.md`

Use the following structure.

## Header

- CR ID
- title
- status: `draft` | `in_review` | `approved` | `superseded`
- linked CR PR
- linked implementation PR, if created

## 1. Problem Statement

- what change is needed
- what user or system problem it addresses
- why the current behavior is insufficient

## 2. Product Fit

- alignment with product strategy
- alignment with current roadmap phase
- scope explicitly out of bounds

## 3. Architecture Fit

- relevant architecture constraints
- affected boundaries or data flows
- ADR needed or not needed, with rationale

## 4. Proposed Implementation

- summary of the implementation approach
- affected repositories
- affected workspaces
- key files or modules likely to change

## 5. DHF Impact

- expected DHF changes in `WebTPS-DHF`
- exact candidate files if already known
- rationale if no DHF update is expected

## 6. Validation Plan

- automated validation to run
- manual validation to run
- explicit acceptance signals

## 7. Risks And Open Questions

- technical risk
- workflow risk
- review questions requiring human clarification

## 8. Exit Criteria

- what must be true before implementation may begin
- what must be true before implementation may be considered complete
