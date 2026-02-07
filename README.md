# SuperNewRolesLauncher (Tauri)

このリポジトリは **Tauri v2 + Vite(バニラTypeScript)** の雛形を含みます。

## 必要なもの

- Node.js (既に入っていればOK)
- Rust toolchain (rustup)
- Windowsの場合はビルドツール (MSVC)

### Rustの導入

```powershell
winget install Rustlang.Rustup
rustup default stable
```

## 開発起動

```powershell
npm install
npm run tauri:dev
```

## ビルド

```powershell
npm run tauri:build
```

## 自動アップデート (in-app updater)

このプロジェクトは `@tauri-apps/plugin-updater` を組み込み済みです。  
`src-tauri/tauri.conf.json` の以下2項目は必ず実値に置き換えてください。

- `plugins.updater.endpoints` (更新メタデータ `latest.json` のURL)
- `plugins.updater.pubkey` (Tauri updater の公開鍵)

### 鍵の生成 (初回のみ)

```powershell
npm run tauri signer generate -w "$env:USERPROFILE\\.tauri\\supernewroles.key"
```

生成時に表示される公開鍵を `src-tauri/tauri.conf.json` の `plugins.updater.pubkey` に設定します。

### 署名付きアップデート成果物を作る

PowerShell セッションで秘密鍵を環境変数に設定してからビルドします。

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$env:USERPROFILE\\.tauri\\supernewroles.key" -Raw
npm run tauri:build
```

`bundle.createUpdaterArtifacts` は有効化済みなので、ビルド時に updater 用ファイルと署名が生成されます。

## 次にやること

- `src-tauri/tauri.conf.json` の `identifier` を自分のものに変更
- アイコンを作る場合は `src-tauri/icons/icon.png` を用意して `npm run tauri icon` を実行
