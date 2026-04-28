#!/usr/bin/env python3
"""Write CR context files through the WebTPS DHF adapter boundary."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.automation.dhf_adapter import make_dhf_adapter


def write_cr_context(dhf_repo: Path, cr_id: str, out_dir: Path) -> dict[str, Path]:
    adapter = make_dhf_adapter(dhf_repo)
    context = adapter.get_cr_context(cr_id)
    if context.get("cr") is None:
        raise RuntimeError(f"DHF CR item not found: {cr_id}")
    out_dir.mkdir(parents=True, exist_ok=True)

    cr_path = out_dir / f"{cr_id}.json"
    spec_path = out_dir / f"{cr_id}-Spec.md"
    cr_path.write_text(json.dumps(context.get("cr"), indent=2, default=str) + "\n", encoding="utf-8")
    spec_path.write_text(context.get("spec") or "", encoding="utf-8")
    return {"cr": cr_path, "spec": spec_path}


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    cr_context = subparsers.add_parser("cr-context")
    cr_context.add_argument("--dhf-repo", type=Path, required=True)
    cr_context.add_argument("--cr-id", required=True)
    cr_context.add_argument("--out-dir", type=Path, required=True)

    args = parser.parse_args(argv)
    if args.command == "cr-context":
        paths = write_cr_context(args.dhf_repo, args.cr_id, args.out_dir)
        print(json.dumps({key: str(path) for key, path in paths.items()}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
