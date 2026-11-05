"""The agent jobs hold no credential that can push; a push job verifies and pushes what they hand over.

gen-design, revise-design, gen-code and revise-code run a model with a shell. Each checks out without the PAT
or any persisted token, sends its pushes to a local repository, and hands its commits over as a git bundle.
The `-push` job after it (PAT, no agent) pushes the bundle only if it fast-forwards the branch and changes
nothing under .github/. The action scripts run for real here against local git remotes; nothing reaches GitHub.
"""

from __future__ import annotations

import unittest
from pathlib import Path

import _support as s

AGENT_JOBS = ["gen-design", "revise-design", "gen-code", "revise-code"]

PREPARE = s.action_script("cr-handoff-prepare", step_name="Redirect pushes to a local repository")
BUNDLE = s.action_script("cr-handoff-bundle", step_id="bundle")
PUSH = s.action_script("cr-handoff-push", step_name="Verify the bundle and push it")


class Structure(unittest.TestCase):
    jobs = s.workflow_jobs("cr-lifecycle.yml")

    def test_the_agent_jobs_never_see_the_pat_and_check_out_without_credentials(self):
        for name in AGENT_JOBS:
            with self.subTest(name):
                job = self.jobs[name]
                self.assertNotIn("ACTIONS_PAT", s.yaml.safe_dump(job))
                checkout = next(st for st in job["steps"] if st.get("uses", "").startswith("actions/checkout"))
                self.assertIs(checkout["with"]["persist-credentials"], False)
                self.assertNotIn("token", checkout["with"], "the default (read-only) token only")
                self.assertEqual(job["permissions"]["contents"], "read")
                self.assertNotIn("actions", job["permissions"])
                self.assertNotIn("write", [v for k, v in job["permissions"].items() if k != "pull-requests"])

    def test_the_agent_runs_after_the_pushes_are_redirected(self):
        for name in AGENT_JOBS:
            with self.subTest(name):
                steps = self.jobs[name]["steps"]
                uses = [st.get("uses", "") for st in steps]
                prepare = next(i for i, u in enumerate(uses) if "cr-handoff-prepare" in u)
                agent = next(i for i, st in enumerate(steps) if "build " in str(st.get("run", "")) and "medharness" in str(st.get("run", "")))
                bundle = next(i for i, u in enumerate(uses) if "cr-handoff-bundle" in u)
                self.assertLess(prepare, agent)
                self.assertLess(agent, bundle)

    def test_each_push_job_has_the_pat_and_no_agent_and_no_model_key(self):
        for name in AGENT_JOBS:
            with self.subTest(name):
                job = self.jobs[f"{name}-push"]
                self.assertEqual(job["needs"], ["detect", name])
                checkout = next(st for st in job["steps"] if st.get("uses", "").startswith("actions/checkout"))
                self.assertIn("ACTIONS_PAT", checkout["with"]["token"])
                text = s.yaml.safe_dump(job)
                self.assertNotIn("ANTHROPIC", text)
                self.assertNotIn("build plan", text)
                self.assertNotIn("build code", text)
                self.assertNotIn("cr-agent-setup", text)

    def test_a_run_with_no_new_commits_pushes_nothing(self):
        for name in AGENT_JOBS:
            with self.subTest(name):
                push = next(st for st in self.jobs[f"{name}-push"]["steps"] if "cr-handoff-push" in st.get("uses", ""))
                self.assertEqual(push["if"], f"needs.{name}.outputs.has_commits == 'true'")
                bundle_id = next(st["id"] for st in self.jobs[name]["steps"] if "cr-handoff-bundle" in st.get("uses", ""))
                self.assertEqual(self.jobs[name]["outputs"]["has_commits"], "${{ steps.%s.outputs.has-commits }}" % bundle_id)

    def test_gen_code_pushes_between_noting_the_latest_ci_run_and_waiting_for_it(self):
        steps = self.jobs["gen-code-push"]["steps"]
        names = [st.get("name", st.get("uses", "")) for st in steps]
        order = [names.index(n) for n in ("Advance to next review stage", "Note the latest CI run", "Push the code", "Wait for CI")]
        self.assertEqual(order, sorted(order))

    def test_jobs_that_need_the_pushed_commits_are_in_the_push_jobs(self):
        self.assertEqual(self.jobs["gen-code-push"]["permissions"]["issues"], "write")
        self.assertEqual(self.jobs["gen-code-push"]["permissions"]["actions"], "read")
        for name in AGENT_JOBS:
            self.assertNotIn("issues", self.jobs[name]["permissions"])


