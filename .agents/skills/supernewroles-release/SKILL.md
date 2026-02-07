---
name: supernewroles-release
description: Run and support release operations for SuperNewRolesLauncher (Tauri v2) with NSIS-only distribution, including version bump checks, tag-driven GitHub Actions releases, and local gh CLI draft/publish flow. Use when asked to create, verify, troubleshoot, or publish a release; inspect release assets; ensure latest.json is included; or remove accidental msi/msi.sig assets.
---

# SuperNewRoles Release

## Overview

Execute the release workflow defined by this repository and keep release outputs consistent with current policy: Windows NSIS only, no MSI artifacts.
Prefer GitHub Actions release flow and use local manual flow only when explicitly requested or when CI cannot be used.

## Workflow Decision

1. Use the GitHub Actions flow by default.
2. Use the local flow only when the user asks for a local-only release or when CI is unavailable.
3. Enforce NSIS-only outputs in both flows.
4. Verify release assets before publish: include `latest.json`, exclude `msi` and `msi.sig`.

## Required Inputs

- Target tag (example: `v0.1.1`)
- Confirmation that versions are updated in `package.json` and `src-tauri/tauri.conf.json`
- Availability of signing secrets/key:
  - `TAURI_SIGNING_PRIVATE_KEY`
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

## Standard Procedure

1. Confirm release path (GitHub Actions or local).
2. Validate preconditions (version, key/secrets, config).
3. Run the selected flow commands from `references/release-process.md`.
4. Check draft assets and publish only after validation checklist passes.
5. If unwanted assets exist (`msi`, `msi.sig`), remove and re-verify before publish.

## Validation Checklist

- Release is created with expected tag.
- Installer artifact is NSIS executable and has matching `.sig`.
- `latest.json` exists in release assets.
- Auto-generated release notes are suitable for publish.
- No `msi` and no `msi.sig` in release assets.
- Draft is published only after the above checks pass.

## References

- Full command runbook: `references/release-process.md`
- Workflow source of truth: `.github/workflows/release.yml`
- Project release document: `docs/RELEASE.md`

When the user asks to execute a release, copy the relevant commands exactly from the reference file and substitute only variables such as tag names and key paths.
