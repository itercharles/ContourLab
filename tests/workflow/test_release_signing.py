"""Release signing: the draft release, the CI check on pull requests, and publishing on merge.

No GitHub, no model: `gh`, `git ls-remote`, `medharness` and `sleep` are stubs that record their calls.
"""

from __future__ import annotations

import unittest

import _support as s

BASELINE = "release-baseline.yml"
FINALIZE = "release-finalize.yml"
CI = "ci-pipeline.yml"
CI_STEP = "Check the approval log (and the signatures of a release PR)"


def workflow(name: str) -> dict:
    return s.yaml.safe_load((s.WORKFLOWS / name).read_text(encoding="utf-8"))


def steps(name: str, job: str) -> list[dict]:
    return workflow(name)["jobs"][job]["steps"]


def step(name: str, job: str, step_name: str) -> dict:
    return next(st for st in steps(name, job) if st.get("name") == step_name)


class Env(s.Scratch):
    """A scratch directory with a stub bin directory first on PATH."""

    def setUp(self) -> None:
        super().setUp()
        self.bin = self.tmp / "bin"
        self.log = self.tmp / "calls.log"
        self.log.write_text("")

    def stub(self, name: str, body: str = "") -> None:
        s.stub_bin(self.bin, name, f'printf "%s %s\\n" "{name}" "$*" >> "{self.log}"\n{body}')

    def env(self, **extra: str) -> dict[str, str]:
        return {"PATH": f"{self.bin}:{s.os.environ['PATH']}", "GH_TOKEN": "t", "REPO": "o/r", **extra}

    def calls(self) -> list[str]:
        return self.log.read_text().splitlines()


class ReleaseBaselineDraft(Env):
    CHECK = "Refuse to overwrite an existing release"
    CREATE = "Create the draft GitHub Release with the documents"
    PR = "Open a pull request for the REL item"

    def script(self, step_name: str) -> str:
        return s.GHA_EXPR.sub("$GHA_EXPR", step(BASELINE, "release-baseline", step_name)["run"])

    def test_the_release_and_the_check_exist_only_on_write(self):
        for name in (self.CHECK, self.CREATE, self.PR):
            with self.subTest(name):
                self.assertIn("inputs.write == true", step(BASELINE, "release-baseline", name)["if"])

    def test_the_release_is_made_with_the_pat_as_a_draft_and_never_published(self):
        st = step(BASELINE, "release-baseline", self.CREATE)
        self.assertIn("secrets.ACTIONS_PAT", st["env"]["GH_TOKEN"])
        self.assertIn("--draft", st["run"])
        self.assertNotIn("release edit", st["run"])
        self.assertNotIn("--draft=false", st["run"])

    def test_the_check_runs_before_the_build_and_the_release_before_the_pull_request(self):
        names = [st.get("name") for st in steps(BASELINE, "release-baseline")]
        self.assertLess(names.index(self.CHECK), names.index("Build release baseline"))
        self.assertLess(names.index(self.CREATE), names.index(self.PR))

    def existing(self, listing: str, remote_tag: str = "") -> int:
        self.stub("gh", f'echo "{listing}"\n')
        self.stub("git", f'echo "{remote_tag}"\n')
        return s.run(["bash", "-e", "-c", self.script(self.CHECK)], cwd=self.tmp, check=False,
                     env=self.env(VERSION="1.0.0")).returncode

    def test_an_existing_release_or_tag_fails_the_run(self):
        self.assertNotEqual(self.existing("v0.9.0\nv1.0.0"), 0)
        self.assertNotEqual(self.existing("v0.9.0", remote_tag="abc refs/tags/v1.0.0"), 0)

    def test_a_new_version_passes(self):
        self.assertEqual(self.existing("v0.9.0"), 0)

    def test_a_longer_version_is_not_mistaken_for_an_existing_one(self):
        self.assertEqual(self.existing("v1.0.01\nv1.0.0-rc1"), 0)

    def render(self) -> dict[str, bytes]:
        art = self.tmp / "artifacts"
        (art / "specifications").mkdir(parents=True)
        (art / "traceability").mkdir()
        (art / "specifications" / "SRS.html").write_bytes(b"srs bytes")
        (art / "traceability" / "T.html").write_text("t")
        (art / "sbom.cdx.json").write_text("{}")
        rel = self.tmp / "DHF" / "releases" / "1.0.0"
        rel.mkdir(parents=True)
        (rel / "manifest.yaml").write_text("version: 1.0.0\n")
        (rel / "changes.md").write_text("# Changes\n")
        self.stub("gh")
        s.run(["bash", "-e", "-c", self.script(self.CREATE)], cwd=self.tmp,
              env=self.env(VERSION="1.0.0", GITHUB_SHA="abc123", GITHUB_RUN_ID="9"))
        return {p.name: p.read_bytes() for p in (self.tmp / "release-assets").iterdir()}

    def test_the_documents_are_uploaded_byte_for_byte_and_the_rest_is_zipped_or_named(self):
        assets = self.render()
        self.assertEqual(assets["SRS.html"], b"srs bytes")
        self.assertIn("traceability-1.0.0.zip", assets)
        self.assertIn("contourlab-1.0.0-sbom.cdx.json", assets)
        (call,) = self.calls()
        self.assertTrue(call.startswith("gh release create v1.0.0 release-assets/"))
        self.assertIn("--draft", call)
        self.assertIn("--target abc123", call)
        self.assertNotIn("--draft=false", call)
        self.assertIn("# Changes", (self.tmp / "release-notes.md").read_text())

    def test_no_manifest_means_nothing_is_created(self):
        (self.tmp / "artifacts" / "specifications").mkdir(parents=True)
        self.stub("gh")
        result = s.run(["bash", "-e", "-c", self.script(self.CREATE)], cwd=self.tmp, check=False,
                       env=self.env(VERSION="1.0.0", GITHUB_SHA="abc123", GITHUB_RUN_ID="9"))
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.calls(), [])

    def test_the_release_pull_request_carries_the_manifest_and_says_how_to_sign(self):
        origin = self.tmp / "origin.git"
        work = self.tmp / "work"
        s.git(self.tmp, "init", "--bare", str(origin))
        s.git(self.tmp, "init", "-b", "main", str(work))
        (work / "README").write_text("x")
        s.git(work, "add", ".")
        s.git(work, "commit", "-m", "init")
        s.git(work, "remote", "add", "origin", str(origin))
        rel = work / "DHF" / "releases" / "1.0.0"
        rel.mkdir(parents=True)
        (rel / "manifest.yaml").write_text("version: 1.0.0\n")
        (rel / "changes.md").write_text("changes")
        self.stub("gh", f'for a in "$@"; do [ -f "$a" ] && cp "$a" "{self.tmp}/body.md"; done\n:\n')
        s.run(["bash", "-e", "-c", self.script(self.PR)], cwd=work, env=self.env(VERSION="1.0.0"))
        committed = s.git(work, "show", "--name-only", "--format=", "HEAD").stdout
        self.assertIn("DHF/releases/1.0.0/manifest.yaml", committed)
        self.assertIn("DHF/releases/1.0.0/changes.md", committed)
        body = (self.tmp / "body.md").read_text()
        self.assertIn("medharness --dhf DHF item approve --release 1.0.0 --key <path to your signing key>", body)
        self.assertIn("chore/release-1.0.0", body)
        self.assertIn("verify approval --release 1.0.0", body)
        self.assertNotIn("@VERSION@", body)
        self.assertIn("pr create --base main --head chore/release-1.0.0", "\n".join(self.calls()))

    def test_the_workflow_artifact_is_still_kept(self):
        upload = step(BASELINE, "release-baseline", "Upload baseline artifacts")
        self.assertEqual(upload["with"]["retention-days"], 90)


