---
paths:
  - "packages/shared-types/**"
---

# Shared Types Rules (packages/shared-types)

## Purpose
Canonical TypeScript domain model. This package is the single source of truth for all domain types shared between frontend and API.

## Constraints
- Zero runtime dependencies — types only, no third-party imports
- All domain entities must be exported from `src/index.ts`
- No logic, no classes — pure TypeScript interfaces and type aliases
- Changes here ripple to both `apps/client` and `apps/api`; run both typechecks after editing

## Key Types
`Patient`, `Study`, `Series`, `Instance`, `Volume`, `Structure`, `StructureSet`, `TreatmentPlan`, `Beam`, `DoseGrid`, `DVHCurve`, `DoseStatistics`

## Validate After Edit
```
pnpm --filter @contourlab/shared-types typecheck
pnpm --filter @contourlab/client typecheck
```

## Adding New Types
- Define in `src/` subdirectory by domain area
- Re-export from `src/index.ts`
- Check if the type belongs in DHF SRS or SWDD items
