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

## Limitations

This scaffold does **not yet**:

- triage comments semantically
- reply to comments automatically
- patch code automatically in response to review comments
- distinguish scope-changing comments from small review notes

## Role In The System

This workflow is a review-signal scaffold. It does not yet implement the full
AI fix-and-reply loop.