class IntakeStructure(unittest.TestCase):
    """issue-to-cr.yml: intake (PAT, no agent) -> create-cr-design (agent, no PAT) -> create-cr-design-push (PAT)."""

    jobs = s.workflow_jobs("issue-to-cr.yml")

    def test_the_design_agent_never_sees_the_pat_and_checks_out_without_credentials(self):
        job = self.jobs["create-cr-design"]
        self.assertNotIn("ACTIONS_PAT", s.yaml.safe_dump(job))
        checkout = next(st for st in job["steps"] if st.get("uses", "").startswith("actions/checkout"))
        self.assertIs(checkout["with"]["persist-credentials"], False)
        self.assertNotIn("token", checkout["with"])
        self.assertEqual(job["permissions"], {"contents": "read", "pull-requests": "write"})
        uses = [st.get("uses", "") for st in job["steps"]]
        self.assertTrue(any("cr-handoff-prepare" in u for u in uses) and any("cr-handoff-bundle" in u for u in uses))

    def test_no_job_that_runs_an_agent_holds_the_pat_in_this_workflow(self):
        for name, job in self.jobs.items():
            runs_agent = any("build plan" in str(st.get("run", "")) for st in job["steps"])
            if runs_agent:
                self.assertNotIn("ACTIONS_PAT", s.yaml.safe_dump(job), name)

    def test_the_branch_is_pushed_and_the_pr_opened_before_the_agent_runs_with_the_same_identities(self):
        job = self.jobs["create-cr"]
        self.assertEqual(self.jobs["create-cr-design"]["needs"], ["create-cr"])
        self.assertNotIn("build plan", s.yaml.safe_dump(job))
        checkout = next(st for st in job["steps"] if st.get("uses", "").startswith("actions/checkout"))
        self.assertIn("ACTIONS_PAT", checkout["with"]["token"])
        steps = {st.get("id"): st for st in job["steps"] if st.get("id")}
        self.assertIn("--force-with-lease", steps["create_branch"]["run"])
        self.assertNotIn("PAT", s.yaml.safe_dump(steps["open_pr"]["env"]), "the PR is opened with the workflow token")
        self.assertIn("secrets.GITHUB_TOKEN", steps["open_pr"]["env"]["GH_TOKEN"])

    def test_the_push_job_follows_the_agent_and_pushes_only_when_it_committed(self):
        job = self.jobs["create-cr-design-push"]
        self.assertEqual(job["needs"], ["create-cr", "create-cr-design"])
        checkout = next(st for st in job["steps"] if st.get("uses", "").startswith("actions/checkout"))
        self.assertIn("ACTIONS_PAT", checkout["with"]["token"])
        push = next(st for st in job["steps"] if "cr-handoff-push" in st.get("uses", ""))
        self.assertEqual(push["if"], "needs.create-cr-design.outputs.has_commits == 'true'")
        self.assertNotIn("ANTHROPIC", s.yaml.safe_dump(job))


