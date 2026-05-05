# CR-034 Remove the "Threshold" Button on the UI — Technical Specification

## Problem Summary

The WebTPS UI currently displays a "threshold" button that is not implemented. This non-functional UI element creates confusion for users as it suggests functionality that does not exist. The button should be removed to present only supported features in the interface.

**Source issue:** https://github.com/itercharles/WebTPS/issues/7

## Intended Outcome

Upon completion of CR-034:
- ✅ The "threshold" button is completely removed from the UI
- ✅ No non-functional buttons remain in the affected interface
- ✅ User interface displays only implemented, functional controls
- ✅ No layout breakage or styling issues after button removal
- ✅ All existing tests pass with no regression
- ✅ Change merged to main in WebTPS repository
- ✅ CR-034 state transitioned to `completed` upon implementation merge

---

## Technical Approach

### Scope

This is a UI cleanup task to remove a non-functional button. No architectural changes, no API modifications, no backend logic changes, no database changes, and no behavior modifications.

### Design Rationale

CR-034 is intentionally simple and isolated:
- Single UI element removal (not a feature addition)
- No dependencies on other CRs or DHF items
- Self-contained product code change
- Improves user experience by removing false affordances
- Low risk of breaking existing functionality
- Direct response to user feedback (Issue #7)

### Implementation Steps

1. **Locate the threshold button in WebTPS**
   - Search the codebase for UI elements or buttons containing "threshold" in the text or ID
   - Identify the component file(s) where the button is rendered
   - Note the button's context (what page/section it appears in)
   - Check if there are any event handlers or state tied to the button

2. **Remove the button**
   - Delete the button element from the JSX/HTML markup
   - Remove any event handlers or callbacks associated with the button
   - Remove any CSS classes that only apply to this button (if not reused)
   - Remove any state variables specifically used for this button's behavior

3. **Verify layout integrity**
   - Run the application locally (dev server)
   - Navigate to the page containing the removed button
   - Visually confirm the page layout is intact and properly formatted
   - Check for any spacing/alignment issues caused by the removal
   - Ensure adjacent UI elements are properly positioned

### Expected Product Code Changes

**Repository:** `itercharles/WebTPS`

**Files affected:** Component file(s) containing the threshold button (e.g., `src/components/SomeComponent.tsx`, `src/pages/SomePage.tsx`, or similar)

**Change Type:** UI element removal — delete the threshold button JSX element and any associated code

**Search strategy:**
- Search for `threshold` (case-insensitive) in JSX/HTML files
- Look for button elements with "threshold" in the text, className, id, or aria-label
- Check for related state variables, handlers, or event listeners
- Common patterns: `<button>Threshold</button>`, `Button` component with threshold label, toggles/switches labeled "threshold"

**Example removal pattern:**
```typescript
// BEFORE: Button exists
<div className="controls">
  <button onClick={handleThreshold}>Threshold</button>
  <button onClick={handleOther}>Other</button>
</div>

// AFTER: Button removed
<div className="controls">
  <button onClick={handleOther}>Other</button>
</div>
```

**If associated state exists, remove it too:**
```typescript
// BEFORE: State for threshold
const [thresholdEnabled, setThresholdEnabled] = useState(false);

// AFTER: State removed (if not used elsewhere)
// (no thresholdEnabled state)
```

### Build and Bundling Considerations

- No new dependencies required
- No dependencies to remove (the removal should not create dead imports)
- Standard component update (no bundler configuration changes needed)
- No environment variables or build-time configuration involved

---

## DHF Items to Create or Update

### CR-034 (Update)

**File:** `DHF/items/09_cr/CR-034.yaml`

**Status transition:** `in_review` → `designing` (when design begins) → `implementing` (when implementation PR opens) → `completed` (when merged)

**Rationale:** This CR contains only product code changes. No new system requirements, design documents, or test documentation items are needed. The feature removal is self-contained and fully captured in the component modification.

---

## Product Code Changes Expected

### Task: Remove Non-Functional Threshold Button

**Repository:** `itercharles/WebTPS`

**Search for threshold button:**

```bash
# Search for "threshold" in component files
grep -ri "threshold" src/ --include="*.tsx" --include="*.jsx" --include="*.ts" --include="*.js"

# May also appear in CSS/styling files
grep -ri "threshold" src/ --include="*.css" --include="*.scss"
```

**Implementation checklist:**

- [ ] Identify all files containing references to the threshold button
- [ ] Locate the button element in JSX/component code
- [ ] Remove the button from the render output
- [ ] Remove associated event handlers (e.g., `handleThreshold`, `onThresholdChange`)
- [ ] Remove state variables that only serve the threshold button (e.g., `thresholdEnabled`, `thresholdValue`)
- [ ] Remove any CSS classes that only apply to the threshold button
- [ ] Remove any conditional rendering logic tied solely to the threshold feature
- [ ] Verify no broken imports or unused variables remain
- [ ] Ensure TypeScript or linting does not report errors on remaining code
- [ ] Test in browser (dev server) — visually confirm button is gone and layout is intact
- [ ] No layout breakage, proper spacing maintained
- [ ] No console errors or warnings related to the change

**No other changes required:** This is a cleanup-only modification. No functional code, new features, API calls, or dependencies should be added.

---

## Verification and Test Cases

### Test Case 1: Threshold Button Removal

**Step:** After code changes are applied locally

**Expected Outcome:**
- Run the application (dev server)
- Navigate to the page/section where the threshold button was located
- Threshold button is no longer visible in the UI
- The control area or page layout is properly formatted without the button
- No orphaned UI elements or dangling markup remain
- Spacing and alignment of adjacent controls are correct

**Verification Method:**
```bash
# In WebTPS repository
npm start  # or appropriate command to run dev server
# Navigate to the page/section containing the former threshold button
# Visually inspect that the button is gone
# Check browser dev tools for any console errors or warnings
# Use browser inspector to verify the button element does not exist in the DOM
```

### Test Case 2: No Regression

**Expected Outcome:**
- All existing UI functionality remains intact
- All existing tests pass
- No styling or layout issues on the affected page/component
- All other pages and features unaffected
- No console errors or warnings
- No broken or dangling references to threshold functionality

**Verification Method:**
```bash
npm test  # or appropriate test command
npm run build  # verify no build errors or unused-variable warnings
npm run lint  # verify code quality standards are met
# Visually inspect the page in browser
# Check browser console for errors
# Run type checking (if applicable):
npm run type-check  # or equivalent TypeScript validation
```

### Test Case 3: Layout and Spacing Verification

**Expected Outcome:**
- No layout shift or unexpected spacing changes after button removal
- Adjacent UI elements are properly aligned
- The removed button's space is naturally filled by layout flow
- Page is responsive and looks correct on different screen sizes
- No overlapping or hidden elements

**Verification Method:**
```bash
# With dev server running
# Open the page in browser
# Open browser dev tools (F12)
# Inspect the element tree where the button was
# Verify button element is not present in the DOM
# Check computed styles of adjacent elements
# Resize browser window and verify layout stability
# Test on mobile view if responsive design applies
```

### Test Case 4: Source Control

**Expected Outcome:**
- Code change appears as a single logical commit
- Commit message references CR-034
- Diff shows only the threshold button code removed
- No unintended modifications to other files
- No dead code, unused imports, or orphaned state variables

**Verification Method:**
```bash
git log --oneline | grep CR-034
git show <commit-hash>  # verify clean diff
# Inspect the diff to ensure only removal (no unrelated changes)
```

---

## Compliance and Traceability Implications

### Traceability Chain

```
CR-034 (bug fix: remove threshold button)
  └─> Product code change (remove button element from component)
       └─> Verification in UI (button no longer visible, layout intact)
```

### Schema Validation

No new DHF items are created by this CR, so no schema validation beyond the CR-034 item itself.

**Pre-merge check:**
```bash

python -m compliantflow --dhf DHF dhf validate schema
```

### Compliance Notes

- **IEC 62304:** This change removes a non-functional UI element with no impact on system behavior, control flow, risk mitigation, or functional requirements. It is a cosmetic removal only (bug fix to user interface).
- **ISO 14971:** No new or modified hazards introduced. Removing a non-functional button eliminates a false affordance that could confuse users but does not affect application safety, security, or functional requirements.
- **Change Control:** The CR process documents why the change was made (issue #7, user feedback); the spec captures the implementation plan.

### Evidence Artifacts

Evidence that CR-034 succeeded is recorded in:

1. **Git history:** Commit message and diff in WebTPS repository showing threshold button removal
2. **CR-034.yaml:** State progression from `in_review` → `implementing` → `completed`
3. **Visual verification:** Browser screenshot or manual confirmation of the page showing button is gone and layout is intact
4. **GitHub Actions logs:** Workflow execution details (available via `gh run list`)

---

## Implementation Notes for Downstream Agents

### For Implementation in WebTPS Repository

1. **Search for the threshold button:**
   ```bash
   grep -ri "threshold" src/ --include="*.tsx" --include="*.jsx" --include="*.ts" --include="*.js" --include="*.css"
   ```

2. **Examine the button in context:**
   - Open the file(s) containing the threshold button
   - Understand the component structure and layout
   - Identify any state variables or handlers tied to the button
   - Check if the button is rendered conditionally or always displayed

3. **Remove the button:**
   - Delete the `<button>` element (or equivalent control) from the JSX
   - Delete any `onClick`, `onChange`, or other event handlers specific to the button
   - Delete any state variables that only serve the threshold button
   - Remove any CSS classes that only apply to this button

4. **Clean up related code:**
   - If a handler function like `handleThreshold()` only serves this button, remove it
   - If a state variable like `thresholdEnabled` is not used elsewhere, remove it
   - Check imports at the top of the file and remove any unused ones
   - Verify no other component references this button or its handlers

5. **Run linter and type checker:**
   ```bash
   npm run lint  # or eslint
   npm run type-check  # if applicable
   ```

6. **Run tests and build:**
   ```bash
   npm test  # ensure all tests still pass
   npm run build  # ensure build is successful with no warnings
   ```

7. **Local verification:**
   - Start dev server: `npm start`
   - Navigate to the page where the threshold button was located
   - Visually confirm the button is no longer visible
   - Verify the page layout is intact and properly formatted
   - Check spacing and alignment of remaining controls
   - Inspect browser dev tools console for any errors or warnings
   - Test on different screen sizes if responsive design is in place
   - Reload page and confirm removal persists

8. **Commit:**
   ```bash
   git add src/path/to/affected/component.tsx  # (or affected files)
   git commit -m "fix(ui): remove non-functional threshold button

   Removes the threshold button from the UI as it is not implemented.
   The button previously appeared on [describe location/component] and 
   suggested functionality that was not available, creating user confusion.
   
   Fixes GitHub issue #7.
   Related to CR-034."
   ```

9. **Create and open PR:**
   - Push the branch and create a PR in WebTPS repository
   - Title the PR: `fix(CR-034): remove non-functional threshold button`
   - Reference GitHub issue #7 in the PR description
   - Link to CR-034 if issue tracking is used
   - Request review

### Post-Merge Steps

After the implementation PR is merged to main in WebTPS:

1. Return to WebTPS-DHF repository
2. Transition CR-034 to `completed`:
   ```bash
   
   python -m compliantflow --dhf DHF dhf item transition CR-034 completed --by "ImplementationAgent"
   git add DHF/items/09_cr/CR-034.yaml
   git commit -m "chore: mark CR-034 completed

   Non-functional threshold button removed from UI.
   Related to CR-034."
   git push
   ```

3. Verify CR-034 is in `completed` state:
   ```bash
   python -m compliantflow --dhf DHF dhf item get CR-034 | grep status
   ```

---

## Success Metrics

CR-034 is successful when:

| Metric | Status |
|--------|--------|
| Threshold button is removed from UI | ✓ Verify in code and browser |
| Button is not visible on the page | ✓ Visual inspection |
| No layout or spacing regressions | ✓ Inspect browser layout |
| All existing tests pass | ✓ Run test suite |
| No console errors or warnings | ✓ Check browser console |
| Build completes successfully | ✓ Run `npm run build` |
| Implementation PR merged to main | ✓ Verify in WebTPS main branch |
| CR-034 state is `completed` | ✓ Verify with `python -m compliantflow --dhf DHF dhf item get CR-034` |
| Issue #7 is resolved | ✓ Confirm via GitHub issue closure |

---

## Appendix: Context

**CR Details from CR-034.yaml:**
- **ID:** CR-034
- **Title:** remove the "threshold" button on the UI
- **Category:** Bug
- **Priority:** Medium
- **Requested by:** itercharles
- **Target version:** 2026-W17 (week of April 21-27, 2026)
- **Description:** The threshold button is not implemented and should not be displayed on the UI. Removing it will show only supported functions.
- **Justification:** The software should only show the supported function. A non-functional button creates user confusion.
- **Acceptance criteria:** The threshold button is not displayed on the UI.

**Related Repositories:**
- **DHF repo:** itercharles/WebTPS-DHF
- **Product repo:** itercharles/WebTPS
- **Issue tracker:** GitHub issue #7 in WebTPS repository

**Timeline:**
- Target merge: week of April 21-27, 2026 (2026-W17)
- Priority: Medium

**Change Type:** Bug fix (UI cleanup)
