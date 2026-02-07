# SuperNewRolesLauncher Release Process

## Table of Contents
- Overview
- Preconditions
- Method A: GitHub Actions Release (Recommended)
- Method B: Local Commands Only
- Required User Approval Gate
- Release Notes Authoring
- Post-Build Validation
- Cleanup for Wrong Assets

## Overview
Use this runbook to create a new release for `SuperNewRolesLauncher`.
Current policy is Windows NSIS only. Do not ship MSI assets.
Default automation path is GitHub Actions `workflow_dispatch`.

## Preconditions
- Node.js and Rust are installed.
- `npm ci` succeeds.
- Signing key material is ready:
  - `TAURI_SIGNING_PRIVATE_KEY`
  - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- Updater settings in `src-tauri/tauri.conf.json` are correct.
- You can use `gh` CLI with repo/workflow scopes.

## Method A: GitHub Actions Release (Recommended, workflow_dispatch)
Target workflow: `.github/workflows/release.yml`

### 0. Authenticate GitHub CLI
```powershell
gh auth status
```

If needed:
```powershell
gh auth login
```

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

### 3. Trigger release workflow (first)
```powershell
$tag = "v0.1.1"
$version = $tag.TrimStart("v")

gh workflow run release.yml --ref main -f tag_name=$tag
```

### 4. Resolve run id
```powershell
$runId = gh run list --workflow release.yml --event workflow_dispatch --limit 1 --json databaseId --jq ".[0].databaseId"
$runId
```

If `$runId` is empty, run this and choose the latest workflow_dispatch run manually:
```powershell
gh run list --workflow release.yml --limit 10
```

### 5. Generate release note draft automatically
Collect release delta to ground the draft:
```powershell
$prevTag = gh release list --exclude-drafts --exclude-pre-releases --limit 1 --json tagName --jq ".[0].tagName"
git log "$prevTag..HEAD" --pretty=format:"- %s"
```

Then author the notes following `references/release-notes-style.md`.

### 6. Ask user approval (required)
- Present the drafted release note text to the user.
- Ask for explicit approval (`OK` / `Publish`).
- If the user requests changes, revise and ask again.
- Do not watch/publish before approval.

### 7. Watch workflow only after approval
```powershell
gh run watch $runId --exit-status
```

### 8. Validate draft release assets
```powershell
gh release view $tag --json assets --jq ".assets[].name"
```

Expected:
- NSIS installer `.exe`
- Matching `.sig`
- `latest.json`

Unexpected:
- Any `msi`
- Any `msi.sig`

### 9. Apply approved notes and publish
```powershell
$notesPath = ".tmp/release-notes-$tag.md"
New-Item -ItemType Directory -Path ".tmp" -Force | Out-Null
@'
<approved notes>
'@ | Set-Content -Path $notesPath -Encoding UTF8

gh release edit $tag --notes-file $notesPath
gh release edit $tag --draft=false
```

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

### 5. Generate notes and ask user approval
Generate notes with `references/release-notes-style.md`.
Do not publish without user approval.

### 6. Apply approved notes and publish release
```powershell
gh release edit $tag --notes-file ".tmp/release-notes-$tag.md"
gh release edit $tag --draft=false
```

## Required User Approval Gate
Before publish, explicit user approval is mandatory.
Approved examples:
- `OK`
- `この内容で公開して`
- `publish`

## Release Notes Authoring
Always follow `references/release-notes-style.md`:
- Japanese section first
- Download section as `##` heading with installer name
- `---` separator
- English section second
- Download section as `##` heading with installer name

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