class Handoff(s.Scratch):
    BRANCH = "feat/CR-1"

    def setUp(self) -> None:
        super().setUp()
        seed = self.tmp / "seed"
        seed.mkdir()
        s.git(seed, "init", "-q", "-b", "main")
        (seed / "a.txt").write_text("a\n")
        (seed / ".github").mkdir()
        (seed / ".github" / "ci.yml").write_text("on: push\n")
        s.git(seed, "add", "-A")
        s.git(seed, "commit", "-q", "-m", "base")
        self.origin = self.tmp / "origin.git"
        s.run(["git", "init", "-q", "--bare", "-b", "main", str(self.origin)], cwd=self.tmp)
        s.git(seed, "remote", "add", "origin", f"file://{self.origin}")
        s.git(seed, "push", "-q", "origin", "main")
        s.git(seed, "push", "-q", "origin", f"main:refs/heads/{self.BRANCH}")
        self.seed = seed
        self.temp = self.tmp / "runner-temp"
        self.temp.mkdir()
        self.out = self.tmp / "out"
        self.out.write_text("")
        self.agent = self.clone("agent")

    def clone(self, name: str) -> Path:
        work = self.tmp / name
        s.run(["git", "clone", "-q", "--branch", self.BRANCH, f"file://{self.origin}", str(work)], cwd=self.tmp)
        return work

    def env(self, **extra: str) -> dict[str, str]:
        return {"RUNNER_TEMP": str(self.temp), "GITHUB_OUTPUT": str(self.out), "GHA_EXPR": "", **extra}

    def sh(self, script: str, cwd: Path, **extra: str):
        return s.run(["bash", "-e", "-c", script], cwd=cwd, check=False, env=self.env(**extra))

    def outputs(self) -> dict[str, str]:
        return dict(l.split("=", 1) for l in self.out.read_text().splitlines() if "=" in l)

    def remote_head(self, branch: str | None = None) -> str:
        return s.git(self.agent, "ls-remote", "origin", f"refs/heads/{branch or self.BRANCH}").stdout.split()[0]

    def commit(self, work: Path, name: str, text: str = "x\n", message: str = "agent work") -> None:
        path = work / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
        s.git(work, "add", "-A")
        s.git(work, "commit", "-q", "-m", message)

    def hand_over(self) -> Path:
        """Prepare the agent clone, let the agent commit, bundle: returns the directory a push job downloads."""
        self.assertEqual(self.sh(PREPARE, self.agent).returncode, 0)
        self.commit(self.agent, "apps/feature.ts")
        self.assertEqual(self.sh(BUNDLE, self.agent).returncode, 0)
        self.assertEqual(self.outputs()["has-commits"], "true")
        return self.temp / "handoff-out"

    def push(self, directory: Path, work: Path | None = None, **extra: str):
        return self.sh(PUSH, work or self.clone("pusher"), BRANCH=self.BRANCH, HANDOFF_DIR=str(directory), **extra)


class Prepare(Handoff):
    def test_pushes_land_in_the_local_repository_and_origin_is_untouched(self):
        before = self.remote_head()
        self.assertEqual(self.sh(PREPARE, self.agent).returncode, 0)
        self.commit(self.agent, "apps/feature.ts")
        pushed = s.git(self.agent, "push", check=False)
        self.assertEqual(pushed.returncode, 0, pushed.stderr)
        self.assertEqual(self.remote_head(), before, "nothing reached the real remote")
        local = s.git(self.agent, "ls-remote", str(self.temp / "handoff.git")).stdout
        self.assertIn(f"refs/heads/{self.BRANCH}", local)
        self.assertEqual(s.git(self.agent, "remote", "get-url", "origin").stdout.strip(), f"file://{self.origin}")

    def test_medharness_style_pushes_to_the_branch_land_locally_too(self):
        self.sh(PREPARE, self.agent)
        self.commit(self.agent, "apps/feature.ts")
        s.git(self.agent, "push", "origin", f"HEAD:{self.BRANCH}")
        self.assertEqual(s.git(self.agent, "ls-remote", str(self.temp / "handoff.git"), f"refs/heads/{self.BRANCH}").stdout.split()[0],
                         s.git(self.agent, "rev-parse", "HEAD").stdout.strip())
        self.assertNotEqual(self.remote_head(), s.git(self.agent, "rev-parse", "HEAD").stdout.strip())

    def test_a_checkout_that_kept_its_credentials_is_refused(self):
        s.git(self.agent, "config", "http.https://github.com/.extraheader", "AUTHORIZATION: basic xxx")
        result = self.sh(PREPARE, self.agent)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("persist-credentials: false", result.stdout + result.stderr)


class Bundle(Handoff):
    def test_no_new_commits_uploads_nothing_and_says_so(self):
        self.sh(PREPARE, self.agent)
        self.assertEqual(self.sh(BUNDLE, self.agent).returncode, 0)
        self.assertEqual(self.outputs()["has-commits"], "false")
        self.assertFalse((self.temp / "handoff-out" / "handoff.bundle").exists())

    def test_commits_pushed_to_the_local_repository_by_the_agent_run_are_still_bundled(self):
        self.sh(PREPARE, self.agent)
        self.commit(self.agent, "apps/one.ts")
        s.git(self.agent, "push", "origin", f"HEAD:{self.BRANCH}")  # as medharness --pr does: moves origin/<branch>
        self.commit(self.agent, "apps/two.ts")
        self.assertEqual(self.sh(BUNDLE, self.agent).returncode, 0)
        self.assertEqual(self.outputs()["has-commits"], "true")
        listing = s.git(self.agent, "bundle", "list-heads", str(self.temp / "handoff-out" / "handoff.bundle")).stdout
        self.assertEqual(listing.split()[0], s.git(self.agent, "rev-parse", "HEAD").stdout.strip())
        base = (self.temp / "handoff.base").read_text().strip()
        self.assertEqual(s.git(self.agent, "rev-list", "--count", f"{base}..HEAD").stdout.strip(), "2")


