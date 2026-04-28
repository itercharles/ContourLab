"""WebTPS-facing adapter boundary for DHF operations.

Callers in this repository should depend on this module instead of DHF file
paths or a specific DHF backend implementation.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Protocol


Runner = Callable[..., subprocess.CompletedProcess[str]]


class DHFAdapterError(RuntimeError):
    """Raised when a DHF adapter operation fails."""


class DHFAdapter(Protocol):
    def list_items(self, doc_type: str | None = None) -> list[dict[str, Any]]: ...

    def get_item(self, item_id: str) -> dict[str, Any] | None: ...

    def create_item(
        self,
        doc_type: str,
        data: dict[str, Any],
        *,
        author: str,
        cr_id: str | None = None,
    ) -> dict[str, Any]: ...

    def update_item(
        self,
        item_id: str,
        data: dict[str, Any],
        *,
        author: str,
        cr_id: str | None = None,
    ) -> dict[str, Any] | None: ...

    def transition_item(self, item_id: str, to_state: str, *, performed_by: str) -> dict[str, Any]: ...

    def get_document(self, doc_id: str) -> str | None: ...

    def get_cr_context(self, cr_id: str) -> dict[str, Any]: ...


@dataclass(frozen=True)
class LocalUtilsDHFAdapter:
    """Adapter implementation backed by the current WebTPS-DHF Python utils."""

    dhf_repo: Path
    python_executable: str = sys.executable
    runner: Runner = subprocess.run

    @property
    def dhf_root(self) -> Path:
        return self.dhf_repo.resolve() / "DHF"

    def _env(self) -> dict[str, str]:
        env = os.environ.copy()
        pythonpath = [str(self.dhf_root), str(self.dhf_repo.resolve())]
        if env.get("PYTHONPATH"):
            pythonpath.append(env["PYTHONPATH"])
        env["PYTHONPATH"] = os.pathsep.join(pythonpath)
        return env

    def _run_utils(self, args: list[str]) -> str:
        command = [
            self.python_executable,
            "-m",
            "utils",
            "--dhf",
            str(self.dhf_root),
            *args,
        ]
        return self._run(command, cwd=self.dhf_root)

    def _run(self, command: list[str], *, cwd: Path, allow_not_found: bool = False) -> str | None:
        result = self.runner(
            command,
            cwd=cwd,
            env=self._env(),
            text=True,
            capture_output=True,
            check=False,
        )
        if result.returncode == 0:
            return result.stdout
        message = (result.stderr or result.stdout).strip()
        if allow_not_found and "not found" in message.lower():
            return None
        raise DHFAdapterError(message or f"DHF adapter command failed: {' '.join(command)}")

    @staticmethod
    def _json_objects(output: str) -> list[dict[str, Any]]:
        objects: list[dict[str, Any]] = []
        for line in output.splitlines():
            line = line.strip()
            if line.startswith("{"):
                objects.append(json.loads(line))
        return objects

    @classmethod
    def _first_json_object(cls, output: str, operation: str) -> dict[str, Any]:
        objects = cls._json_objects(output)
        if not objects:
            raise DHFAdapterError(f"DHF utility did not return JSON for {operation}.")
        return objects[0]

    def list_items(self, doc_type: str | None = None) -> list[dict[str, Any]]:
        args = ["item", "list"]
        if doc_type:
            args.extend(["--type", doc_type])
        output = self._run_utils(args)
        return self._json_objects(output or "")

    def get_item(self, item_id: str) -> dict[str, Any] | None:
        output = self._run(
            [
                self.python_executable,
                "-m",
                "utils",
                "--dhf",
                str(self.dhf_root),
                "item",
                "get",
                item_id,
            ],
            cwd=self.dhf_root,
            allow_not_found=True,
        )
        if output is None:
            return None
        return self._first_json_object(output, f"item get {item_id}")

    def create_item(
        self,
        doc_type: str,
        data: dict[str, Any],
        *,
        author: str,
        cr_id: str | None = None,
    ) -> dict[str, Any]:
        args = [
            "item",
            "create",
            "--type",
            doc_type,
            "--data",
            json.dumps(data),
            "--author",
            author,
        ]
        if cr_id:
            args.extend(["--cr", cr_id])
        output = self._run_utils(args)
        return self._first_json_object(output or "", f"item create {doc_type}")

    def update_item(
        self,
        item_id: str,
        data: dict[str, Any],
        *,
        author: str,
        cr_id: str | None = None,
    ) -> dict[str, Any] | None:
        args = [
            "item",
            "update",
            item_id,
            "--data",
            json.dumps(data),
            "--author",
            author,
        ]
        if cr_id:
            args.extend(["--cr", cr_id])
        output = self._run_utils(args)
        return self._first_json_object(output or "", f"item update {item_id}")

    def transition_item(self, item_id: str, to_state: str, *, performed_by: str) -> dict[str, Any]:
        output = self._run_utils(["item", "transition", item_id, to_state, "--by", performed_by])
        return self._first_json_object(output or "", f"item transition {item_id}")

    def get_document(self, doc_id: str) -> str | None:
        code = (
            "import sys\n"
            "from pathlib import Path\n"
            "from utils import LocalDHFAdapter\n"
            "adapter = LocalDHFAdapter(Path(sys.argv[1]))\n"
            "content = adapter.get_document(sys.argv[2])\n"
            "if content is None:\n"
            "    raise SystemExit(2)\n"
            "print(content, end='')\n"
        )
        result = self.runner(
            [self.python_executable, "-c", code, str(self.dhf_root), doc_id],
            cwd=self.dhf_repo.resolve(),
            env=self._env(),
            text=True,
            capture_output=True,
            check=False,
        )
        if result.returncode == 0:
            return result.stdout
        if result.returncode == 2:
            return self._get_legacy_cr_spec(doc_id)
        message = (result.stderr or result.stdout).strip()
        raise DHFAdapterError(message or f"DHF document lookup failed: {doc_id}")

    def _get_legacy_cr_spec(self, doc_id: str) -> str | None:
        path = self.dhf_repo.resolve() / "docs" / "cr-specs" / f"{doc_id}.md"
        if not path.is_file():
            return None
        return path.read_text(encoding="utf-8")

    def get_cr_context(self, cr_id: str) -> dict[str, Any]:
        return {
            "cr": self.get_item(cr_id),
            "spec": self.get_document(f"{cr_id}-Spec"),
        }


def make_dhf_adapter(dhf_repo: Path, adapter_name: str | None = None) -> DHFAdapter:
    selected = adapter_name or os.environ.get("WEBTPS_DHF_ADAPTER", "local_utils")
    if selected == "local_utils":
        return LocalUtilsDHFAdapter(dhf_repo)
    raise DHFAdapterError(f"Unsupported DHF adapter: {selected}")
