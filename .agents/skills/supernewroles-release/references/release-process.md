# SuperNewRolesLauncher Release Process

## Table of Contents
- Overview
- Preconditions
- Method A: GitHub Actions Release (Recommended)
- Method B: Local Commands Only
- Post-Build Validation
- Cleanup for Wrong Assets

## Overview
Use this runbook to create a new release for `SuperNewRolesLauncher`.
Current policy is Windows NSIS only. Do not ship MSI assets.

## Preconditions
- Node.js and Rust are installed.
- `npm ci` succeeds.
- Signing key material is ready:
  - `TAURI_SIGNING_PRIVATE_KEY`
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- Updater settings in `src-tauri/tauri.conf.json` are correct.

## Method A: GitHub Actions Release (Recommended)
Target workflow: `.github/workflows/release.yml`

### 1. Update versions
Update both files when needed:
- `package.json` -> `version`
- `src-tauri/tauri.conf.json` -> `version`

### 2. Commit and push to main
```powershell
git add .
git commit -m "release: v0.1.1"
git push origin main
```

### 3. Push tag to trigger release
```powershell
git tag v0.1.1
git push origin v0.1.1
```

The workflow creates a draft release.
`args: --bundles nsis` keeps distribution NSIS-only.
`generateReleaseNotes: true` generates release notes automatically.

### 4. Review draft and publish
Check the draft assets:
- `latest.json` exists.
- `msi` and `msi.sig` do not exist.
- Auto-generated release notes are correct for this tag.

Publish only after validation succeeds.

## Method B: Local Commands Only
Use this when CI is not used.

### 0. Authenticate GitHub CLI
```powershell
gh auth status
```

If needed:
```powershell
gh auth login
```

### 1. Set signing environment variables
```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$env:USERPROFILE\.tauri\supernewroles.key" -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<key-password>"
```

### 2. Build NSIS only
```powershell
npm ci
npm run tauri:build -- --bundles nsis
```

### 3. Resolve upload files
```powershell
$tag = "v0.1.1"
$bundleDir = "src-tauri/target/release/bundle/nsis"
$exe = Get-ChildItem $bundleDir -File -Filter "*.exe" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
$sig = Get-Item "$($exe.FullName).sig"
$latest = Get-ChildItem "src-tauri/target/release/bundle" -Recurse -File -Filter "latest.json" | Select-Object -First 1

$exe.FullName
$sig.FullName
$latest.FullName
```

### 4. Create draft release
```powershell
gh release create $tag `
  "$($exe.FullName)" `
  "$($sig.FullName)" `
  "$($latest.FullName)" `
  --title "SuperNewRolesLauncher $tag" `
  --notes "Manual release for $tag" `
  --draft
```

### 5. Publish release
```powershell
gh release edit $tag --draft=false
```

## Post-Build Validation
Run before publish:

```powershell
gh release view $tag --json assets --jq ".assets[].name"
```

Expected:
- NSIS installer `.exe`
- matching `.sig`
- `latest.json`

Unexpected:
- Any `msi`
- Any `msi.sig`

## Cleanup for Wrong Assets
If wrong assets are present:

```powershell
gh release delete-asset $tag "<asset-name>" --yes
```

Delete only incorrect assets, then run validation again.
