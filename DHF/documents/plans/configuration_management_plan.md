# Software Configuration Management Plan

**Standard:** IEC 62304:2006+AMD1:2015 §5.1.9, §8
**Status:** Active

## 1. Purpose

This document describes the configuration management process for ContourLab, covering all
controlled items in the repository, including the `DHF/` directory that stores the design
history file.

## 2. Configuration Items

The following classes of items are under configuration control:

| Class | Location | Repository |
|---|---|---|
| DHF items (requirements, risks, architecture, design, test records) | `DHF/items/` (YAML) | ContourLab DHF |
| DHF plan documents | `DHF/documents/plans/` | ContourLab DHF |
| DHF specification documents | `DHF/documents/specs/` | ContourLab DHF |
| DHF configuration | `DHF/config/` | ContourLab DHF |
| Application source code | `apps/`, `packages/` | ContourLab |
| CI/CD pipeline | `.github/workflows/` | both |
| JavaScript dependencies | `pnpm-lock.yaml` | ContourLab |
| .NET dependencies | `apps/api/api.csproj` | ContourLab |
| Python dependencies | `requirements.txt` | ContourLab DHF |
| Test results | `DHF/test-results/results.yaml` | ContourLab DHF |

## 3. Version Control

Git is used for all configuration management in the repository:

- Every change is traceable via commit history and pull request audit log
- The `main` branch represents the approved, baselined state
- All changes are made via pull requests; direct commits to `main` are not permitted
- Commit SHA uniquely identifies each version of every controlled item

## 4. Change Control

All non-trivial changes to controlled items require a Change Request (CR) item in
ContourLab DHF. The change control procedure is:

1. Human opens a CR PR in ContourLab DHF (CR status: `in_review`)
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
in ContourLab DHF. Each CR includes:

- Description of the problem
- Affected items (SRS, SYS, SWDD, etc.)
- Severity and safety impact assessment
- Disposition (fix, defer, or accept with justification)

## 8. Timing

Configuration items are placed under version control before verification activities begin.
No verification test may reference an item that is not yet merged to `main` in ContourLab DHF.

## 9. SOUP (Software of Unknown Provenance)

Third-party software components used in ContourLab are identified and documented as SOUP items
in ContourLab DHF. Each SOUP item records:

- Package name and version
- Source (npm registry, NuGet, etc.)
- Safety classification
- Verification of version at integration time (via pinned lock files)
