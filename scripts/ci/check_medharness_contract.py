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
MEDHARNESS_ACTION = REPO_ROOT / ".github" / "actions" / "medharness-setup" / "action.yml"
REQUIREMENTS_TXT = REPO_ROOT / "requirements.txt"


def run(*args: str) -> tuple[int, str]:
    result = subprocess.run(
        list(args),
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
        # change group (formerly ci generate-dhf / develop-cr / cr-status / advance-stage)
        "change-plan": ("python", "-m", "medharness", "change", "plan", "--help"),
        "change-implement": ("python", "-m", "medharness", "change", "implement", "--help"),
        "change-status": ("python", "-m", "medharness", "change", "status", "--help"),
        "change-advance": ("python", "-m", "medharness", "change", "advance", "--help"),
        # verify group (formerly ci validate-branch / validate-code)
        "verify-branch": ("python", "-m", "medharness", "verify", "branch", "--help"),
        "verify-code": ("python", "-m", "medharness", "verify", "code", "--help"),
        # approval group (formerly ci approve-gate)
        "approval-check": ("python", "-m", "medharness", "approval", "check", "--help"),
        # automation group (formerly ci claude-session get/put)
        "session-get": ("python", "-m", "medharness", "automation", "session", "get", "--help"),
        "session-put": ("python", "-m", "medharness", "automation", "session", "put", "--help"),
        # dhfkit data-layer commands (unchanged)
        "dhf-report": ("dhfkit", "--dhf", ".", "report", "--help"),
        "dhf-context-implementation": ("python", "-m", "medharness", "dhf", "context", "implementation", "--help"),
        "dhfkit-soup-sync": ("dhfkit", "--dhf", ".", "soup-sync", "--help"),
        "dhfkit-release-baseline": ("dhfkit", "--dhf", ".", "release-baseline", "--help"),
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
        "medharness --dhf DHF verify branch" in ci_text,
        "ci-pipeline.yml must call verify branch with global --dhf",
        errors,
    )
    require(
        "medharness --dhf DHF verify code" in ci_text,
        "ci-pipeline.yml must call verify code with global --dhf",
        errors,
    )
    require(
        "medharness --dhf DHF ci validate-branch" not in ci_text,
        "ci-pipeline.yml still contains old ci validate-branch — use verify branch",
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
        "dhfkit --dhf DHF report" in ci_text,
        "ci-pipeline.yml must emit a dhf report step via dhfkit for human-readable traceability output",
        errors,
    )
    require(
        "medharness --dhf DHF dhf context implementation" in issue_to_cr_text,
        "issue-to-cr.yml must use dhf context implementation to post the plan comment — no inline YAML parsing",
        errors,
    )
    require(
        "yaml.safe_load" not in issue_to_cr_text,
        "issue-to-cr.yml must not parse CR YAML inline — use dhf context implementation",
        errors,
    )

    require(
        "medharness approval check" in cr_text,
        "cr-lifecycle.yml must call approval check before change implement to guard against event misclassification",
        errors,
    )
    require(
        "medharness --dhf DHF change status" in cr_text,
        "cr-lifecycle.yml must emit a change status step for observability in the detect job",
        errors,
    )

    require(
        "medharness change advance" in cr_text,
        "cr-lifecycle.yml must use change advance for label management — no raw gh api label calls",
        errors,
    )

    for v in check_workflow_step_refs({
        "ci-pipeline.yml": ci_text,
        "cr-lifecycle.yml": cr_text,
        "issue-to-cr.yml": issue_to_cr_text,
        "cr-complete.yml": cr_complete_text,
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