class CiApprovalCheck(Env):
    def run_check(self, head_ref: str) -> tuple[int, list[str]]:
        self.log.write_text("")
        self.stub("medharness")
        script = step(CI, "dhf-validation", CI_STEP)["run"]
        result = s.run(["bash", "-e", "-c", script], cwd=self.tmp, check=False,
                       env=self.env(BASE_REF="main", HEAD_REF=head_ref))
        return result.returncode, self.calls()

    def test_it_runs_in_the_required_job_on_pull_requests_only(self):
        job = workflow(CI)["jobs"]["dhf-validation"]
        self.assertEqual(job["name"], "DHF Validation (schema + traceability)")
        self.assertEqual(step(CI, "dhf-validation", CI_STEP)["if"], "github.event_name == 'pull_request'")

    def test_the_checkout_reaches_the_base(self):
        checkout = steps(CI, "dhf-validation")[0]
        self.assertEqual(checkout["with"]["fetch-depth"], 0)

    def test_an_ordinary_branch_only_checks_the_log(self):
        for head in ("feat/CR-026", "chore/complete-CR-026", "chore/releases-notes"):
            with self.subTest(head):
                code, calls = self.run_check(head)
                self.assertEqual(code, 0)
                self.assertEqual(calls, ["medharness --dhf DHF verify approval --since-ref origin/main"])

    def test_a_release_branch_also_asks_for_the_signatures_of_its_version(self):
        code, calls = self.run_check("chore/release-1.2.0")
        self.assertEqual(code, 0)
        self.assertEqual(calls, ["medharness --dhf DHF verify approval --since-ref origin/main --release 1.2.0"])
        _, calls = self.run_check("chore/release-1.2.0-rc.1")
        self.assertIn("--release 1.2.0-rc.1", calls[-1])

    def test_a_release_branch_without_a_version_fails_instead_of_skipping_the_gate(self):
        code, calls = self.run_check("chore/release-")
        self.assertNotEqual(code, 0)
        self.assertEqual(calls, [])

    def test_the_head_ref_reaches_the_script_as_data_not_as_an_expression(self):
        self.assertNotIn("${{", step(CI, "dhf-validation", CI_STEP)["run"])


