# Project review, October 2026

A read-only review of the whole repository by a second model (Opus), on `main` at `544aff4`
plus the open PR #167. Eight of its most serious claims were checked against the code by hand
before this was written (marked **checked**); the rest are the reviewer's findings as reported.
Treat unchecked items as leads to confirm before acting on them.

Recorded in the repository so the work can be planned and picked up later. Status of each item
is tracked in the PRs that fix it, not here.

## Order of work

1. Contour-operation geometry (findings 1, 2, 3)
2. Save path and undo (findings 7, 8, 9, 21)
3. Network surface (findings 12, 13, 14)
4. AI auto-contour under design control (findings 4, 5, 6, 15)
5. Series validation, orientation markers, RISK expansion (findings 11, 16, 18)

## Verified by the reviewer (code was read)

### Contour operations
1. **Boolean and margin keep only the largest outline per slice. Critical. (checked)**
   `BooleanContourEngine.ts:209`, `MarginContourEngine.ts:189` take `loops.sort(...)[0]`. Separate
   pieces are dropped (left and right lung union keeps one side) and holes are filled
   (PTV minus CTV keeps the solid outline). The result goes through `ContourEngine.replaceContours`
   (`StructurePanel.tsx`), which replaces all of the structure's contours, so source contours on
   slices that match no frame are deleted. Tests use single overlapping squares only.
   Fix: return every outline with its holes; add two-island, nesting and unmatched-slice tests.
2. **Slice lookup uses the raw SliceLocation tag, contours are stored in LPS z. High.**
   `StructurePanel.tsx` builds frames from `instance.sliceLocation`; `DicomMetadataStore.ts:243`
   falls back to IPP z with `||`, so a real 0 becomes IPP z, while `dicomWebClient.ts:548` keeps 0.
   `ContourOverlay.tsx` already knows FFS flips the tag. On FFS a margin or boolean matches the
   mirrored slice, or matches nothing and empties the structure.
   Fix: one helper that builds frames from IPP projected on the slice normal, used everywhere.
3. **Boolean and margin rasterising ignores direction cosines. High. (checked)**
   Both compute `x = origin[0] + i*spacing[0]`; with HFP direction (-1,-1) nothing is filled and
   the structure is wiped. `contourMaskReslice.ts` documents and fixes the same bug but these
   engines were missed. About 200 lines are duplicated between them.
   Fix: rasterise in voxel space with `worldToContinuousVoxel` / `voxelToWorld`.

### Save path and undo
7. **Push failures are invisible and a stale snapshot overwrites edits made during upload. High. (checked, first half)**
   `Toolbar.tsx` catch only calls `logClientDebug`. `replaceStructureSets(structureSets.map(...))`
   uses state captured before two awaits, then clears the dirty flags. `uploadDicomBlobToRepository`
   checks only `response.ok`, not `FailedSOPSequence`. Same pattern in `DicomRepoPanel.tsx`.
8. **Undo/redo is global, never cleared, ignores locks, fires while typing. High. (checked: never cleared)**
   No non-test caller of `UndoRedoManager.clear()`; closures mutate the store without an `isLocked`
   check; `installUndoRedoKeyHandler` has no editable-target guard.
9. **Locked structures can be deleted, retyped and recoloured; delete has no confirmation. Medium-High.**
   `StructurePanel.tsx` `handleDelete` and the type/colour patches skip the lock.
10. **Structure volumes go stale after boolean, margin, interpolation and undo/redo; volume uses average slice spacing. Medium-High.**
    `refreshVolume` runs only from `ContourOverlay.tsx`. `VolumeCalculator.ts` adds hole areas
    instead of subtracting them. The margin preview volume is a made-up sphere estimate.
21. **A local draft is restored with no check against newer repository RTSTRUCTs. Medium.**
    Drafts are never deleted after a successful push and have no retention.

### Network and workflows
12. **The API has no authentication; an anonymous issue post feeds the AI code pipeline. High. (checked: no auth)**
    `POST /api/issues` creates GitHub issues with the owner's token, so `issue-to-cr.yml`'s owner check
    passes for anonymous LAN input; a human adding a milestone is the only gate. `/debug/client-log`
    GET/DELETE and `GET /api/dhf-artifacts/latest` are anonymous. No user identity, so no audit trail.
