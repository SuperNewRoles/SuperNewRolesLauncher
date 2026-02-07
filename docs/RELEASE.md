# Release 手順書

この手順書は、`SuperNewRolesLauncher` の新規リリースを作るための実運用手順です。  
現在の設定では **Windows は NSIS のみ** を配布対象とし、`msi` / `msi.sig` は生成・アップロードしません。

## 前提

- Node.js / Rust がインストール済み
- `npm ci` が通る
- 署名鍵を用意済み（`TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`）
- `src-tauri/tauri.conf.json` の updater 設定が正しい

---

## 方法A: GitHub Actions でリリース（推奨）

対象 workflow: `.github/workflows/release.yml`

### 1. バージョン更新

必要に応じて以下を更新します。

- `package.json` の `version`
- `src-tauri/tauri.conf.json` の `version`

### 2. main に反映

```powershell
git add .
git commit -m "release: v0.1.1"
git push origin main
```

### 3. タグ push（自動起動）

```powershell
git tag v0.1.1
git push origin v0.1.1
```

`release.yml` が起動し、Draft Release が作成されます。  
設定済みの `args: --bundles nsis` により、`msi` / `msi.sig` は対象外です。
`generateReleaseNotes: true` により、リリースノートは自動生成されます。

### 4. Draft の確認と公開

- 添付ファイルに `msi` / `msi.sig` が無いこと
- `latest.json` が含まれること
- 自動生成されたリリースノートの内容に問題がないこと
- 問題なければ Release を Publish

---

## 方法B: ローカルのコマンドだけでリリース

GitHub Actions を使わず、ローカル端末だけでビルドから Release 作成まで行う手順です。  
GitHub へのアップロードは `gh` CLI を使います（ブラウザ操作不要）。

### 0. 事前準備

```powershell
gh auth status
```

未ログインなら:

```powershell
gh auth login
```

### 1. 署名鍵を環境変数にセット

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$env:USERPROFILE\.tauri\supernewroles.key" -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<鍵のパスワード>"
```

### 2. NSIS のみでビルド

```powershell
npm ci
npm run tauri:build -- --bundles nsis
```

### 3. アップロード対象ファイルを特定

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

### 4. Release 作成（Draft）

```powershell
gh release create $tag `
  "$($exe.FullName)" `
  "$($sig.FullName)" `
  "$($latest.FullName)" `
  --title "SuperNewRolesLauncher $tag" `
  --notes "Manual release for $tag" `
  --draft
```

### 5. 確認後に公開

```powershell
gh release edit $tag --draft=false
```

### 6. （任意）アセット確認・削除

```powershell
gh release view $tag --json assets --jq ".assets[].name"
```

`msi` / `msi.sig` が混ざっていた場合のみ、表示された実ファイル名で削除:

```powershell
gh release delete-asset $tag "<削除したいアセット名>" --yes
```
