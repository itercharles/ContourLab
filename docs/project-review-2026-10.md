# Project review, October 2026

A read-only review of the whole repository by a second model (Opus), on `main` at `544aff4`
plus the open PR #167. Eight of its most serious claims were checked against the code by hand
before this was written (marked **checked**); the rest are the reviewer's findings as reported.
Treat unchecked items as leads to confirm before acting on them.

Recorded in the repository so the work can be planned and picked up later. The findings below are
as the reviewer reported them on 2026-10-12; **where each one stands now is in the next section**.

## Where things stand (2026-10-15)

Of the 24 reported findings, 17 are fixed, 2 are partly done and 5 are not started (details below).
All the fixes are merged, `main` is green and deployed, and no pull request is open. The reviewer's
suspected findings (S1 to S5) were not separately verified.

| State of `main` | |
|---|---|
| CI and deploy | green on `73ccd3f`; the deployed stack answers on the workstation's own address only |
| Client tests | 425 pass across 54 files |
| `verify dhf --strict` | 173 items, 0 errors, 0 warnings |
| `verify tests --strict` | 53 of 53 requirements covered; 3 warnings (see "needs a human", item 4) |
| `verify soup --strict` | 36 items, no known vulnerabilities, 0 warnings |
| MedHarness | 0.69.0 |

### Findings

| # | Finding | State | Where |
|---|---|---|---|
| 1 | Boolean and margin keep only the largest outline | fixed | #169 |
| 2 | Slices matched by the SliceLocation tag, not the image position | fixed | #169 |
| 3 | Boolean and margin ignore the volume's orientation | fixed | #169 |
| 4 | AI auto-contour has no requirement, risk or SOUP in the DHF | **not started** | needs a CR |
| 5 | Auto-contour fallback stacks slices by InstanceNumber | **not started** | |
| 6 | AI contours can be pushed unreviewed, recorded as manual | **not started** | |
| 7 | Push failures invisible; edits during upload overwritten | fixed | #170 |
| 8 | Undo global, never cleared, ignores locks, fires while typing | fixed | #170 |
| 9 | Locked structures can be deleted, retyped | fixed | #170 blocks delete and type change on a locked structure; deleting a structure that has contours now asks first (SYS-003 T5, RCM-015) |
| 10 | Volumes stale; holes added; average thickness; invented margin preview | fixed | #178 |
| 11 | Slices load with no geometry checks | fixed | #172: a gate; the local-file tag parser still has no test of its own |
| 12 | API has no authentication | partly | #174 closes the network to this workstation; no authentication or audit trail; `POST /api/issues` still accepts anything |
| 13 | Deployed Orthanc unauthenticated and reachable | fixed | #174: loopback only, REST proxy removed; then the image pinned by tag and digest, the data directory no longer world-writable, and a backup taken before a redeploy recreates the repository, with a restore tested (RISK-011, RCM-016) |
| 14 | Any reviewer can trigger code generation | fixed | #171 (Claude Code CLI is still installed unpinned in `cr-agent-setup`) |
| 15 | SOUP register covers only client npm packages | partly | #155, #162 (purposes and ratings for 35 npm and Python items); Orthanc, nginx, .NET and the Python service stack are missing (an Orthanc entry was tried: `verify soup --strict` refuses an ecosystem OSV does not name, such as Docker, so it needs MedHarness support first), and the build patches installed codec files |
| 16 | Risk file too thin | fixed | #173, then #176 to #179; 10 risks with controls (AI error is not among them, see 4) |
| 17 | A crashed contour overlay hides contours with no warning | fixed | the view shows a message and a Retry control (RCM-012, SYS-002 T7); a view without image data is covered by the real-DICOM tests |
| 18 | No orientation markers or patient position | fixed | #176 (the 3D view has no markers) |
| 19 | Interpolation twists outlines, ignores extra contours | fixed | #180 |
| 20 | RTSTRUCT export writes made-up identifiers | fixed | #179; the push now names the patient, series and repository and waits for a confirmation (SRS-010 T16) |
| 21 | Draft restored with no check against the repository | fixed | #170 deletes the draft after a push; #181 asks before restoring an older one |
| 22 | Auto-contour service has no limits | fixed | the service refuses a malformed or oversize series and body, holds at most 3 queued or running jobs, drops finished jobs after an hour (at most 20 kept), and abandons an inference that runs over an hour; all set by environment variables, tested without a model |
| 23 | Traceability promises more than the tests check | **not started** | SRS-010 is still one very large requirement; several test files carry no `@links` |
| 24 | Oversized components, duplicated logic | **not started** | `StructurePanel.tsx` is still over 2,200 lines; the three copies of `isEditableTarget` are now one |

