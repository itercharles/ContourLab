"""WebTPS-facing adapter boundary for DHF operations.

Callers in this repository should depend on this module instead of DHF file
paths or a specific DHF backend implementation.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
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
class CompliantFlowDHFAdapter:
    """Adapter implementation backed by CompliantFlow's DHF facade CLI."""

    dhf_repo: Path
    python_executable: str = sys.executable
    runner: Runner = subprocess.run

    @property
    def dhf_root(self) -> Path:
        return self.dhf_repo.resolve() / "DHF"

    def _env(self) -> dict[str, str]:
        return os.environ.copy()

    def _run_compliantflow(self, args: list[str], *, allow_not_found: bool = False) -> str | None:
        command = [
            self.python_executable,
            "-m",
            "compliantflow",
            "--dhf",
            str(self.dhf_root),
            "dhf",
            *args,
        ]
        return self._run(command, cwd=self.dhf_repo.resolve(), allow_not_found=allow_not_found)

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
        output = self._run_compliantflow(args)
        return self._json_objects(output or "")

    def get_item(self, item_id: str) -> dict[str, Any] | None:
        output = self._run_compliantflow(["item", "get", item_id], allow_not_found=True)
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
        output = self._run_compliantflow(args)
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
        output = self._run_compliantflow(args)
        return self._first_json_object(output or "", f"item update {item_id}")

    def transition_item(self, item_id: str, to_state: str, *, performed_by: str) -> dict[str, Any]:
        output = self._run_compliantflow(["item", "transition", item_id, to_state, "--by", performed_by])
        return self._first_json_object(output or "", f"item transition {item_id}")

    def get_document(self, doc_id: str) -> str | None:
        if not doc_id.endswith("-Spec"):
            return None
        cr_id = doc_id.removesuffix("-Spec")
        with tempfile.TemporaryDirectory() as tmp:
            context = self._write_implementation_context(cr_id, Path(tmp))
            return context["spec_path"].read_text(encoding="utf-8")

    def get_cr_context(self, cr_id: str) -> dict[str, Any]:
        with tempfile.TemporaryDirectory() as tmp:
            context = self._write_implementation_context(cr_id, Path(tmp))
            return {
                "cr": json.loads(context["cr_path"].read_text(encoding="utf-8")),
                "spec": context["spec_path"].read_text(encoding="utf-8"),
            }

    def _write_implementation_context(self, cr_id: str, out_dir: Path) -> dict[str, Path]:
        output = self._run_compliantflow([
            "context",
            "implementation",
            "--cr",
            cr_id,
            "--out-dir",
            str(out_dir),
        ])
        payload = self._first_json_object(output or "", f"context implementation {cr_id}")
        return {
            "cr_path": Path(payload["cr"]),
            "spec_path": Path(payload["implementation_spec"]),
            "context_path": Path(payload["context"]),
        }


LocalUtilsDHFAdapter = CompliantFlowDHFAdapter


def make_dhf_adapter(dhf_repo: Path, adapter_name: str | None = None) -> DHFAdapter:
    selected = adapter_name or os.environ.get("WEBTPS_DHF_ADAPTER", "compliantflow")
    if selected in {"compliantflow", "local_utils"}:
        return CompliantFlowDHFAdapter(dhf_repo)
    raise DHFAdapterError(f"Unsupported DHF adapter: {selected}")
