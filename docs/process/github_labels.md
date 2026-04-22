# GitHub Label Manifest

## Purpose

This document defines the label baseline required by the CR-driven automation
workflow.

## Source Of Truth

Machine-readable label definitions live in:

- [`.github/labels.json`](/Users/charles/Code/WebTPS/.github/labels.json)

## Required Labels

### PR Type

- `pr:cr`
- `pr:plan`
- `pr:implementation`

### CR Status

- `cr:new`
- `cr:analyze`
- `cr:developing`
- `cr:completed`
- `cr:rejected`

### AI Control

- `ai:ready`
- `ai:blocked`
- `ai:needs-human`
- `ai:replan`

## Initialization Guidance

Before enabling the automation workflows in a repository, create or reconcile
these labels first.

The current repository stores the canonical manifest but does not yet apply the
labels automatically through GitHub API.

## Change Policy

When adding, removing, or renaming labels:

1. update `.github/labels.json`
2. update automation design docs if semantics change
3. update workflows that depend on the label
