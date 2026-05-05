# Software Configuration Management Plan

**Standard:** IEC 62304:2006+AMD1:2015 §5.1.9, §8
**Status:** Active

## 1. Purpose

This document describes the configuration management process for WebTPS, covering all
controlled items across the two-repository structure: `WebTPS` (application code) and
`WebTPS-DHF` (Design History File).

## 2. Configuration Items

The following classes of items are under configuration control:

| Class | Location | Repository |
|---|---|---|
| DHF items (requirements, risks, architecture, design, test records) | `DHF/items/` (YAML) | WebTPS-DHF |
| DHF plan documents | `DHF/documents/plans/` | WebTPS-DHF |
| DHF specification documents | `DHF/documents/specs/` | WebTPS-DHF |
| DHF configuration | `DHF/config/` | WebTPS-DHF |
| Application source code | `apps/`, `packages/` | WebTPS |
| CI/CD pipeline | `.github/workflows/` | both |
| JavaScript dependencies | `pnpm-lock.yaml` | WebTPS |
| .NET dependencies | `apps/api/api.csproj` | WebTPS |
| Python dependencies | `requirements.txt` | WebTPS-DHF |
| Test results | `DHF/test-results/results.yaml` | WebTPS-DHF |

## 3. Version Control

Git is used for all configuration management across both repositories:

- Every change is traceable via commit history and pull request audit log
- The `main` branch represents the approved, baselined state
- All changes are made via pull requests; direct commits to `main` are not permitted
- Commit SHA uniquely identifies each version of every controlled item

## 4. Change Control

All non-trivial changes to controlled items require a Change Request (CR) item in
WebTPS-DHF. The change control procedure is:

1. Human opens a CR PR in WebTPS-DHF (CR status: `in_review`)
2. Human approves the CR PR → agent generates a Plan Spec PR (CR status: `designing`)
3. Human approves the Plan Spec PR → agent implements and opens an Implementation PR (CR status: `implementing`)
4. Human reviews and merges the Implementation PR (CR status: `completed`)

Approval is recorded by the GitHub pull request merge event (author, timestamp, reviewer
identity in the GitHub audit log).

## 5. Configuration Identification

- **DHF items**: identified by prefixed unique ID (e.g. `SYS-001`, `SRS-012`, `CR-031`)
- **Software versions**: identified by Git commit SHA and semantic version tag (`vX.Y.Z`)
- **Documents**: identified by filename within the versioned repository
- **Releases**: identified by Git tag on `main`, recorded in release notes

## 6. Configuration Status Accounting

The full history of all controlled items is retained via Git commit log. At any point:

- `git log` provides the complete change history of any file
- `git blame` identifies the commit responsible for each line of any controlled item
- GitHub Actions run history records all CI executions and their artifact outputs
- DHF traceability report (generated on each main-branch build) provides a point-in-time
  snapshot of item status and coverage

## 7. Problem Resolution

Software problems detected in released or in-development software are recorded as CR items
in WebTPS-DHF. Each CR includes:

- Description of the problem
- Affected items (SRS, SYS, SWDD, etc.)
- Severity and safety impact assessment
- Disposition (fix, defer, or accept with justification)

## 8. Timing

Configuration items are placed under version control before verification activities begin.
No verification test may reference an item that is not yet merged to `main` in WebTPS-DHF.

## 9. SOUP (Software of Unknown Provenance)

Third-party software components used in WebTPS are identified and documented as SOUP items
in WebTPS-DHF. Each SOUP item records:

- Package name and version
- Source (npm registry, NuGet, etc.)
- Safety classification
- Verification of version at integration time (via pinned lock files)