class Finalize(Env):
    def test_it_triggers_only_on_a_merged_release_pull_request_to_main(self):
        doc = workflow(FINALIZE)
        on = doc[True]
        self.assertEqual(on["pull_request"]["types"], ["closed"])
        self.assertEqual(on["pull_request"]["branches"], ["main"])
        self.assertEqual(list(on), ["pull_request"])
        cond = " ".join(doc["jobs"]["finalize-release"]["if"].split())
        self.assertIn("github.event.pull_request.merged == true", cond)
        self.assertIn("startsWith(github.event.pull_request.head.ref, 'chore/release-')", cond)
        self.assertIn("head.repo.full_name == github.repository", cond)

    def test_it_never_merges_and_never_pushes(self):
        text = (s.WORKFLOWS / FINALIZE).read_text(encoding="utf-8")
        for forbidden in ("pr merge", "git push", "git commit", "gh pr create", "--auto"):
            self.assertNotIn(forbidden, text)

    def test_it_checks_out_the_merge_commit(self):
        checkout = steps(FINALIZE, "finalize-release")[0]
        self.assertEqual(checkout["with"]["ref"], "${{ github.event.pull_request.merge_commit_sha }}")

    def test_publishing_comes_after_the_verification_and_the_sheet(self):
        runs = [st.get("run", "") for st in steps(FINALIZE, "finalize-release")]
        pos = {key: next(i for i, r in enumerate(runs) if key in r)
               for key in ("verify approval", "build approvals", "release upload", "release edit")}
        self.assertEqual(sorted(pos.values()), list(pos.values()))
        self.assertEqual(len(set(pos.values())), 4)

    def play(self, *, draft: str = "true", verify: int = 0, approvals: int = 0, edit: int = 0) -> tuple[list[str], str]:
        """Run the job's steps in order, as Actions does: stop at the first failing step."""
        self.stub("gh", f'''case "$1 $2" in
  "release list") echo "{draft}" ;;
  "release edit") exit {edit} ;;
esac
''')
        self.stub("medharness", f'''case "$*" in
  *"verify approval"*) exit {verify} ;;
  *"build approvals"*) mkdir -p approval-out; echo sheet > approval-out/approval-sheet.html; exit {approvals} ;;
esac
''')
        out = self.tmp / "out"
        out.write_text("")
        env = self.env(HEAD_REF="chore/release-1.2.0", MERGE_SHA="deadbeef", GITHUB_OUTPUT=str(out))
        failed = ""
        for st in steps(FINALIZE, "finalize-release"):
            if "run" not in st:
                continue
            version = dict(line.split("=", 1) for line in out.read_text().splitlines() if "=" in line).get("version", "")
            result = s.run(["bash", "-e", "-c", st["run"]], cwd=self.tmp, check=False, env={**env, "VERSION": version})
            if result.returncode != 0:
                failed = f"{st['name']}\n{result.stdout}"
                break
        return self.calls(), failed

    def test_a_signed_release_is_published_at_the_merge_commit_after_the_sheet_is_attached(self):
        calls, failed = self.play()
        self.assertEqual(failed, "")
        self.assertEqual(calls[1:], [
            "medharness --dhf DHF verify approval --since-ref deadbeef^1 --release 1.2.0",
            "medharness --dhf DHF build approvals --since-ref deadbeef^1 --release 1.2.0 --out-dir approval-out",
            "gh release upload v1.2.0 approval-out/approval-sheet.html --repo o/r --clobber",
            "gh release edit v1.2.0 --repo o/r --draft=false --target deadbeef",
        ])

    def test_an_unsigned_release_is_not_published_and_no_sheet_is_made(self):
        calls, failed = self.play(verify=1)
        self.assertIn("Verify the release is signed", failed)
        self.assertEqual([c for c in calls if "build approvals" in c or "release upload" in c or "release edit" in c], [])

    def test_a_sheet_that_cannot_be_rendered_leaves_the_draft(self):
        calls, failed = self.play(approvals=1)
        self.assertIn("Render the approval sheet", failed)
        self.assertEqual([c for c in calls if "release edit" in c], [])

    def test_there_is_nothing_to_publish_without_a_draft(self):
        for draft in ("", "false"):
            with self.subTest(draft):
                self.log.write_text("")
                calls, failed = self.play(draft=draft)
                self.assertIn("Find the draft release", failed)
                self.assertEqual([c for c in calls if c.startswith("medharness") or "release edit" in c], [])

    def test_the_release_is_handled_with_the_pat(self):
        for st in steps(FINALIZE, "finalize-release"):
            if "gh release" in st.get("run", ""):
                self.assertEqual(st["env"]["GH_TOKEN"], "${{ secrets.ACTIONS_PAT }}", st["name"])


if __name__ == "__main__":
    unittest.main()
