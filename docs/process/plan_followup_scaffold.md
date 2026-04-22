# Plan PR Follow-up Scaffold

## Purpose

This document describes the current follow-up scaffold for active Plan Spec
PRs.

## Workflow

- `.github/workflows/plan-pr-follow-up.yml`

## Current Behavior

- reacts to new comments and reviews
- may also run on a schedule
- inspects an active Plan PR
- summarizes comment and review state
- adds `ai:needs-human` when human-originated feedback is present

## Limitations

This scaffold does **not yet**:

- triage comments semantically
- reply to comments automatically
- revise the plan spec automatically
- distinguish actionable comments from informational comments

## Role In The System

This workflow is an observability and handoff scaffold. It is not yet the full
AI review-response loop described in the process documents.
