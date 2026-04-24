# CLAUDE.md

This file is the Claude-specific entrypoint for this repository.

Shared repository guidance lives in:
- [`docs/agent_environment.md`](docs/agent_environment.md)
- [`docs/agent_workflow.md`](docs/agent_workflow.md)

Read those first.

## Claude-Specific Notes

There are currently no Claude-specific workflow overrides beyond the shared
documents above.

When updating agent guidance:
- put shared repository guidance in [`docs/agent_environment.md`](docs/agent_environment.md) or [`docs/agent_workflow.md`](docs/agent_workflow.md)
- add content here only if it is genuinely Claude-specific

## Quick Reference

**Key commands**:
```bash
pnpm install                    # install all workspace dependencies
pnpm local:up                   # start local services (Orthanc, etc.)
pnpm local:doctor               # health check all local services
pnpm -F client dev              # start frontend dev server (port 3000)
pnpm -F api run                 # start API dev server (port 4000)
pnpm -F client test             # run frontend tests
pnpm -F client typecheck        # typecheck frontend
pnpm -F shared-types typecheck  # typecheck shared types
pnpm -F api build               # build API
```

**Available skills** (invoke with `/skill-name`):
- `/pre-analyze` — pre-implementation checklist before starting any change
- `/post-implement` — post-implementation checklist before handoff
- `/ux-design` — UX design guidance for clinical imaging components
- `/systematic-debugging` — structured debugging methodology
- `/verify` — verify work is complete before claiming done
- `/finish-branch` — complete a branch with tests, checklist, and PR options
