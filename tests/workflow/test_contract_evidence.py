"""The CI checks that write JUnit evidence for SRS-035, SYS-018 and CRS-015: they pass on the repository and fail on broken input."""

from __future__ import annotations

import sys
import tempfile
import unittest
import xml.etree.ElementTree as ET
from pathlib import Path

import _support as s

sys.path.insert(0, str(s.REPO / "scripts" / "ci"))
import check_loopback_listeners as listeners  # noqa: E402
import check_medharness_contract as contract  # noqa: E402

COMPOSE = {name: (s.REPO / name).read_text(encoding="utf-8") for name in ("docker-compose.deploy.yml", "docker-compose.yml")}
NGINX = (s.REPO / "apps" / "client" / "nginx.conf").read_text(encoding="utf-8")
DEPLOY_SH = (s.REPO / "scripts" / "deploy" / "deploy.sh").read_text(encoding="utf-8")


class LoopbackRules(unittest.TestCase):
    def test_the_repository_passes(self) -> None:
        self.assertEqual(contract.check_loopback_only(COMPOSE, NGINX), [])
        self.assertEqual(contract.check_deploy_recreates_exposed_repository(DEPLOY_SH), [])

    def test_a_port_on_all_interfaces_fails(self) -> None:
        exposed = {name: text.replace('"127.0.0.1:', '"') for name, text in COMPOSE.items()}
        self.assertTrue(contract.check_loopback_only(exposed, NGINX))

    def test_an_orthanc_proxy_fails(self) -> None:
        self.assertTrue(contract.check_loopback_only(COMPOSE, NGINX + "\nlocation /orthanc/ { }\n"))

    def test_a_deploy_script_without_the_recreate_step_fails(self) -> None:
        self.assertTrue(contract.check_deploy_recreates_exposed_repository(DEPLOY_SH.replace("orthanc_ok=false", "orthanc_ok=true")))
        self.assertTrue(contract.check_deploy_recreates_exposed_repository(DEPLOY_SH.replace(".HostConfig.PortBindings", ".HostConfig")))

    def test_the_junit_has_a_passing_case_per_point(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "contract-junit.xml"
            contract.write_evidence(out)
            cases = ET.parse(out).getroot().iter("testcase")
            seen = {(c.find("properties/property[@name='medharness.links']").get("value"),
                     c.find("properties/property[@name='medharness.testing']").get("value"),
                     c.find("failure") is None) for c in cases}
        self.assertEqual(seen, {("SRS-035,SYS-018", "T1", True), ("SRS-035", "T2", True)})


class DevStackListeners(unittest.TestCase):
    SS_OK = (
        "LISTEN 0 511 127.0.0.1:3000 0.0.0.0:*\n"
        "LISTEN 0 512 127.0.0.1:4000 0.0.0.0:*\n"
        "LISTEN 0 512     [::1]:4000    [::]:*\n"
        "LISTEN 0 4096 127.0.0.1:8042 0.0.0.0:*\n"
    )

    def test_loopback_listeners_pass(self) -> None:
        self.assertEqual(listeners.check_listeners(listeners.parse_ss(self.SS_OK)), [])

    def test_a_port_on_all_interfaces_fails(self) -> None:
        for wildcard in ("0.0.0.0:3000", "*:3000", "[::]:3000"):
            text = self.SS_OK.replace("127.0.0.1:3000", wildcard)
            errors = listeners.check_listeners(listeners.parse_ss(text))
            self.assertEqual(len(errors), 1, wildcard)
            self.assertIn("3000", errors[0])

    def test_a_missing_listener_fails(self) -> None:
        text = "\n".join(line for line in self.SS_OK.splitlines() if ":8042" not in line)
        self.assertIn("8042", listeners.check_listeners(listeners.parse_ss(text))[0])

    def test_lsof_output_is_read(self) -> None:
        lsof = "node 1 u 23u IPv4 0x1 0t0 TCP *:3000 (LISTEN)\ndotnet 2 u 9u IPv6 0x2 0t0 TCP [::1]:4000 (LISTEN)\n"
        self.assertEqual(listeners.parse_lsof(lsof), [("*", 3000), ("::1", 4000)])

    def test_the_junit_marks_a_failure(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            out = Path(tmp) / "listeners-junit.xml"
            listeners.write_junit(out, "dev-stack-loopback", [listeners.Case("x", ["CRS-015"], ["T1"], "boom")])
            case = ET.parse(out).getroot().find(".//testcase")
        self.assertIsNotNone(case.find("failure"))
        self.assertEqual(case.find("properties/property[@name='medharness.links']").get("value"), "CRS-015")


if __name__ == "__main__":
    unittest.main()
