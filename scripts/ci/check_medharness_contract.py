#!/usr/bin/env python3
"""Smoke-check the pinned MedHarness contract used by ContourLab workflows."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path

import yaml


REPO_ROOT = Path(__file__).resolve().parents[2]
CI_PIPELINE = REPO_ROOT / ".github" / "workflows" / "ci-pipeline.yml"
CR_LIFECYCLE = REPO_ROOT / ".github" / "workflows" / "cr-lifecycle.yml"
ISSUE_TO_CR = REPO_ROOT / ".github" / "workflows" / "issue-to-cr.yml"
CR_COMPLETE = REPO_ROOT / ".github" / "workflows" / "cr-complete.yml"
SOUP_SYNC = REPO_ROOT / ".github" / "workflows" / "soup-sync.yml"
MEDHARNESS_ACTION = REPO_ROOT / ".github" / "actions" / "medharness-setup" / "action.yml"
REQUIREMENTS_TXT = REPO_ROOT / "requirements.txt"


def run(*args: str) -> tuple[int, str]:
    cmd = list(args)
    if cmd and cmd[0] == "python":
        cmd[0] = sys.executable
    result = subprocess.run(
        cmd,
        cwd=REPO_ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    return result.returncode, f"{result.stdout}{result.stderr}"


def _normalize_gha_yaml(text: str) -> str:
    """Strip GHA-specific syntax so yaml.safe_load can parse workflow files.

    GitHub Actions YAML files can contain constructs that confuse standard YAML
    parsers: ${{ expr }} template expressions and bare $VARIABLE references at
    column 0 inside run: | block scalars (e.g. shell string continuations).
    """
    text = re.sub(r"\$\{\{[^}]*?\}\}", "GHA_EXPR", text)
    text = re.sub(r"^\$\w[^\n]*", "", text, flags=re.MULTILINE)
    return text


def check_workflow_step_refs(workflow_texts: dict[str, str]) -> list[str]:
    """Return error strings for any steps.X if-condition reference with no matching id in the same job."""
    violations: list[str] = []
    for filename, text in workflow_texts.items():
        try:
            doc = yaml.safe_load(_normalize_gha_yaml(text))
        except yaml.YAMLError as exc:
            violations.append(
                f"{filename}: YAML parse failed — step-ref check skipped: {exc}"
            )
            continue
        if not isinstance(doc, dict):
            continue
        for job_name, job in (doc.get("jobs") or {}).items():
            if not isinstance(job, dict):
                continue
            steps = job.get("steps") or []
            if not isinstance(steps, list):
                continue
            defined_ids = {
                step["id"] for step in steps
                if isinstance(step, dict) and "id" in step
            }
            for step in steps:
                if not isinstance(step, dict):
                    continue
                if_expr = step.get("if")
                if not if_expr:
                    continue
                step_label = step.get("name") or step.get("id") or "<unnamed>"
                for ref in re.findall(r"steps\.(\w+)\.(?:outputs|outcome|conclusion|result)", str(if_expr)):
                    if ref not in defined_ids:
                        violations.append(
                            f"{filename}: job '{job_name}': step '{step_label}' "
                            f"references undefined step id 'steps.{ref}' in if condition"
                        )
    return violations


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def main() -> int:
    errors: list[str] = []

    help_commands = {
        # change group
        "change-plan": ("python", "-m", "medharness", "change", "plan", "--help"),
        "change-implement": ("python", "-m", "medharness", "change", "implement", "--help"),
        "change-verify-branch": ("python", "-m", "medharness", "change", "verify-branch", "--help"),
        "change-verify-completion": ("python", "-m", "medharness", "change", "verify-completion", "--help"),
        # verify group (verify verification removed in 0.25.0 — merged into verify tests)
        "verify-dhf": ("python", "-m", "medharness", "verify", "dhf", "--help"),
        "verify-soup": ("python", "-m", "medharness", "verify", "soup", "--help"),
        "verify-tests": ("python", "-m", "medharness", "verify", "tests", "--help"),
        "verify-classification": ("python", "-m", "medharness", "verify", "classification", "--help"),
        # approval (0.26.0+: moved to change group, renamed verify-approval)
        "change-verify-approval": ("python", "-m", "medharness", "change", "verify-approval", "--help"),
        # automation group
        "automation-github-event": ("python", "-m", "medharness", "automation", "github-event", "--help"),
        # context group
        "context-implementation": ("python", "-m", "medharness", "context", "implementation", "--help"),
        # release group
        "release-baseline": ("python", "-m", "medharness", "release", "baseline", "--help"),
        # soup-sync (0.23.0+: moved from dhfkit to medharness)
        "soup-sync": ("python", "-m", "medharness", "soup-sync", "--help"),
    }

    help_output: dict[str, str] = {}
    for name, command in help_commands.items():
        code, output = run(*command)
        require(code == 0, f"{name} --help failed", errors)
        help_output[name] = output

    action_text = MEDHARNESS_ACTION.read_text(encoding="utf-8")
    req_text = REQUIREMENTS_TXT.read_text(encoding="utf-8")
    action_match = re.search(r'medharness.*?==([0-9]+\.[0-9]+\.[0-9]+)', action_text)
    req_match = re.search(r'medharness(?:\[[^\]]+\])?==([0-9]+\.[0-9]+\.[0-9]+)', req_text)
    if action_match and req_match:
        require(
            action_match.group(1) == req_match.group(1),
            f"medharness version mismatch: action pins {action_match.group(1)}, requirements.txt pins {req_match.group(1)}",
            errors,
        )
    else:
        if not action_match:
            errors.append("medharness-setup/action.yml does not contain a pinned medharness==X.Y.Z install")
        if not req_match:
            errors.append("requirements.txt does not contain a pinned medharness==X.Y.Z line")

    ci_text = CI_PIPELINE.read_text(encoding="utf-8")
    cr_text = CR_LIFECYCLE.read_text(encoding="utf-8")
    issue_to_cr_text = ISSUE_TO_CR.read_text(encoding="utf-8")
    cr_complete_text = CR_COMPLETE.read_text(encoding="utf-8")
    soup_sync_text = SOUP_SYNC.read_text(encoding="utf-8")

    require(
        "python -m medharness --dhf DHF change plan" in cr_text,
        "cr-lifecycle.yml must call change plan with global --dhf",
        errors,
    )
    require(
        "python -m medharness --dhf DHF change implement" in cr_text,
        "cr-lifecycle.yml must call change implement with global --dhf",
        errors,
    )
    require(
        "python -m medharness --dhf DHF ci generate-dhf" not in cr_text,
        "cr-lifecycle.yml still contains old ci generate-dhf call — use change plan",
        errors,
    )
    require(
        "python -m medharness --dhf DHF ci design-cr" not in cr_text,
        "cr-lifecycle.yml must not call design-cr",
        errors,
    )
    require(
        "python -m medharness --dhf DHF ci analyze-cr" not in cr_text,
        "cr-lifecycle.yml must not call analyze-cr",
        errors,
    )
    require(
        "python -m medharness --dhf DHF ci validate-design" not in cr_text,
        "cr-lifecycle.yml must not call validate-design",
        errors,
    )
    require(
        "medharness --dhf DHF verify soup" in ci_text,
        "ci-pipeline.yml must call verify soup to gate on SOUP CVEs (0.11.0+)",
        errors,
    )
    require(
        "medharness --dhf DHF change verify-branch" in ci_text,
        "ci-pipeline.yml must call change verify-branch (0.25.0+: verify branch renamed)",
        errors,
    )
    require(
        "medharness --dhf DHF verify branch" not in ci_text,
        "ci-pipeline.yml still contains old verify branch — use change verify-branch (0.25.0+)",
        errors,
    )
    require(
        "medharness --dhf DHF ci validate-branch" not in ci_text,
        "ci-pipeline.yml still contains old ci validate-branch — use change verify-branch",
        errors,
    )
    require(
        "medharness --dhf DHF ci validate-code" not in ci_text,
        "ci-pipeline.yml still contains old ci validate-code — use verify code",
        errors,
    )
    require(
        "design-cr" not in cr_text,
        "cr-lifecycle.yml still contains design-cr references",
        errors,
    )
    require(
        "analyze-cr" not in cr_text,
        "cr-lifecycle.yml still contains analyze-cr references",
        errors,
    )
    require(
        "validate-design" not in cr_text,
        "cr-lifecycle.yml still contains validate-design references",
        errors,
    )

    require(
        "cr=gen-design" not in cr_text,
        "cr-lifecycle.yml must not have cr=gen-design dispatch action",
        errors,
    )
    require(
        "cr-no-revise" not in cr_text,
        "cr-lifecycle.yml must not reference cr-no-revise",
        errors,
    )
    require(
        '--label "cr:stage/cr"' not in issue_to_cr_text,
        "issue-to-cr.yml must not open PRs with cr:stage/cr label",
        errors,
    )
    require(
        "python -m medharness --dhf DHF change plan" in issue_to_cr_text,
        "issue-to-cr.yml must call change plan inline at intake",
        errors,
    )
    require(
        "python -m medharness --dhf DHF ci generate-dhf" not in issue_to_cr_text,
        "issue-to-cr.yml still contains old ci generate-dhf — use change plan",
        errors,
    )

    require(
        "medharness --dhf DHF verify dhf" in ci_text,
        "ci-pipeline.yml must emit a dhf traceability step via medharness verify dhf",
        errors,
    )
    require(
        "medharness --dhf DHF context implementation" in issue_to_cr_text,
        "issue-to-cr.yml must use context implementation to post the plan comment — no inline YAML parsing",
        errors,
    )
    require(
        "dhfkit --dhf DHF item create --type CR" in issue_to_cr_text,
        "issue-to-cr.yml must use dhfkit item create --type CR for CR intake — not the removed intake-github-issue-ci command",
        errors,
    )
    require(
        "yaml.safe_load" not in issue_to_cr_text,
        "issue-to-cr.yml must not parse CR YAML inline — use dhf context implementation",
        errors,
    )

    require(
        "medharness change verify-approval" in cr_text,
        "cr-lifecycle.yml must call change verify-approval (0.26.0+: approval check renamed) before change implement",
        errors,
    )
    require(
        "medharness approval check" not in cr_text,
        "cr-lifecycle.yml still uses removed approval check — rename to change verify-approval (0.26.0+)",
        errors,
    )
    require(
        "change status" not in cr_text,
        "cr-lifecycle.yml still references removed change status command (removed in 0.23.0)",
        errors,
    )
    require(
        "change advance" not in cr_text,
        "cr-lifecycle.yml still references removed change advance command (removed in 0.23.0)",
        errors,
    )
    require(
        "gh pr edit" in cr_text and "--remove-label" in cr_text,
        "cr-lifecycle.yml must use raw gh pr edit --remove-label / --add-label for stage label management (change advance removed in 0.23.0)",
        errors,
    )
    require(
        "dhfkit --dhf DHF item transition" in cr_complete_text,
        "cr-complete.yml must use dhfkit item transition to complete the CR (complete-from-github-pr removed in 0.23.0)",
        errors,
    )

    require(
        "medharness --dhf DHF ci cr-complete" not in cr_complete_text,
        "cr-complete.yml still contains old ci cr-complete — use change verify-completion",
        errors,
    )
    require(
        "medharness verify completion" not in cr_complete_text,
        "cr-complete.yml still uses old verify completion — use change verify-completion (0.25.0+)",
        errors,
    )
    require(
        "medharness --dhf DHF change verify-completion" in cr_complete_text,
        "cr-complete.yml must call change verify-completion for CR closure gate (0.25.0+)",
        errors,
    )
    require(
        "--pr" in cr_complete_text,
        "cr-complete.yml must pass --pr to change verify-completion for review-based approval evidence",
        errors,
    )
    require(
        "medharness --dhf DHF verify classification" in ci_text,
        "ci-pipeline.yml must call verify classification (IEC 62304 §4.3 safety class check)",
        errors,
    )

    require(
        "medharness --dhf DHF soup-sync" in soup_sync_text,
        "soup-sync.yml must call medharness soup-sync (moved from dhfkit in 0.23.0)",
        errors,
    )
    require(
        "dhfkit" not in soup_sync_text or "soup-sync" not in soup_sync_text,
        "soup-sync.yml still calls dhfkit soup-sync — command moved to medharness in 0.23.0",
        errors,
    )

    for v in check_workflow_step_refs({
        "ci-pipeline.yml": ci_text,
        "cr-lifecycle.yml": cr_text,
        "issue-to-cr.yml": issue_to_cr_text,
        "cr-complete.yml": cr_complete_text,
        "soup-sync.yml": soup_sync_text,
    }):
        require(False, v, errors)

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print("PASS: MedHarness contract checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
