#!/usr/bin/env python3
"""Smoke-check the pinned MedHarness contract used by WebTPS workflows."""

from __future__ import annotations

import re
import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
CI_PIPELINE = REPO_ROOT / ".github" / "workflows" / "ci-pipeline.yml"
CR_LIFECYCLE = REPO_ROOT / ".github" / "workflows" / "cr-lifecycle.yml"
ISSUE_TO_CR = REPO_ROOT / ".github" / "workflows" / "issue-to-cr.yml"
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


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def main() -> int:
    errors: list[str] = []

    help_commands = {
        "generate-dhf": ("python", "-m", "medharness", "ci", "generate-dhf", "--help"),
        "develop-cr": ("python", "-m", "medharness", "ci", "develop-cr", "--help"),
        "validate-code": ("python", "-m", "medharness", "ci", "validate-code", "--help"),
        "validate-branch": ("python", "-m", "medharness", "ci", "validate-branch", "--help"),
        # 0.6.1 commands
        # claude-session get/put are smoke-checked for install completeness but are
        # NOT called explicitly in workflows — session threading is handled internally
        # by generate-dhf and develop-cr when --pr is supplied.
        "claude-session-get": ("python", "-m", "medharness", "ci", "claude-session", "get", "--help"),
        "claude-session-put": ("python", "-m", "medharness", "ci", "claude-session", "put", "--help"),
        "dhf-report": ("python", "-m", "medharness", "dhf", "report", "--help"),
        "dhf-context-implementation": ("python", "-m", "medharness", "dhf", "context", "implementation", "--help"),
        # 0.6.2 commands
        "ci-approve-gate": ("python", "-m", "medharness", "ci", "approve-gate", "--help"),
        "ci-cr-status": ("python", "-m", "medharness", "ci", "cr-status", "--help"),
        # 0.6.3 commands
        "ci-advance-stage": ("python", "-m", "medharness", "ci", "advance-stage", "--help"),
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

    require(
        "python -m medharness --dhf DHF ci generate-dhf" in cr_text,
        "cr-lifecycle.yml must call generate-dhf with global --dhf",
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
        "medharness --dhf DHF ci validate-branch" in ci_text,
        "ci-pipeline.yml must call validate-branch with global --dhf",
        errors,
    )
    require(
        "medharness --dhf DHF ci validate-code" in ci_text,
        "ci-pipeline.yml must call validate-code with global --dhf",
        errors,
    )
    require(
        "medharness ci validate-branch" not in ci_text,
        "ci-pipeline.yml still contains a local validate-branch invocation",
        errors,
    )
    require(
        "medharness ci validate-code" not in ci_text,
        "ci-pipeline.yml still contains a local validate-code invocation",
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

    # MedHarness 0.5: CR review stage eliminated — intake goes straight to design.
    require(
        "cr=gen-design" not in cr_text,
        "cr-lifecycle.yml must not have cr=gen-design dispatch action — CR review stage removed in 0.5",
        errors,
    )
    require(
        "cr-no-revise" not in cr_text,
        "cr-lifecycle.yml must not reference cr-no-revise — CR review stage removed in 0.5",
        errors,
    )
    require(
        '--label "cr:stage/cr"' not in issue_to_cr_text,
        "issue-to-cr.yml must not open PRs with cr:stage/cr label — CR review stage removed in 0.5",
        errors,
    )
    require(
        "python -m medharness --dhf DHF ci generate-dhf" in issue_to_cr_text,
        "issue-to-cr.yml must call generate-dhf inline — design is generated at intake in 0.5",
        errors,
    )
    # 0.6.3: generate-dhf exits 1 on completed_with_errors — workflow gates on exit code,
    # not by parsing JSON and checking the outcome field.

    # MedHarness 0.6.1: dhf report + dhf context implementation adopted.
    require(
        "medharness --dhf DHF dhf report" in ci_text,
        "ci-pipeline.yml must emit a dhf report step (0.6.1) for human-readable traceability output",
        errors,
    )
    require(
        "medharness --dhf DHF dhf context implementation" in issue_to_cr_text,
        "issue-to-cr.yml must use dhf context implementation (0.6.1) to post the plan comment — no inline YAML parsing",
        errors,
    )
    require(
        "yaml.safe_load" not in issue_to_cr_text,
        "issue-to-cr.yml must not parse CR YAML inline — use dhf context implementation (0.6.1)",
        errors,
    )

    # MedHarness 0.6.2: approve-gate + cr-status adopted.
    require(
        "medharness ci approve-gate" in cr_text,
        "cr-lifecycle.yml must call approve-gate before develop-cr to guard against event misclassification (0.6.2)",
        errors,
    )
    require(
        "medharness --dhf DHF ci cr-status" in cr_text,
        "cr-lifecycle.yml must emit a cr-status step (0.6.2) for observability in the detect job",
        errors,
    )

    # MedHarness 0.6.3: advance-stage replaces manual gh api label management.
    require(
        "medharness ci advance-stage" in cr_text,
        "cr-lifecycle.yml must use ci advance-stage for label management — no raw gh api label calls (0.6.3)",
        errors,
    )

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print("PASS: MedHarness contract checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