### Beyond the review

- Issue #164 (the maximized view goes grey): fixed through the automated change-request pipeline as CR-019
  (#167), which was the test of that pipeline. It generated the fix and its tests; the design PR was merged
  before the code existed, which turned `main`'s coverage gate red until the code merged and also cancelled
  the first code-generation run. That is a gap in the pipeline: nothing stops a design-stage PR being merged.
- End-to-end tests with real DICOM (#165): a synthetic phantom in four compression formats and four patient
  positions, loaded through the real pipeline in CI. HTJ2K has no fixture, so that decoder is still untested.
- `--strict` on `verify tests` and `verify soup` in CI (#157); SOUP purposes, ratings and the four open design
  decisions (#162); the deployment hardening (#174); MedHarness 0.61.0 (#175).

## What needs a human

1. **`ACTIONS_PAT` was renewed on 2026-10-15** (the old one had expired, which stopped `cr-complete`,
   `cr-lifecycle` and `issue-to-cr`). The failed CR completion run for #167 was re-run and opened #183, which moves
   CR-019 to `completed` once merged. The new token expires in time: set a reminder to renew it.
2. **SOUP assessments are my drafts** (#162): manufacturer, risk rating, safety class and verification method of
   35 items, written from how each package is used. The manufacturer names come from package ownership and were
   not checked against vendors.
3. **Risk ratings are my drafts** (#173, #177 and the re-ratings in #176, #178). Severity and probability are
   estimates; acceptability follows one rule, applied to the residual rating: S4 or S5 with P3 or worse is
   Unacceptable; S4 or S5 with P2, or S3 with P3 or worse, is ALARP; otherwise Acceptable. Two were re-rated after
   their controls were built and need confirming: **RISK-003** (volume error, ALARP to Acceptable) and
   **RISK-005** (left/right confusion, Unacceptable to ALARP). **RISK-008** (display fails silently) was re-rated
   Unacceptable to ALARP when its visible-error-state control was built; confirm that too. Today nothing is rated
   Unacceptable. ALARP: RISK-002, RISK-004, RISK-005, RISK-008, RISK-010.
4. **Three requirements verified by inspection need a human sign-off record** (CRS-015, SYS-018, SRS-035,
   from #177): MedHarness 0.61 warns about each. The evidence is the configuration plus the CI check that
   enforces it; the record is a person's signature.
5. **Manual checks that no test covers**: SRS-019's Demonstration (Escape and a patient change restore the
   three-pane layout, and a reload starts in the normal layout) has never been run by a person.

### Behaviour that changed and that you may notice

- A study with no Patient ID, or whose images have no Frame of Reference UID, can no longer be pushed (the
  export is refused with a reason).
- An oblique, gantry-tilted or otherwise non-axial series, or one with missing or inconsistent geometry, is refused
  on loading; unevenly spaced slices load with a warning.
- The deployed application can only be reached from the workstation it runs on; other computers can no longer
  open it. To open it up, put an authenticating proxy in front of it.
- A locked structure cannot be deleted or have its type changed; Ctrl/Cmd+Z in a text field no longer undoes a
  contour edit; the undo history is cleared when the image set changes.
- A local draft older than the repository's structure set is no longer restored without asking.

## What is left, in the order I would take it

1. **AI auto-contour under design control** (findings 4, 5, 6, 15): requirements, a risk and its controls, SOUP for
   TotalSegmentator and the Python stack, pinned Python dependencies, tests run in CI, AI origin recorded in the
   exported structure set and a review step before a push. It is the largest remaining gap and should go through the
   change-request pipeline.
2. **Authentication, roles and an audit trail** (findings 12 and 13): only needed if the system is ever used from more
   than one computer; until then loopback-only is the control.
3. Split SRS-010 and annotate the unlinked tests (23); limits for the auto-contour service (22); a decoder test for
   HTJ2K; pin the Claude Code CLI; break up
   `StructurePanel.tsx` (24).

How each fix was checked is in its pull request. The pattern, which is worth keeping: a test that fails on the old
code, a run in the real application or against a real repository, and a deliberate regression to see the new test
fail.

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