class Push(Handoff):
    def test_a_fast_forward_bundle_is_pushed_to_the_branch(self):
        directory = self.hand_over()
        result = self.push(directory)
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertEqual(self.remote_head(), s.git(self.agent, "rev-parse", "HEAD").stdout.strip())
        self.assertEqual(self.remote_head("main"), s.git(self.seed, "rev-parse", "HEAD").stdout.strip(), "main untouched")

    def test_a_bundle_that_is_not_a_fast_forward_is_refused(self):
        directory = self.hand_over()
        other = self.clone("other")
        self.commit(other, "docs/other.md", message="someone else pushed meanwhile")
        s.git(other, "push", "-q", "origin", f"HEAD:{self.BRANCH}")
        before = self.remote_head()

        result = self.push(directory)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("not a fast-forward", result.stdout + result.stderr)
        self.assertEqual(self.remote_head(), before)

    def test_a_bundle_that_rewrites_history_is_refused(self):
        self.sh(PREPARE, self.agent)
        s.git(self.agent, "checkout", "-q", "--orphan", "rewritten")
        self.commit(self.agent, "apps/a.ts", message="a history of its own")
        self.assertEqual(self.sh(BUNDLE, self.agent).returncode, 0)
        before = self.remote_head()

        result = self.push(self.temp / "handoff-out")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("not a fast-forward", result.stdout + result.stderr)
        self.assertEqual(self.remote_head(), before)

    def test_a_bundle_that_changes_a_workflow_is_refused(self):
        self.sh(PREPARE, self.agent)
        self.commit(self.agent, "apps/feature.ts")
        self.commit(self.agent, ".github/workflows/steal.yml", "on: push\n", message="agent adds a workflow")
        self.sh(BUNDLE, self.agent)
        before = self.remote_head()

        result = self.push(self.temp / "handoff-out")

        self.assertNotEqual(result.returncode, 0)
        output = result.stdout + result.stderr
        self.assertIn(".github/", output)
        self.assertIn("steal.yml", output)
        self.assertEqual(self.remote_head(), before, "not even the harmless commit went through")

    def test_a_change_to_an_existing_action_is_refused_even_if_a_later_commit_reverts_it(self):
        self.sh(PREPARE, self.agent)
        self.commit(self.agent, ".github/ci.yml", "on: [push, pull_request_target]\n")
        self.commit(self.agent, ".github/ci.yml", "on: push\n")
        self.sh(BUNDLE, self.agent)
        before = self.remote_head()
        result = self.push(self.temp / "handoff-out")
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(self.remote_head(), before)

    def test_the_push_runs_no_git_hooks(self):
        directory = self.hand_over()
        pusher = self.clone("pusher")
        marker = self.tmp / "hook-ran"
        for hook in ("pre-push", "reference-transaction", "post-checkout", "post-merge"):
            s.stub_bin(pusher / ".git" / "hooks", hook, f'echo {hook} >> "{marker}"\n')
        # Control: without the guard these hooks do run on a push.
        s.git(pusher, "push", "-q", "origin", "HEAD:refs/heads/control")
        self.assertTrue(marker.exists(), "the hooks must be live for this test to mean anything")
        marker.unlink()

        result = self.push(directory, pusher)

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertFalse(marker.exists(), marker.read_text() if marker.exists() else "")
        self.assertEqual(self.remote_head(), s.git(self.agent, "rev-parse", "HEAD").stdout.strip())

    def test_the_push_command_disables_hooks(self):
        self.assertRegex(PUSH, r"git -c core\.hooksPath=/dev/null push origin")


if __name__ == "__main__":
    unittest.main()
