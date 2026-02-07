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

GitHub Releases で運用する場合、`endpoints` は次の形式です。

```json
"endpoints": ["https://github.com/<OWNER>/<REPO>/releases/latest/download/latest.json"]
```

### プライベートリポジトリでのテスト

`endpoints` は同じ URL 形式のままで、アプリ側から `Authorization` ヘッダーを付けて更新チェックできます。  
このプロジェクトでは更新UIに `Private repo test token` 入力欄を追加しているため、以下でテスト可能です。

1. GitHub の Personal Access Token (PAT) を発行（対象リポジトリへの読み取り権限付き）
2. アプリの更新セクションで token を入力
3. 必要なら `トークン保存` を押してローカル保存（`localStorage`）
4. `更新を確認` を実行

注意: token は平文でローカル保存されるため、本番配布ビルドでの恒久運用には使わず、テスト用途に限定してください。

### 鍵の生成 (初回のみ)

```powershell
npx tauri signer generate --write-keys "$env:USERPROFILE\\.tauri\\supernewroles.key"
```

生成時に表示される公開鍵を `src-tauri/tauri.conf.json` の `plugins.updater.pubkey` に設定します。

### 署名付きアップデート成果物を作る

PowerShell セッションで秘密鍵を環境変数に設定してからビルドします。

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content "$env:USERPROFILE\\.tauri\\supernewroles.key" -Raw
npm run tauri:build
```

`bundle.createUpdaterArtifacts` は有効化済みなので、ビルド時に updater 用ファイルと署名が生成されます。

## CI/CD (GitHub Actions)

以下の workflow を追加済みです。

- `.github/workflows/ci.yml`
  - `main` への push / PR で `npm run build` と `cargo check` を実行
- `.github/workflows/release.yml`
  - `v*` タグ push で Tauri ビルドし、GitHub Release に成果物を公開
  - `latest.json` も自動アップロード (`uploadUpdaterJson: true`)

### 必要な GitHub Secrets

- `TAURI_SIGNING_PRIVATE_KEY`
  - `tauri signer generate` で作った秘密鍵の中身
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
  - 鍵生成時に設定したパスワード（空なら空文字で登録）

### リリース手順

- 推奨手順（GitHub Actions）と、ローカルコマンドのみで完結する手順を
  `docs/RELEASE.md` にまとめています。
- 手順書: `docs/RELEASE.md`

## 次にやること

- `src-tauri/tauri.conf.json` の `identifier` を自分のものに変更
- アイコンを作る場合は `src-tauri/icons/icon.png` を用意して `npm run tauri icon` を実行
