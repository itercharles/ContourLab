"""ContourLab-facing adapter boundary for DHF operations.

Callers in this repository should depend on this module instead of DHF file
paths or a specific DHF backend implementation.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any, Callable, Protocol

from medharness.client import DHFClient


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


Runner = Callable[..., Any]


class MedHarnessDHFAdapter:
    """Adapter implementation backed by DHFClient (direct Python API)."""

    def __init__(self, dhf_repo: Path):
        self._client = DHFClient(dhf_repo.resolve() / "DHF")

    def list_items(self, doc_type: str | None = None) -> list[dict[str, Any]]:
        return self._client.list_items(doc_type)

    def get_item(self, item_id: str) -> dict[str, Any] | None:
        return self._client.get_item(item_id)

    def create_item(
        self,
        doc_type: str,
        data: dict[str, Any],
        *,
        author: str,
        cr_id: str | None = None,
    ) -> dict[str, Any]:
        return self._client.create_item(doc_type, data, author=author, cr_id=cr_id)

    def update_item(
        self,
        item_id: str,
        data: dict[str, Any],
        *,
        author: str,
        cr_id: str | None = None,
    ) -> dict[str, Any] | None:
        return self._client.update_item(item_id, data, author=author, cr_id=cr_id)

    def transition_item(self, item_id: str, to_state: str, *, performed_by: str) -> dict[str, Any]:
        return self._client.transition_item(item_id, to_state, performed_by=performed_by)

    def get_document(self, doc_id: str) -> str | None:
        return self._client.get_document(doc_id)

    def get_cr_context(self, cr_id: str) -> dict[str, Any]:
        return self._client.get_cr_context(cr_id)


LocalUtilsDHFAdapter = MedHarnessDHFAdapter


def make_dhf_adapter(dhf_repo: Path, adapter_name: str | None = None) -> DHFAdapter:
    selected = adapter_name or "medharness"
    if selected in {"medharness", "local_utils"}:
        return MedHarnessDHFAdapter(dhf_repo)
    raise DHFAdapterError(f"Unsupported DHF adapter: {selected}")
