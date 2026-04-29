#!/usr/bin/env python3
"""Small CI entrypoints for DHF operations through the WebTPS adapter."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from scripts.automation.dhf_adapter import make_dhf_adapter


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    subparsers = parser.add_subparsers(dest="command", required=True)

    transition = subparsers.add_parser("transition")
    transition.add_argument("--dhf-repo", type=Path, required=True)
    transition.add_argument("--item-id", required=True)
    transition.add_argument("--to-state", required=True)
    transition.add_argument("--by", required=True)

    args = parser.parse_args(argv)
    adapter = make_dhf_adapter(args.dhf_repo)

    if args.command == "transition":
        result = adapter.transition_item(args.item_id, args.to_state, performed_by=args.by)
        print(json.dumps(result, indent=2, default=str))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
