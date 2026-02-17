---
name: github-actions-ci-fix-loop
description: Investigate and fix failing GitHub Actions CI runs, then iterate until the workflow passes. Use when users ask to inspect CI errors, read failing logs, apply fixes, commit and push changes (including Japanese commit messages when requested), wait for new CI runs, and repeat until green.
---

# GitHub Actions CI Fix Loop

## Overview

Execute an end-to-end CI recovery loop with `gh` and local checks.  
Prefer minimal, verifiable fixes and continue iterating until GitHub Actions is green.

## Workflow

1. Confirm branch state and locate the latest failing run.
```powershell
git status --short --branch
gh run list --limit 10
```
- Select the newest relevant failed run ID for the target branch/PR.

2. Read the failure log and isolate the first actionable error.
```powershell
gh run view <run_id> --log-failed
```
- If needed, read full logs with `gh run view <run_id> --log`.

3. Reproduce the failing step locally.
- Run the same command shown in the failed job step.
- Prefer checking commands in `.github/workflows/*.yml` first.

4. Implement the smallest fix that resolves the root cause.
- Edit only necessary files.
- Keep behavior changes intentional; avoid unrelated cleanup unless needed for CI.

5. Run local validation matching CI scope.
- Execute the failing check first.
- Then execute dependent checks likely to fail next (for example: lint -> test -> build -> rust checks).

6. Commit and push.
```powershell
git add -u
git commit -m "<message>"
git push origin <branch>
```
- Write the commit message in Japanese.

7. Wait for newly triggered CI and branch on result.
```powershell
gh run list --branch <branch> --limit 5 --json databaseId,headSha,status,conclusion,createdAt
gh run watch <new_run_id> --exit-status
```
- Ensure the watched run corresponds to the latest pushed commit SHA.
- If CI fails, return to Step 2 and continue the loop.
- If CI passes, finish with a concise result report.

## Reporting Checklist

- Report the failing run ID and root cause.
- Report each fix and commit SHA.
- Report the final successful run ID and status.
- Mention any residual risk or checks not executed locally.

## Guardrails

- Avoid reverting unrelated user changes.
- Avoid destructive git commands.
- Keep commit scope narrow to CI-related fixes.
- Stop only when CI is green or when blocked by missing permissions/external constraints.
