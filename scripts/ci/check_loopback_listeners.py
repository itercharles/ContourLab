#!/usr/bin/env python3
"""Check that the running dev stack listens on the loopback interface only (CRS-015 T1).

Run it with the stack up (web client 3000, API 4000, DICOM repository 8042). It reads the listening
TCP sockets from `ss -ltnH` (or `lsof -nP -iTCP -sTCP:LISTEN` where ss is missing) and fails when a
port has no listener, or has a listener on an address that is not a loopback address.

The evidence is the dev stack that the `dev-integration` job starts, not the Docker deploy stack.
"""

from __future__ import annotations

import argparse
import ipaddress
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from junit_evidence import Case, write_junit  # noqa: E402

PORTS = (3000, 4000, 8042)


def parse_ss(text: str) -> list[tuple[str, int]]:
    """Local addresses of the listening sockets in `ss -ltnH` output: (host, port)."""
    listeners: list[tuple[str, int]] = []
    for line in text.splitlines():
        fields = line.split()
        if len(fields) < 4:
            continue
        listeners.append(split_address(fields[3]))
    return listeners


def parse_lsof(text: str) -> list[tuple[str, int]]:
    """Local addresses of the listening sockets in `lsof -nP -iTCP -sTCP:LISTEN` output."""
    listeners: list[tuple[str, int]] = []
    for line in text.splitlines():
        match = re.search(r"TCP\s+(\S+)\s+\(LISTEN\)", line)
        if match:
            listeners.append(split_address(match.group(1)))
    return listeners


def split_address(address: str) -> tuple[str, int]:
    host, _, port = address.rpartition(":")
    return host.strip("[]") or "*", int(port)


def is_loopback(host: str) -> bool:
    try:
        return ipaddress.ip_address(host.split("%")[0]).is_loopback
    except ValueError:
        return False


def check_listeners(listeners: list[tuple[str, int]], ports: tuple[int, ...] = PORTS) -> list[str]:
    errors: list[str] = []
    for port in ports:
        hosts = sorted({host for host, listening in listeners if listening == port})
        if not hosts:
            errors.append(f"nothing listens on port {port}; the stack is not up")
            continue
        exposed = [host for host in hosts if not is_loopback(host)]
        if exposed:
            errors.append(f"port {port} listens on {', '.join(exposed)}; it must listen on 127.0.0.1 only")
    return errors


def read_listeners() -> list[tuple[str, int]]:
    if shutil.which("ss"):
        return parse_ss(subprocess.run(["ss", "-ltnH"], capture_output=True, text=True, check=True).stdout)
    if shutil.which("lsof"):
        out = subprocess.run(["lsof", "-nP", "-iTCP", "-sTCP:LISTEN"], capture_output=True, text=True, check=False).stdout
        return parse_lsof(out)
    raise RuntimeError("neither ss nor lsof is available")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--junit-out", type=Path, help="write the result as JUnit evidence for CRS-015")
    args = parser.parse_args(argv)

    try:
        errors = check_listeners(read_listeners())
    except (RuntimeError, subprocess.CalledProcessError) as exc:
        errors = [f"could not read the listening sockets: {exc}"]

    if args.junit_out:
        failure = "; ".join(errors) if errors else None
        write_junit(
            args.junit_out,
            "dev-stack-loopback",
            [Case("dev stack services 3000, 4000 and 8042 listen on the loopback interface only", ["CRS-015"], ["T1"], failure)],
        )
    for error in errors:
        print(f"ERROR: {error}", file=sys.stderr)
    if errors:
        return 1
    print(f"PASS: ports {', '.join(map(str, PORTS))} listen on the loopback interface only.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
