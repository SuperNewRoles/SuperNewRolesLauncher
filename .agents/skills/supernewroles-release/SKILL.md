---
name: supernewroles-release
description: Run and support release operations for SuperNewRolesLauncher (Tauri v2) with NSIS-only distribution, including workflow_dispatch-based GitHub Actions releases, auto-authored bilingual release notes, explicit user approval gates, and final publish.
---

# SuperNewRoles Release

## Overview

Execute the repository release workflow with this policy:
- Windows distribution is NSIS only.
- No `msi` and no `msi.sig`.
- Release notes are auto-authored in Japanese and English, then confirmed by the user before publish.

Use GitHub Actions (`workflow_dispatch`) by default.
Use the local flow only when the user explicitly requests local-only release or CI is unavailable.

## Workflow Decision

1. Default to GitHub Actions flow in `references/release-process.md` Method A.
2. Trigger the action first, then auto-draft release notes.
3. Show drafted notes to the user and ask for explicit approval.
4. Only after user approval: watch the workflow, validate assets, set release notes, and publish.
5. Enforce NSIS-only outputs and remove wrong assets if needed.

## Required Inputs

- Target tag (example: `v0.1.1`)
- Version sync in:
  - `package.json` -> `version`
  - `src-tauri/tauri.conf.json` -> `version`
- Availability of signing secrets:
  - `TAURI_SIGNING_PRIVATE_KEY`
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

## Standard Procedure (GitHub Actions Default)

1. Validate preconditions and update versions.
2. Commit/push to `main`.
3. Trigger `release.yml` via `workflow_dispatch` with the target tag.
4. Auto-generate bilingual release notes draft using `references/release-notes-style.md`.
5. Ask user confirmation with explicit yes/no.
6. If approved, run `gh run watch ... --exit-status`.
7. Validate draft assets (`latest.json`, `.exe`, `.sig`, no MSI).
8. Apply approved notes to draft release and publish.
9. If user requests edits, revise notes and repeat confirmation.

## Hard Rules

- Never publish without explicit user approval.
- Never publish if `latest.json` is missing.
- Never leave `msi` / `msi.sig` in assets.
- Always use the required bilingual note format from `references/release-notes-style.md`.
- The final section in each language must be a `##` heading that tells users to download `SuperNewRolesLauncher_{version}_x64-setup.exe`.

## Validation Checklist

- Release is created with expected tag.
- Installer artifact is NSIS executable and has matching `.sig`.
- `latest.json` exists in release assets.
- Release notes are in the required JA/EN format and approved by the user.
- No `msi` and no `msi.sig` in release assets.
- Draft is published only after the above checks pass.

## References

- Full command runbook: `references/release-process.md`
- Release note style and template: `references/release-notes-style.md`
- Workflow source of truth: `.github/workflows/release.yml`
- Project release document: `docs/RELEASE.md`

When the user asks to execute a release:
1. Copy relevant commands exactly from `references/release-process.md`.
2. Substitute only variables such as tag, version, run id, and notes path.
3. Follow `references/release-notes-style.md` exactly for note structure and tone.
