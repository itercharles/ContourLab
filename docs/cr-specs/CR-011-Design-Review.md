# Design Review: CR-011

**Verdict:** Needs Revision

## Summary

The design for CR-011 (removing the redundant "Submit or track an issue" CTA from the About popup) is accurate, specific, and well-proportioned to the change. The implementation plan names the exact JSX block and test assertion to remove; the DHF impact assessments are clearly argued and reach appropriate "Not required" conclusions for every category (UC/CRS, SYSARCH, SYS/SRS/SWDD, RISK, SOUP); and the verification table provides a complete check matrix including a manual step. The design correctly concludes that no DHF requirement items need to be created or updated for this localised UI deletion. One administrative DHF item was not updated when it should have been.

## Issues

- [ ] **CR-011.yaml — status not transitioned**: The CR status field remains `in_review` even though the spec has been generated and approved (`CR-011-Spec.json` has `disposition: approve`; `CR-011-Spec-Review.md` verdict is Approved) and the active branch is the implementation branch (`feat/CR-011`). By the time the implementation branch is active the CR should have been transitioned to `implementing`. Update `status` in `DHF/items/09_cr/CR-011.yaml` from `in_review` to `implementing`.
