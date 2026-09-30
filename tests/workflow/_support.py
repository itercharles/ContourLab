"""Helpers for the CR workflow tests: no model, no GitHub, no network."""

from __future__ import annotations

import json
import os
import re
import shutil
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path

import yaml

REPO = Path(__file__).resolve().parents[2]
WORKFLOWS = REPO / ".github" / "workflows"

GHA_EXPR = re.compile(r"\$\{\{.*?\}\}")


def step_script(workflow_file: str, job: str, *, step_id: str | None = None, step_name: str | None = None) -> str:
    """The `run:` text of one workflow step, with ${{ }} expressions replaced by $GHA_EXPR."""
    doc = yaml.safe_load((WORKFLOWS / workflow_file).read_text(encoding="utf-8"))
    for step in doc["jobs"][job]["steps"]:
        if (step_id and step.get("id") == step_id) or (step_name and step.get("name") == step_name):
            return GHA_EXPR.sub("$GHA_EXPR", step["run"])
    raise LookupError(f"{workflow_file}: job {job!r} has no step id={step_id!r} name={step_name!r}")


def run(cmd: list[str], *, cwd: Path, env: dict[str, str] | None = None, check: bool = True) -> subprocess.CompletedProcess:
    full_env = {**os.environ, **(env or {})}
    result = subprocess.run(cmd, cwd=cwd, env=full_env, capture_output=True, text=True, check=False)
    if check and result.returncode != 0:
        raise AssertionError(f"{' '.join(cmd)} exited {result.returncode}\n{result.stdout}\n{result.stderr}")
    return result


def git(cwd: Path, *args: str, check: bool = True) -> subprocess.CompletedProcess:
    return run(["git", "-c", "user.name=test", "-c", "user.email=test@example.com", *args], cwd=cwd, check=check)


def medharness(cwd: Path, *args: str, check: bool = True) -> dict | None:
    """Run `medharness --dhf DHF <args>`; return the JSON on stdout (None when there is none)."""
    result = run(["medharness", "--dhf", "DHF", *args], cwd=cwd, check=check)
    try:
        return json.loads(result.stdout.splitlines()[0])
    except (IndexError, json.JSONDecodeError):
        return None


def medharness_code(cwd: Path, *args: str) -> int:
    return run(["medharness", "--dhf", "DHF", *args], cwd=cwd, check=False).returncode


class Scratch(unittest.TestCase):
    """A temporary directory per test, with a copy of the real DHF on demand."""

    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self._tmp.cleanup)
        self.tmp = Path(self._tmp.name)

    def scratch_dhf(self, root: Path | None = None) -> Path:
        root = root or self.tmp / "dhf-copy"
        root.mkdir(parents=True, exist_ok=True)
        shutil.copytree(REPO / "DHF", root / "DHF", dirs_exist_ok=True)
        return root

    def new_cr(self, root: Path, *, affected: list[str] | None = None, status: str = "new") -> str:
        """Create a CR the way intake does, record what build plan would, and move it to `status`."""
        created = medharness(root, "item", "create", "--type", "CR", "--data", json.dumps({
            "title": "scratch CR", "description": "test", "requested_by": "test",
            "priority": "Low", "status": "new",
        }))
        cr_id = created["id"]
        medharness(root, "item", "update", cr_id, "--data", json.dumps({
            "implementation_notes": "notes",
            "affected_items": affected or [],
            "affected_risk_items": [],
            "triage_result": {"verdict": "approved", "complexity": "small",
                              "affected_subsystems": [], "related_crs": [], "notes": "test"},
        }))
        for state in {"new": [], "design": ["design"], "develop": ["design", "develop"]}[status]:
            medharness(root, "item", "transition", cr_id, state)
        return cr_id

    def item_files(self, root: Path, item_id: str) -> list[Path]:
        return sorted((root / "DHF" / "items").rglob(f"{item_id}.yaml"))


def stub_bin(directory: Path, name: str, body: str) -> None:
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / name
    path.write_text("#!/usr/bin/env bash\n" + body, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IEXEC)
