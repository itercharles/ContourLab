# Completion Sync Scaffold

## Purpose

This document describes the current scaffold for synchronizing CR state from
`developing` to `completed` after an implementation PR merge.

## Workflow

- `.github/workflows/cr-completion-sync.yml`

## Current Behavior

- reacts to merged PR closure events
- verifies that the merged PR is an implementation PR
- parses the linked CR PR URL from the implementation PR body
- updates the linked DHF CR labels from `cr:developing` to `cr:completed`
- comments on the DHF CR item with the implementation PR URL

## Limitations

This scaffold does **not yet**:

- verify that all required DHF implementation PRs are merged first
- verify that all required CI checks passed through a policy layer
- handle multiple linked DHF PRs
- close the loop on plan PR labels

## Role In The System

This workflow closes the basic CR lifecycle loop, but it is still a thin sync
layer rather than a full release-governance gate.
