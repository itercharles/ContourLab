---
name: systematic-debugging
description: Systematic debugging methodology — invoke when investigating any test failure, unexpected behavior, or production bug
---

# Systematic Debugging

**NO FIXES WITHOUT ROOT CAUSE INVESTIGATION FIRST.**

Random patches mask underlying problems. This process applies to every technical issue: test failures, build errors, unexpected rendering behavior, DICOMweb integration failures, API errors, or Cornerstone.js rendering problems.

## Phase 1: Root Cause Investigation

- Read the full error message and stack trace — do not skim
- Reproduce the issue consistently with documented steps
- Review recent changes that could be relevant (`git log --oneline -20`, `git diff main`)
- For multi-layer issues (client → API → Orthanc), add diagnostic instrumentation at each boundary:
  - Frontend: `console.error` at the DICOMweb fetch boundary and Cornerstone event handlers
  - API: check ASP.NET Core logs and middleware pipeline
  - Orthanc: check `http://127.0.0.1:8042` directly to isolate from the proxy
- Trace data flow backward to find where values diverge from expectation

## Phase 2: Pattern Analysis

- Find similar working code in the codebase and read it completely
- Identify every difference between working and broken versions, no matter how small
- Check whether shared-types recently changed and if the breakage follows a type boundary
- Look at the last passing commit: `git bisect` if the regression is hard to locate

## Phase 3: Hypothesis and Testing

- Write a specific hypothesis before touching any code
- Test with the smallest possible change — one variable at a time
- Verify each result fully before the next step
- Acknowledge gaps rather than guessing — if you don't know, say so

## Phase 4: Implementation

1. Write a failing test that demonstrates the root cause
2. Make one targeted change that addresses it
3. Verify the fix resolves the issue without breaking other tests: `pnpm -r test`
4. **If 3 or more fixes have failed**, stop. The issue is likely architectural. State what you know, what you've tried, and what architectural assumption may be wrong. Do not attempt a 4th fix.

## Red Flags — Stop Immediately If You Notice These

- Proposing a fix before completing Phase 1
- Bundling multiple changes in one attempt
- Saying "let's try this" without a written hypothesis
- Continuing after 3 failed fix attempts without re-examining architecture
