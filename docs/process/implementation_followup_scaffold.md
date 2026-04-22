# Implementation PR Follow-up Scaffold

## Purpose

This document describes the current follow-up scaffold for active
Implementation PRs.

## Workflow

- `.github/workflows/implementation-pr-follow-up.yml`

## Current Behavior

- reacts to new comments and reviews
- may also run on a schedule
- inspects an active implementation PR
- summarizes comment and review state
- adds `ai:needs-human` when human-originated feedback is present
- adds `ai:replan` when active review state includes `CHANGES_REQUESTED`
- creates or updates a structured bot follow-up comment on the PR
- removes `ai:needs-human` and `ai:replan` when the corresponding condition is cleared

## Limitations

This scaffold does **not yet**:

- patch code automatically in response to review comments
- distinguish scope-changing comments from small review notes beyond `CHANGES_REQUESTED`
- replace a dedicated coding agent runner for true autonomous fixes

## Role In The System

This workflow now provides structured triage signaling and bot replies, but it
still stops short of full autonomous code modification.
