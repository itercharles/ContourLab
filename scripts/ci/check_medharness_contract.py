#!/usr/bin/env python3
"""Smoke-check the pinned MedHarness contract used by WebTPS workflows."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
CI_PIPELINE = REPO_ROOT / ".github" / "workflows" / "ci-pipeline.yml"
CR_LIFECYCLE = REPO_ROOT / ".github" / "workflows" / "cr-lifecycle.yml"


def iter_reference_specs() -> list[tuple[str, str]]:
    candidates = sorted(
        REPO_ROOT.glob("docs/cr-specs/CR-*-Spec.md"),
        key=lambda path: int(path.stem.split("-")[1]),
        reverse=True,
    )
    if not candidates:
        raise RuntimeError("No docs/cr-specs/CR-*-Spec.md files found for MedHarness smoke checks.")

    return [
        (spec_path.relative_to(REPO_ROOT).stem.rsplit("-", 1)[0], str(spec_path.relative_to(REPO_ROOT)))
        for spec_path in candidates
    ]


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
    try:
        reference_specs = iter_reference_specs()
    except RuntimeError as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        return 1

    help_commands = {
        "validate-spec": ("python", "-m", "medharness", "ci", "validate-spec", "--help"),
        "validate-design": ("python", "-m", "medharness", "ci", "validate-design", "--help"),
        "validate-code": ("python", "-m", "medharness", "ci", "validate-code", "--help"),
        "validate-branch": ("python", "-m", "medharness", "ci", "validate-branch", "--help"),
    }

    help_output: dict[str, str] = {}
    for name, command in help_commands.items():
        code, output = run(*command)
        require(code == 0, f"{name} --help failed", errors)
        help_output[name] = output

    require("--dhf" in help_output["validate-spec"], "validate-spec help must expose local --dhf", errors)
    require("--dhf" not in help_output["validate-design"], "validate-design help must not expose local --dhf", errors)
    require("--dhf" not in help_output["validate-code"], "validate-code help must not expose local --dhf", errors)
    require("--dhf" not in help_output["validate-branch"], "validate-branch help must not expose local --dhf", errors)

    validate_spec_failures: list[str] = []
    validate_spec_passed = False
    for reference_cr, reference_spec in reference_specs:
        code, output = run(
            "python",
            "-m",
            "medharness",
            "ci",
            "validate-spec",
            "--cr",
            reference_cr,
            "--spec",
            reference_spec,
            "--dhf",
            "DHF",
        )
        if code == 0:
            validate_spec_passed = True
            break
        validate_spec_failures.append(f"{reference_cr}: {output.strip()}")

    require(
        validate_spec_passed,
        "validate-spec smoke check failed for all committed specs:\n" + "\n\n".join(validate_spec_failures),
        errors,
    )

    ci_text = CI_PIPELINE.read_text(encoding="utf-8")
    cr_text = CR_LIFECYCLE.read_text(encoding="utf-8")

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
        "python -m medharness --dhf DHF ci validate-design" in cr_text,
        "cr-lifecycle.yml must call validate-design with global --dhf",
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
        "python -m medharness ci validate-design" not in cr_text,
        "cr-lifecycle.yml still contains a local validate-design invocation",
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
