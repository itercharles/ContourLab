#!/usr/bin/env python3
"""Post or update the CR progress checklist on a pull request.

One comment per PR, found by a hidden marker and edited in place, shows the six steps of a CR, which
one is current, and, when it is the maintainer's turn, exactly what to do. Whenever it becomes the
maintainer's turn a short second comment is added too: an edit sends no notification, a new comment does.

This is informational. It never exits non-zero for a GitHub error, so it cannot fail a pipeline.
"""

from __future__ import annotations

import argparse
import datetime
import json
import subprocess
import sys

MARKER = "<!-- contourlab-cr-progress -->"

# (number, label, who)
STEPS = [
    (1, "Intake and design", "automatic"),
    (2, "Design review", "you"),
    (3, "Code and CI", "automatic"),
    (4, "Code review", "you"),
    (5, "Complete the CR", "automatic"),
    (6, "Merge this PR", "you"),
]

# stage -> (steps already done, current step, text for the current step, is it the maintainer's turn)
STAGES = {
    "design-generating": (0, 1, "The design is being generated. Nothing for you to do yet.", False),
    "design-review": (1, 2,
        "Review the DHF changes under **Files changed** and the implementation plan in the comments on this PR. "
        "**Approve** this PR to start code generation, or **Request changes** with comments to have the design revised.", True),
    "design-revising": (1, 2, "The design is being revised from your review comments. Nothing for you to do yet.", False),
    "code-generating": (2, 3, "The code is being generated and CI will run on it. Nothing for you to do until CI is green.", False),
    "code-review": (3, 4,
        "The code is ready. Check that CI is green on this PR, then review it under **Files changed**. **Approve** to mark it ready to merge, "
        "or **Request changes** with comments to have the code revised.", True),
    "code-revising": (3, 4, "The code is being revised from your review comments, then CI runs again. Nothing for you to do yet.", False),
    "completing": (4, 5,
        "Approved. The CR is being recorded as completed on this branch and CI is running again. "
        "Nothing for you to do until this says it is ready.", False),
    "merge": (5, 6,
        "The CR is recorded as completed and CI has passed. **Squash-merge this PR.** "
        "(GitHub dismisses an approval when a commit is pushed after it, so the PR may show as not approved: "
        "merge it with your admin bypass.)", True),
    # The PR was merged before the CR was recorded as completed (no code approval): a separate PR does it.
    "closeout-checking": (4, 5,
        "This PR was merged before the CR was recorded as completed, so a separate PR records it; its checks are running. "
        "Nothing for you to do until this says it is ready.", False),
    "closeout": (4, 5,
        "This PR was merged before the CR was recorded as completed. A separate PR records it and its checks have passed: "
        "**Merge it** (one click) and the CR is finished.", True),
    "done": (6, 7, "The CR is complete.", False),
}


def render(stage: str, cr: str, detail: str = "", failed_at: int = 0, run_url: str = "", now: str = "") -> str:
    if stage == "failed":
        done, current, text, turn = failed_at - 1, failed_at, detail or "A step failed.", False
        detail = ""
    else:
        done, current, text, turn = STAGES[stage]
    lines = [MARKER, f"### {cr} progress", ""]
    for number, label, who in STEPS:
        if number <= done:
            mark = "✅"
        elif number == current:
            mark = "❌" if stage == "failed" else ("👉" if turn else "⏳")
        else:
            mark = "⬜"
        suffix = " — **your turn**" if number == current and turn else ""
        lines.append(f"{mark} **{number}. {label}** ({'you' if who == 'you' else 'automatic'}){suffix}")
    lines += ["", ("**What failed:** " if stage == "failed" else "**Now:** ") + text]
    if detail:
        lines += ["", detail]
    stamp = f"Updated {now or datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"
    lines += ["", f"<sub>{stamp}" + (f" · [run]({run_url})" if run_url else "") + "</sub>"]
    return "\n".join(lines) + "\n"


def gh(*args: str, input_text: str | None = None) -> str:
    result = subprocess.run(["gh", *args], input=input_text, capture_output=True, text=True, check=False)
    if result.returncode != 0:
        print(f"::warning::gh {' '.join(args[:3])} failed: {result.stderr.strip()}")
        return ""
    return result.stdout


def post(repo: str, pr: str, body: str, notify: str) -> None:
    raw = gh("api", "--paginate", f"repos/{repo}/issues/{pr}/comments")
    existing = ""
    try:
        # --paginate prints one JSON array per page
        decoder, index, text = json.JSONDecoder(), 0, raw.strip()
        while index < len(text):
            page, end = decoder.raw_decode(text, index)
            for comment in page:
                if MARKER in comment.get("body", ""):
                    existing = str(comment["id"])
            index = end
            while index < len(text) and text[index].isspace():
                index += 1
    except (ValueError, TypeError):
        existing = ""
    if existing:
        gh("api", "-X", "PATCH", f"repos/{repo}/issues/comments/{existing}", "--input", "-", input_text=json.dumps({"body": body}))
    else:
        gh("api", "-X", "POST", f"repos/{repo}/issues/{pr}/comments", "--input", "-", input_text=json.dumps({"body": body}))
    if notify:
        gh("api", "-X", "POST", f"repos/{repo}/issues/{pr}/comments", "--input", "-", input_text=json.dumps({"body": notify}))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", required=True)
    parser.add_argument("--pr", required=True)
    parser.add_argument("--cr", required=True)
    parser.add_argument("--stage", required=True, choices=sorted([*STAGES, "failed"]))
    parser.add_argument("--detail", default="")
    parser.add_argument("--failed-at", type=int, default=0)
    parser.add_argument("--run-url", default="")
    args = parser.parse_args()
    if not args.pr.strip():
        print("no PR number, nothing to post")
        return 0
    body = render(args.stage, args.cr, args.detail, args.failed_at, args.run_url)
    notify = ""
    if args.stage in STAGES and STAGES[args.stage][3]:
        number = STAGES[args.stage][1]
        label = STEPS[number - 1][1]
        notify = f"👉 **{args.cr}: your turn — step {number}, {label}.** Details in the progress checklist on this PR."
    post(args.repo, args.pr, body, notify)
    return 0


if __name__ == "__main__":
    sys.exit(main())
