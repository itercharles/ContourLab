"""Write JUnit XML that MedHarness reads as test evidence for DHF requirements."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from xml.sax.saxutils import quoteattr


@dataclass
class Case:
    """One test case. `links` and `testing` become the medharness.links and medharness.testing properties."""

    name: str
    links: list[str]
    testing: list[str] = field(default_factory=list)
    failure: str | None = None


def render_junit(suite: str, cases: list[Case]) -> str:
    failures = sum(1 for case in cases if case.failure is not None)
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<testsuites tests="{len(cases)}" failures="{failures}">',
        f"  <testsuite name={quoteattr(suite)} tests=\"{len(cases)}\" failures=\"{failures}\">",
    ]
    for case in cases:
        tags = f"@links:{','.join(case.links)}"
        if case.testing:
            tags += "".join(f" @testing:{point}" for point in case.testing)
        lines.append(f"    <testcase name={quoteattr(f'{case.name} {tags}')} classname={quoteattr(suite)}>")
        lines.append("      <properties>")
        lines.append(f"        <property name=\"medharness.links\" value={quoteattr(','.join(case.links))}/>")
        if case.testing:
            lines.append(f"        <property name=\"medharness.testing\" value={quoteattr(','.join(case.testing))}/>")
        lines.append("      </properties>")
        if case.failure is not None:
            lines.append(f"      <failure message={quoteattr(case.failure)}/>")
        lines.append("    </testcase>")
    lines += ["  </testsuite>", "</testsuites>", ""]
    return "\n".join(lines)


def write_junit(path: Path, suite: str, cases: list[Case]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(render_junit(suite, cases), encoding="utf-8")
