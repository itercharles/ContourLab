# CR-029 End-to-End Automation Flow Test — Technical Specification

## Problem Summary

The CR-driven automation pipeline in ContourLab DHF (cr-analyze.yml, cr-develop.yml, cr-spec-iterate.yml) was recently enhanced with path fixes and secret configuration updates, but has not been validated in a complete end-to-end scenario. The workflow must prove that:

1. **Analyze stage** (cr-analyze.yml): CR creation → spec generation → spec PR
2. **Develop stage** (cr-develop.yml): Spec approval → DHF items + product implementation → implementation PRs
3. **Completion stage**: Implementation merge → CR state sync

The test must run with minimal secrets configured (ANTHROPIC_API_KEY, PRODUCT_REPO_TOKEN) to verify the pipeline handles both full automation and dry-run stubs.

## Intended Outcome

CR-029 itself becomes a proof point for the automation pipeline. By the end of this CR:
- ✅ CR-029 PR merged → cr-analyze.yml generates CR-029-Spec.md
- ✅ Spec PR merged → cr-develop.yml creates DHF items + product stub implementation
- ✅ All workflow transitions (new → in_review → implementing → completed) succeed
- ✅ State transitions are recorded in the CR YAML
- ✅ All GitHub Actions jobs complete without errors

This validates that the automation is production-ready for future CRs.

---

## Technical Approach

### Phase 1: Analyze (Automated by cr-analyze.yml)

**Trigger:** CR-029.yaml merged to main

**Expected Actions:**
1. cr-analyze.yml detects CR-029.yaml addition
2. Transitions CR-029 to `in_review` state
3. Invokes Claude to generate `docs/cr-specs/CR-029-Spec.md` (this document)
4. Creates `spec/CR-029` branch with updated CR-029.yaml + generated spec
5. Opens spec PR with title `spec(CR-029): AI analysis plan`

**Success Criteria:**
- Spec PR exists and contains CR-029-Spec.md with concrete implementation guidance
- CR-029.yaml has `status: in_review`
- All workflow steps complete without permission denials

### Phase 2: Develop (Automated by cr-develop.yml)

**Trigger:** Spec PR merged to main

**Expected Actions:**
1. cr-develop.yml detects CR-029-Spec.md merged
2. Transitions CR-029 to `implementing` state
3. Clones product repo (itercharles/ContourLab)
4. Invokes Claude to implement the spec:
   - Creates placeholder SRS item (SRS-XXX) derived from CR-029
   - Creates stub implementation file in product repo
5. Pushes `develop/CR-029` branch with DHF changes
6. Opens DHF items PR with title `dhf(CR-029): implementation updates`
7. Pushes `feat/CR-029` branch in product repo with stub code
8. Opens product repo PR with title `feat(CR-029): implement approved spec`

**Success Criteria:**
- DHF items PR exists with new SRS item
- Product repo PR exists with stub implementation
- CR-029.yaml has `status: implementing`
- Both PRs are reviewable and reference CR-029

### Phase 3: Completion (Manual Merge + Verification)

**Trigger:** Implementation PRs merged to main (in both repos)

**Expected Actions:**
1. Product repo implementation PR merged to main
2. DHF repo `develop/CR-029` PR merged to main
3. CR-029.yaml manually transitioned to `completed` (or automated by a completion sync workflow if implemented)

**Success Criteria:**
- CR-029.yaml has `status: completed`
- SRS item is visible in DHF items list
- Product repo contains the CR-029 stub (demonstrates code was added)
- CR item lifecycle fully traversed: new → in_review → implementing → completed

---

## DHF Items to Create or Update

### CR-029 (Update)

**File:** `DHF/items/09_cr/CR-029.yaml`

**Changes:**
- Set initial status to `new` (or `planned` for test automation)
- Ensure title, description, and justification are present
- Add traceability links once SRS is created

**Rationale:** The CR itself is the test artifact. State transitions through the lifecycle validate the automation.

### SRS-XXX (Create)

**Type:** SRS (Software Requirements Specification)  
**Location:** `DHF/items/03_req_srs/SRS-XXX.yaml`  
**Derives From:** CR-029  
**Title:** Automation Pipeline E2E Test Requirements

