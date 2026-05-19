# Software Maintenance Plan

**Standard:** IEC 62304:2006+AMD1:2015 §6
**Status:** Active

## 1. Purpose

This document describes the software maintenance process for ContourLab after initial release,
in accordance with IEC 62304 §6. Maintenance covers all activities required to keep the
software functioning correctly and safely across its operational lifecycle.

## 2. Feedback Monitoring

Post-production feedback is monitored through:

- User-reported issues submitted via the project issue tracker
- Clinical incident reports reviewed by the risk manager
- Post-market surveillance inputs reviewed at regular intervals (minimum: each release cycle)
- Monitoring of SOUP (third-party component) vulnerability disclosures relevant to
  packages listed in `pnpm-lock.yaml` and `apps/api/api.csproj`

## 3. Problem Reporting

Each problem detected in released software is documented as a CR item in ContourLab-DHF,
including:

- Description of the problem and steps to reproduce
- Affected software version (Git tag and commit SHA)
- Severity and clinical safety impact assessment
- Whether the problem constitutes a new hazard (triggering RISK item creation)

## 4. Problem Evaluation

Each CR is evaluated to determine:

- Whether a software change is required
- The effect on safety of the released software (if any)
- Whether the problem affects IEC 62304 regulated functionality
- Required risk management activities (new RISK/RCM items if applicable)
- Priority: safety-critical (fix immediately), high (fix in next release), or low (defer)

## 5. Change Implementation

Changes to released software follow the full CR-driven development process:

1. CR item created in ContourLab-DHF
2. Plan Spec PR reviewed and approved
3. Implementation PR reviewed and merged
4. Affected verification/validation tests re-executed
5. Traceability report confirms no new gaps introduced

Changes that affect safety-critical functionality require re-execution of all affected
Test-SRS and Test-SYS tests before re-release.

## 6. Re-Release

Modified software is re-released following the procedure in the Development Plan §7.2:

- CI pipeline (dev → verify → validate → compliance) passes on `main`
- DHF traceability report shows 0 orphans for the release scope
- Release notes updated with new version, changes, and any known residual anomalies
- New Git tag created on the passing `main` commit

## 7. SOUP Maintenance

Third-party components (SOUP) are reviewed at each release:

- Check for security vulnerabilities in `pnpm-lock.yaml` dependencies (`pnpm audit`)
- Check for security vulnerabilities in .NET dependencies (`dotnet list package --vulnerable`)
- Update pinned versions when vulnerabilities are identified, following the CR process
- Verify that SOUP item records in ContourLab-DHF reflect current versions in use

## 8. End of Life

When ContourLab is retired:

- A final release note documents the retirement decision and date
- All DHF items are transitioned to `retired` status
- The Git repository is archived (read-only) with the final release tag preserved
