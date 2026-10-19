---
description: Work on a change to this product's Design History File (DHF) with MedHarness. Use when asked to open, design, build or check a change request, or to change what the product does.
---

This repository keeps its Design History File in `DHF/`, checked by MedHarness. A change to what the
product does is not finished until its DHF is.

## Steps

1. **Start a change:** `medharness item create --type CR --data '{"title": "…", "description": "…"}'`.
2. **Design it:** run `medharness build plan --cr CR-NNN --prompt` and do what it says.
3. **Check it**, and fix what each reports:
   - `medharness verify dhf`
   - `medharness verify impact --cr CR-NNN`
4. **Build it:** run `medharness build code --cr CR-NNN --prompt` and do what it says.
5. **Check it again**, and fix what each reports:
   - `medharness verify changes --cr CR-NNN`
   - `medharness verify completion --cr CR-NNN --junit <results>`

## Rules

- Read and write the DHF with `medharness item list|get|create|update|transition`, never by editing
  the files under `DHF/`: the commands check the schema, allocate IDs and change only the fields given.
- A long value (a CR's `impact_analysis`) is easier to write to a file and pass as `--data @fields.json`
  than to quote inline; `--data -` reads standard input.
- A failing check names the item and field that are wrong. Fix that, then run the check again; do not
  describe a check as passing before it has.
- Work locally. Do not push, open an issue or a pull request, set a milestone, or start a workflow unless
  you are asked to use CI: the commands change local files by default, and `--pr` is what reaches a pull request.
- A CR's states are the project's (`medharness item transition CR-NNN` lists where it can go). Move it when
  you start designing; a move that means "approved" (the design, the code) is made only when the user says so.

## In this repository

These come from `CLAUDE.md` and apply on top of the steps above:

- Start with `/pre-analyze` for an ad-hoc change, and create the CR before significant work. Design it locally.
  The CI pipeline (`docs/cr_spec_workflow.md`: setting an issue's milestone creates the CR, the `feat/CR-NNN`
  branch and the design) runs only when the user asks to use CI; a request typed in chat is not started that way.
- In CI a CR's status is moved by the pipeline (design approved, code approved). Locally nobody does that for
  you: move it to `design` when you start designing, and to `develop` or `completed` only when the user says the
  design or the code is approved.
- After the code, run the checks in `CLAUDE.md` (client test, lint and typecheck; `dotnet build` for API
  changes; `pnpm -r typecheck` for shared types) as well as the `verify` commands above.
- Tests that verify a requirement carry `@links:SRS-xxx` (or `SYS-`/`CRS-`); numbered test points use
  `@testing:Tn` in the test name.
- Never commit to `main`; work on a branch, and ask before opening a PR or merging.