13. **Deployed Orthanc is unauthenticated and network-reachable. High. (checked)**
    `AuthenticationEnabled: false`, ports 8042 and 4242 published on all interfaces, nginx proxies the
    full REST API at `/orthanc/` including DELETE, `chmod 777` on the data directory, image
    `orthancteam/orthanc:latest` unpinned, no backup. `SYSARCH-002` says production uses a hospital PACS.
14. **Anyone who can submit a review can trigger code generation. High if the repo has non-maintainer collaborators. (checked: no reviewer check)**
    `cr-lifecycle.yml` never checks `review.user.login` or `author_association`; `cr-agent-setup`
    installs Claude Code unpinned inside jobs that hold `ACTIONS_PAT`.

### AI auto-contour
4. **No DHF coverage at all. Critical (compliance). (checked)**
   No requirement, risk or SOUP; the Python tests are not run in CI; `requirements.txt` is unpinned.
5. **Fallback stacks slices by InstanceNumber but uses position-sorted geometry. High (conditional).**
   `inference.py:41-46`; can flip the volume head to foot when `pixelData` is empty.
6. **AI contours can be pushed unreviewed and their origin is erased. High.**
   `rtstructExport.ts:88` writes `ROIGenerationAlgorithm: 'MANUAL'`; `Toolbar.tsx` overwrites `source`.
22. **The auto-contour service has no limits and keeps every job forever. Medium.**

### Data and compliance
11. **Slices load with no geometry checks. High.**
    Missing tags get silent defaults; nothing rejects non-uniform, oblique or mixed series. RCM-002
    claims tests for geometry-tag parsing that do not exist; `DicomLoader.ts` and `VolumeBuilder.ts` have no tests.
15. **SOUP register covers only client npm packages. High (compliance).**
    Missing Orthanc, nginx, .NET runtime, the Python stack. `vite.config.ts` rewrites files inside
    the installed Cornerstone codec packages on every build. Three lockfiles are tracked.
16. **The risk file is too thin for Class C. High (compliance).**
    RISK-001..003 hold only id, title, hazard: no harm, severity, probability or residual risk.
    Missing hazards: wrong patient or series on push, left/right and head/foot confusion, boolean and
    margin errors, AI errors, unauthorised access, stale drafts, silent rendering failure.
17. **A crashed contour overlay hides all contours with no warning. Medium-High.**
    `ContourErrorBoundary` returns `null` and never resets.
18. **No patient orientation markers or patient position display. Medium-High.**
19. **Interpolation does not align start point or winding and ignores multiple contours per slice. Medium.**
20. **RTSTRUCT export writes made-up identifiers. Medium.**
    Missing FrameOfReferenceUID becomes a random UID; PatientID falls back to StudyInstanceUID;
    AVOIDANCE/SUPPORT export as ORGAN.
23. **Traceability text promises more than the tests check. Medium.**
    SRS-010 is one huge requirement; several test files carry no `@links`.
24. **Oversized components and duplicated logic. Low-Medium.**
    `StructurePanel.tsx` is 2246 lines; `isEditableTarget` is defined three times.

## Suspected, not confirmed

- S1: Cornerstone places non-uniform slices on a uniform grid (Medium-High).
- S2: transfer syntax read from tag (0002,0010), which DICOMweb metadata never contains (Low-Medium).
- S3: STOW-RS partial failure returned as 200 and treated as success (Medium).
- S4: `pixelRepresentation` defaults differ between loaders (Low).
- S5: Lua execution reachable through the `/orthanc/` proxy depends on the deployed Orthanc default (Medium).

## Not examined

3D mesh correctness, `MPRController` and `ViewportManager` internals, measurement and HU accuracy,
QA rule logic, `structureSetCompare.ts`, local file loading end to end, dependency advisories
(`pnpm audit`, `dotnet list package --vulnerable`, `pip-audit`), the e2e specs, `release-baseline.yml`,
`profiles.py` and mask-to-contour conversion, performance on large series.

## Already fixed or known before this review

`--strict` gates pass; SOUP purposes and risk ratings drafted (awaiting sign-off); synthetic DICOM
phantom e2e tests; viewport maximize defect #164 (PR #167); design PRs can be merged before their code
exists and a merge cancels an in-flight `gen-code`; CI only runs on push and PR.
