#!/usr/bin/env python3
"""Prepare a WebTPS-DHF CR PR from a scheduled WebTPS issue."""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any


CR_MARKER_RE = re.compile(r"<!--\s*webtps-cr:\s*(CR-\d+)\s*-->")
CR_FILE_RE = re.compile(r"CR-(\d+)\.ya?ml$")


@dataclass(frozen=True)
class IssueContext:
    number: int
    title: str
    body: str
    state: str
    html_url: str
    author: str
    milestone: str | None


@dataclass(frozen=True)
class CrPreparation:
    should_create: bool
    reason: str
    cr_id: str | None = None
    branch: str | None = None
    cr_path: str | None = None
    title: str | None = None


def load_issue_event(path: Path) -> IssueContext:
    payload = json.loads(path.read_text())
    issue = payload.get("issue") or {}
    user = issue.get("user") or {}
    milestone = issue.get("milestone") or {}
    return IssueContext(
        number=int(issue["number"]),
        title=str(issue.get("title") or "").strip(),
        body=str(issue.get("body") or "").strip(),
        state=str(issue.get("state") or ""),
        html_url=str(issue.get("html_url") or ""),
        author=str(user.get("login") or "unknown"),
        milestone=str(milestone.get("title") or "").strip() or None,
    )


def issue_has_cr_marker(comments: list[dict[str, Any]]) -> str | None:
    for comment in comments:
        body = str(comment.get("body") or "")
        match = CR_MARKER_RE.search(body)
        if match:
            return match.group(1)
    return None


def next_cr_id(cr_dir: Path) -> str:
    max_id = 0
    for path in cr_dir.glob("CR-*.y*ml"):
        match = CR_FILE_RE.match(path.name)
        if match:
            max_id = max(max_id, int(match.group(1)))
    return f"CR-{max_id + 1:03d}"


def find_existing_cr_for_issue(cr_dir: Path, source_issue: str) -> str | None:
    needle = f"source_issue: {source_issue}"
    quoted_needle = f'source_issue: "{source_issue}"'
    for path in sorted(cr_dir.glob("CR-*.y*ml")):
        text = path.read_text()
        if needle in text or quoted_needle in text:
            return path.stem
    return None


def yaml_scalar(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace('"', '\\"')
    return f'"{escaped}"'


def yaml_block(value: str) -> str:
    cleaned = value.strip() or "No issue body provided."
    return "\n".join(f"  {line}" if line else "" for line in cleaned.splitlines())


def extract_issue_form_field(body: str, heading: str) -> str | None:
    pattern = re.compile(
        rf"^###\s+{re.escape(heading)}\s*$\n(?P<value>.*?)(?=^###\s+|\Z)",
        re.MULTILINE | re.DOTALL,
    )
    match = pattern.search(body)
    if not match:
        return None
    value = match.group("value").strip()
    return value or None


def build_cr_yaml(issue: IssueContext, cr_id: str) -> str:
    description = f"{issue.body}\n\nSource issue: {issue.html_url}".strip()
    justification = extract_issue_form_field(issue.body, "User value / justification") or (
        "Maintainer assigned this issue to the active weekly release milestone, "
        "indicating it is accepted for CR intake."
    )
    category = extract_issue_form_field(issue.body, "Change category") or "Feature"
    return "\n".join([
        f"id: {cr_id}",
        f"title: {yaml_scalar(issue.title)}",
        "description: |-",
        yaml_block(description),
        "justification: |-",
        yaml_block(justification),
        "priority: Medium",
        f"requested_by: {yaml_scalar(issue.author)}",
        f"target_version: {yaml_scalar(issue.milestone or '')}",
        f"category: {yaml_scalar(category)}",
        "status: planned",
        "type: CR",
        f"source_issue: {yaml_scalar(f'itercharles/WebTPS#{issue.number}')}",
        "",
    ])


def prepare_cr(
    issue: IssueContext,
    active_milestone: str,
    dhf_repo: Path,
    comments: list[dict[str, Any]],
    *,
    write: bool,
) -> CrPreparation:
    if not active_milestone:
        return CrPreparation(False, "CR_INTAKE_MILESTONE is not configured.")
    if issue.state != "open":
        return CrPreparation(False, f"Issue is {issue.state}, not open.")
    if issue.milestone != active_milestone:
        return CrPreparation(False, f"Issue milestone {issue.milestone!r} is not active milestone {active_milestone!r}.")

    marker_cr = issue_has_cr_marker(comments)
    if marker_cr:
        return CrPreparation(False, f"Issue already has CR marker {marker_cr}.", cr_id=marker_cr)

    cr_dir = dhf_repo / "DHF" / "items" / "09_cr"
    source_issue = f"itercharles/WebTPS#{issue.number}"
    existing_cr = find_existing_cr_for_issue(cr_dir, source_issue)
    if existing_cr:
        return CrPreparation(False, f"DHF already has {existing_cr} for {source_issue}.", cr_id=existing_cr)

    cr_id = next_cr_id(cr_dir)
    cr_path = cr_dir / f"{cr_id}.yaml"
    branch_slug = re.sub(r"[^a-zA-Z0-9._-]+", "-", issue.title.lower()).strip("-")[:40]
    branch = f"cr/{cr_id}-from-webtps-issue-{issue.number}" + (f"-{branch_slug}" if branch_slug else "")

    if write:
        cr_path.write_text(build_cr_yaml(issue, cr_id))

    return CrPreparation(
        True,
        "CR file prepared.",
        cr_id=cr_id,
        branch=branch,
        cr_path=str(cr_path.relative_to(dhf_repo)),
        title=f"cr({cr_id}): {issue.title}",
    )


def load_comments(path: Path | None) -> list[dict[str, Any]]:
    if not path or not path.exists():
        return []
    return json.loads(path.read_text())


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--event", type=Path, required=True)
    parser.add_argument("--comments", type=Path)
    parser.add_argument("--dhf-repo", type=Path, required=True)
    parser.add_argument("--active-milestone", required=True)
    parser.add_argument("--write", action="store_true")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)

    result = prepare_cr(
        load_issue_event(args.event),
        args.active_milestone,
        args.dhf_repo,
        load_comments(args.comments),
        write=args.write,
    )
    payload = {
        "should_create": result.should_create,
        "reason": result.reason,
        "cr_id": result.cr_id,
        "branch": result.branch,
        "cr_path": result.cr_path,
        "title": result.title,
    }
    output = json.dumps(payload, indent=2)
    if args.output:
        args.output.write_text(output + "\n")
    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