**Content:**
```
requirement: >
  The CR-driven automation pipeline shall successfully transition a CR through 
  all lifecycle states (new → in_review → implementing → completed) with 
  automated spec generation and implementation triggering.

acceptance_criteria:
  - Spec generation completes within 5 minutes of CR PR merge
  - Implementation automation completes within 10 minutes of spec PR merge
  - All GitHub Actions jobs exit with status 0
  - State transitions are recorded in CR YAML

verification_method: Manual review of workflow logs and final CR state
test_case: CR-029 (this CR serves as the test case)
```

**Rationale:** SRS documents the testable requirements for the automation pipeline. Its presence in the DHF demonstrates that the develop stage successfully created new items.

---

## Product Code Changes Expected

Since CR-029 is infrastructure automation testing (not a product feature), the product repo changes are minimal and demonstrative:

### File: `stub-CR-029.md` (Create in ContourLab repo)

**Location:** Root of ContourLab repository (or `/docs/automation-test/`)

**Content:**
```markdown
# CR-029 Automation Test Artifact

Generated by cr-develop.yml as proof that the implementation automation 
successfully cloned the product repo and created a change.

See specification: [CR-029-Spec.md](../../docs/cr-specs/CR-029-Spec.md)

This stub is intentionally minimal — the real value of CR-029 is validating 
the GitHub Actions workflows, not implementing a feature.
```

**Rationale:**
- Proves that cr-develop.yml successfully:
  - Cloned the product repo
  - Created a change branch (`feat/CR-029`)
  - Opened a product repo PR
- Can be deleted after CR-029 is marked completed
- Allows the automation to work in dry-run mode (when ANTHROPIC_API_KEY is not set)

---

## Verification and Test Cases

### Test Case 1: CR PR Merge → Spec Generation

**Step:** Merge CR-029 PR to main  
**Expected Outcome:**
- GitHub Actions workflow `cr-analyze.yml` runs
- Job `analyze` completes successfully
- Artifact: `docs/cr-specs/CR-029-Spec.md` exists in `spec/CR-029` branch
- Artifact: CR-029.yaml shows `status: in_review`
- PR opened with head=`spec/CR-029`, base=`main`

**Verification Method:**
```bash
git show spec/CR-029:docs/cr-specs/CR-029-Spec.md | head -5
medharness --dhf DHF dhf item get CR-029 | grep status
gh pr list --head spec/CR-029
```

### Test Case 2: Spec PR Merge → Implementation Automation

**Step:** Merge spec/CR-029 PR to main  
**Expected Outcome:**
- GitHub Actions workflow `cr-develop.yml` runs
- Job `develop` completes successfully
- DHF artifacts: New SRS-XXX item created in `DHF/items/03_req_srs/`
- DHF artifacts: CR-029.yaml shows `status: implementing`
- DHF PR opened with head=`develop/CR-029`, base=`main`
- Product repo: `stub-CR-029.md` (or other change) in `feat/CR-029` branch
- Product repo PR opened with head=`feat/CR-029`, base=`main`

**Verification Method:**
```bash
git show develop/CR-029:DHF/items/03_req_srs/SRS-*.yaml | grep derives_from
medharness --dhf DHF dhf item get CR-029 | grep status
gh pr list --head develop/CR-029 --repo itercharles/ContourLab
gh pr list --head feat/CR-029 --repo itercharles/ContourLab
```

### Test Case 3: CR Lifecycle Completion

**Step:** Merge DHF items PR to main, then merge product repo PR  
**Expected Outcome:**
- CR-029.yaml shows `status: completed`
- SRS-XXX item is traceable to CR-029
- Product repo contains the CR-029 stub commit

**Verification Method:**
```bash
medharness --dhf DHF dhf item get CR-029 | grep status
medharness --dhf DHF dhf item list --type srs | grep CR-029
git log --oneline ../ContourLab | grep CR-029
```

### Test Case 4: Workflow Error Handling

**Condition:** If ANTHROPIC_API_KEY is not set (dry-run mode)  
**Expected Behavior:**
- cr-analyze.yml generates stub spec (template with placeholders)
- cr-develop.yml generates stub SRS and stub product change
- Workflow completes successfully
- Manual note in CR-029.yaml or spec marks it as requiring approval

