"""The `medharness` commands written in CLAUDE.md and the .claude files exist in the pinned MedHarness.

Two skills told the agent to run `medharness --dhf DHF dhf item get ...`, a command group MedHarness has not
had; every such command failed with a usage error and nobody noticed, because the CR flow runs in GitHub
Actions. Every command found in those files is checked against the installed CLI's own help.
"""

from __future__ import annotations

import re
import subprocess
import unittest

import _support as s

FILES = [s.REPO / "CLAUDE.md", *sorted((s.REPO / ".claude").rglob("*.md"))]

# `medharness`, optionally `--dhf PATH`, then the command group and the command after it
INVOCATION = re.compile(r"(?<![\w./-])medharness\s+(?:--dhf\s+\S+\s+)?([a-z][a-z-]*)(?:\s+([a-z][a-z|-]*))?")


def commands_listed_by(*args: str) -> set[str]:
    out = subprocess.run(["medharness", *args, "--help"], capture_output=True, text=True, check=True).stdout
    section = out.split("Commands:", 1)[1] if "Commands:" in out else ""
    return {line.split()[0] for line in section.splitlines() if line.startswith("  ") and line.strip()}


class MedharnessCommandsInAgentDocs(unittest.TestCase):
    @staticmethod
    def code_in(text: str):
        """(line number, code) for fenced blocks (minus trailing # comments) and `inline code`; prose is skipped."""
        fenced = False
        for number, line in enumerate(text.splitlines(), start=1):
            if line.lstrip().startswith("```"):
                fenced = not fenced
            elif fenced:
                yield number, line.split("#", 1)[0]
            else:
                for span in re.findall(r"`([^`]+)`", line):
                    yield number, span

    def invocations(self):
        for path in FILES:
            for number, code in self.code_in(path.read_text(encoding="utf-8")):
                for match in INVOCATION.finditer(code):
                    yield path.relative_to(s.REPO), number, match.group(1), match.group(2)

    def test_there_are_commands_to_check(self):
        self.assertGreater(len(list(self.invocations())), 5)

    def test_every_command_group_exists(self):
        groups = commands_listed_by()
        bad = [f"{p}:{n}: `medharness {g}`" for p, n, g, _ in self.invocations() if g not in groups]
        self.assertEqual(bad, [], f"not a medharness command group (have {sorted(groups)})")

    def test_every_command_in_a_group_exists(self):
        known = {}
        bad = []
        for path, number, group, command in self.invocations():
            if not command or group not in commands_listed_by():
                continue
            known.setdefault(group, commands_listed_by(group))
            if not known[group]:
                continue  # a group with no subcommands (a plain command)
            for name in command.split("|"):
                if name and name not in known[group]:
                    bad.append(f"{path}:{number}: `medharness {group} {name}` (have {sorted(known[group])})")
        self.assertEqual(bad, [])


if __name__ == "__main__":
    unittest.main()
