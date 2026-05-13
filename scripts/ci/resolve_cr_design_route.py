#!/usr/bin/env python3
"""Resolve whether a CR should skip DHF design generation."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--spec-json", required=True, help="Path to docs/cr-specs/CR-NNN-Spec.json")
    parser.add_argument(
        "--github-output",
        help="Optional GitHub Actions output file. When set, writes key=value outputs for workflow steps.",
    )
    return parser.parse_args()


def resolve_route(spec_data: dict[str, object]) -> dict[str, str]:
    route = str(spec_data["pipeline_route"])
    affected_count = len(spec_data.get("affected_items") or [])
    proposed_count = len(spec_data.get("proposed_new_items") or [])

    if route == "doc-only":
        return {
            "route": route,
            "affected_count": str(affected_count),
            "proposed_count": str(proposed_count),
            "skip": "true",
            "reason": "route-doc-only",
            "continue_to_code": "false",
            "route_mismatch": "false",
        }

    if route == "standard" and affected_count == 0 and proposed_count == 0:
        return {
            "route": route,
            "affected_count": str(affected_count),
            "proposed_count": str(proposed_count),
            "skip": "true",
            "reason": "code-only-no-dhf",
            "continue_to_code": "true",
            "route_mismatch": "true",
        }

    return {
        "route": route,
        "affected_count": str(affected_count),
        "proposed_count": str(proposed_count),
        "skip": "false",
        "reason": "standard-design",
        "continue_to_code": "false",
        "route_mismatch": "false",
    }


def write_github_output(path: Path, outputs: dict[str, str]) -> None:
    with path.open("a", encoding="utf-8") as handle:
        for key, value in outputs.items():
            handle.write(f"{key}={value}\n")


def main() -> int:
    args = parse_args()
    spec_json_path = Path(args.spec_json)
    if not spec_json_path.is_file():
        print(f"ERROR: Missing required spec JSON companion: {spec_json_path}", file=sys.stderr)
        return 1

    spec_data = json.loads(spec_json_path.read_text(encoding="utf-8"))
    if "pipeline_route" not in spec_data:
        print(f"ERROR: Missing required pipeline_route in {spec_json_path}", file=sys.stderr)
        return 1

    outputs = resolve_route(spec_data)

    if args.github_output:
        write_github_output(Path(args.github_output), outputs)
    else:
        print(json.dumps(outputs, indent=2, sort_keys=True))

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