**Verification:** Check workflow logs for "Stub spec — no ANTHROPIC_API_KEY"

---

## Compliance and Traceability Implications

### Traceability Chain

```
CR-029 (automation pipeline test)
  ├─> Triggers spec generation (cr-analyze.yml)
  ├─> Triggers SRS-XXX creation (automation requirements)
  ├─> Triggers product stub creation (cr-develop.yml)
  └─> Completes lifecycle (new → in_review → implementing → completed)
```

### Schema Validation

All DHF items created as part of CR-029 must:
- Pass `medharness --dhf DHF dhf validate schema`
- Have correct `derives_from` and `links` relationships
- Maintain traceability back to CR-029

**Pre-merge check:**
```bash

medharness --dhf DHF dhf validate schema
pytest DHF/utils/tests/ -v
```

### Compliance Implications

- **IEC 62304:** The automation pipeline demonstrates traceability and change control
  - CR lifecycle states provide an audit trail
  - Automated state transitions are logged in git history
- **ISO 14971:** The test validates that CI/CD changes (workflow modifications) do not introduce new hazards
  - Automation follows the defined CR process
  - All changes are reviewed before merging

### Evidence Artifacts

Evidence that CR-029 succeeded is recorded in:
1. **Git history:** Commits from spec/* and develop/* branches
2. **CR-029.yaml:** State progression (new → in_review → implementing → completed)
3. **SRS-XXX.yaml:** New requirement item created by automation
4. **GitHub Actions logs:** Workflow execution details (available via `gh run list`)

---

## Implementation Notes for Downstream Agents

### For cr-develop.yml (when implementing the spec)

1. **SRS Creation:** Create a new SRS item with:
   - `derives_from: [CR-029]`
   - `title: "Automation Pipeline E2E Test Requirements"`
   - `requirement:` statement about CR lifecycle transitions
   - `test_case: CR-029`

2. **Product Stub:** Create `stub-CR-029.md` at repo root with:
   - Markdown file explaining it's a test artifact
   - Reference back to this spec
   - Can be deleted after CR-029 is completed

3. **Validation:** Before pushing branches, run:
   ```bash
    medharness --dhf DHF dhf validate schema
   ```

4. **PR Titles:** Use exact format:
   - DHF items: `dhf(CR-029): implementation updates`
   - Product repo: `feat(CR-029): implement approved spec`

### For Manual Completion

After both PRs are merged:
```bash

medharness --dhf DHF dhf item transition CR-029 completed --by "User"
git add DHF/items/09_cr/CR-029.yaml
git commit -m "chore: mark CR-029 completed"
git push
```

---

## Success Metrics

CR-029 is successful when:

| Metric | Status |
|--------|--------|
| CR PR merged without errors | ✓ Verify on main |
| Spec PR created and merged | ✓ Verify with `gh pr list` |
| DHF items PR created with SRS | ✓ Verify `DHF/items/03_req_srs/` |
| Product repo PR created | ✓ Verify in itercharles/ContourLab |
| CR-029 state is `completed` | ✓ Verify with `medharness --dhf DHF dhf item get CR-029` |
| All GitHub Actions jobs succeeded | ✓ Verify with `gh run list --repo itercharles/ContourLab` |
| Traceability unbroken (CR→SRS→Test) | ✓ Verify with `/req-manage` |

---

## Appendix: Workflow Architecture

### cr-analyze.yml Sequence

```
CR-029.yaml merged to main
  → detect new CR file (CR-*.yaml)
  → transition CR-029 to in_review
  → invoke Claude with cr-analyze.md prompt
  → generate CR-029-Spec.md
  → create spec/CR-029 branch
  → open spec PR
```

### cr-develop.yml Sequence

```
CR-029-Spec.md merged to main
  → detect merged spec file (CR-*-Spec.md)
  → transition CR-029 to implementing
  → clone product repo (itercharles/ContourLab)
  → invoke Claude with cr-develop.md prompt
  → create SRS item + product stub
  → create develop/CR-029 branch (DHF changes)
  → open DHF items PR
  → create feat/CR-029 branch (product repo)
  → open product repo PR
```

### Manual Completion

```
Both implementation PRs merged
  → manually transition CR-029 to completed
  → commit and push change
  → CR-029 lifecycle validated
```
