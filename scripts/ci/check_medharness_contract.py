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
RELEASE_BASELINE = REPO_ROOT / ".github" / "workflows" / "release-baseline.yml"
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
        "verify dhf": ("python", "-m", "medharness", "verify", "dhf", "--help"),
        "verify tests": ("python", "-m", "medharness", "verify", "tests", "--help"),
        "verify soup": ("python", "-m", "medharness", "verify", "soup", "--help"),
        "verify completion": ("python", "-m", "medharness", "verify", "completion", "--help"),
        "build plan": ("python", "-m", "medharness", "build", "plan", "--help"),
        "build code": ("python", "-m", "medharness", "build", "code", "--help"),
        "build soup": ("python", "-m", "medharness", "build", "soup", "--help"),
        "build release": ("python", "-m", "medharness", "build", "release", "--help"),
        "workflow check-changes": ("python", "-m", "medharness", "workflow", "check-changes", "--help"),
        "workflow check-approval": ("python", "-m", "medharness", "workflow", "check-approval", "--help"),
        "item": ("python", "-m", "medharness", "item", "--help"),
    }
    for name, command in help_commands.items():
        code, _ = run(*command)
        require(code == 0, f"`{name} --help` failed — command missing from the pinned medharness", errors)

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

    texts = {
        "ci-pipeline.yml": CI_PIPELINE.read_text(encoding="utf-8"),
        "cr-lifecycle.yml": CR_LIFECYCLE.read_text(encoding="utf-8"),
        "issue-to-cr.yml": ISSUE_TO_CR.read_text(encoding="utf-8"),
        "cr-complete.yml": CR_COMPLETE.read_text(encoding="utf-8"),
        "soup-sync.yml": SOUP_SYNC.read_text(encoding="utf-8"),
        "release-baseline.yml": RELEASE_BASELINE.read_text(encoding="utf-8"),
    }

    required = {
        "ci-pipeline.yml": [
            "medharness --dhf DHF verify dhf",
            "medharness --dhf DHF verify soup",
            "medharness --dhf DHF verify tests",
            "medharness --dhf DHF workflow check-changes",
            "medharness --dhf DHF build release",
            "medharness --dhf DHF verify completion",
        ],
        "cr-lifecycle.yml": [
            "medharness --dhf DHF build plan",
            "medharness --dhf DHF build code",
            "medharness workflow check-approval",
            "medharness --dhf DHF item transition",
        ],
        "issue-to-cr.yml": [
            "medharness --dhf DHF item create --type CR",
            "medharness --dhf DHF build plan",
            "medharness --dhf DHF item get",
        ],
        "cr-complete.yml": [
            "medharness --dhf DHF item transition",
            "gh pr create",
        ],
        "soup-sync.yml": ["medharness --dhf DHF build soup"],
        "release-baseline.yml": ["medharness --dhf DHF build release", "gh pr create"],
    }
    for filename, needles in required.items():
        for needle in needles:
            require(needle in texts[filename], f"{filename} must call `{needle}`", errors)

    # Retired in 0.32–0.38 (see MedHarness tests/guards/test_the_verbs_are_the_surface.py).
    retired = [
        r"medharness (?:--dhf \S+ )?(?:change|automation|soup-sync|upgrade|evidence|release)\b",
        r"verify (?:classification|branch|verification|plans|code)\b",
        r"medharness (?:--dhf \S+ )?context\b",
        r"\bdhfkit (?:--dhf \S+ )?[a-z]",
        r"--(?:run-schema|run-traceability|coverage-pair|requirement-type|continue-on-gate-failure)\b",
        r"check-approval[^\n]*--(?:stage|cr)\b",
        r"workflow github-event\b",
        r"medharness (?:--dhf \S+ )?build dhf\b",
        r"--(?:junit-dir|ci-failures|require-method)\b",
        r"medharness (?:--dhf \S+ )?doctor\b",
        r"--(?:fail-on-uncovered|fail-on-drift|fail-on-missing-method|traceability-type|run-id|run-url)\b",
        r"sbom[^\n]*--stdout\b",
        r"\[skip ci\]",
    ]
    for filename, text in texts.items():
        for pattern in retired:
            match = re.search(pattern, text)
            require(match is None, f"{filename} uses retired form `{match.group(0) if match else ''}`", errors)

    # These check out main; a push straight to it fails on a protected branch (GH006).
    for filename in ("cr-complete.yml", "soup-sync.yml", "release-baseline.yml"):
        text = texts[filename]
        require(
            re.search(r"^\s*git push\s*$", text, flags=re.MULTILINE) is None,
            f"{filename} has a bare `git push` — push a branch and open a PR instead",
            errors,
        )

    require(
        "--write" not in texts["soup-sync.yml"],
        "soup-sync.yml passes --write — build soup always writes the working tree (0.46+) and rejects the flag",
        errors,
    )
    gen_code = yaml.safe_load(texts["cr-lifecycle.yml"])["jobs"]["gen-code"]["steps"]
    for step in gen_code:
        run_text = "\n".join(
            line for line in str(step.get("run", "")).splitlines() if not line.lstrip().startswith("#")
        )
        if "build code" in run_text:
            require(
                "--pr" not in run_text,
                "cr-lifecycle.yml gen-code passes --pr to build code — it would revise the design reviews "
                "and push before the PR moves to cr:stage/code",
                errors,
            )

    # The closure gate belongs before the merge, where it can block one.
    require(
        "verify completion" not in texts["cr-complete.yml"],
        "cr-complete.yml runs verify completion after the merge — run it on the CR PR in ci-pipeline.yml",
        errors,
    )

    # A PR opened with the default GITHUB_TOKEN starts no workflow, so its
    # required checks never report.
    for filename, text in texts.items():
        doc = yaml.safe_load(text)
        for job_name, job in (doc.get("jobs") or {}).items():
            for step in job.get("steps") or []:
                if "gh pr create" in str(step.get("run", "")):
                    token = str((step.get("env") or {}).get("GH_TOKEN", ""))
                    require(
                        "secrets.ACTIONS_PAT" in token,
                        f"{filename}: job '{job_name}' opens a PR without ACTIONS_PAT — CI will not run on it",
                        errors,
                    )

    for v in check_workflow_step_refs(texts):
        require(False, v, errors)

    if errors:
        for error in errors:
            print(f"ERROR: {error}", file=sys.stderr)
        return 1

    print("PASS: MedHarness contract checks passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
