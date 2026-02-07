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

## 次にやること

- `src-tauri/tauri.conf.json` の `identifier` を自分のものに変更
- アイコンを作る場合は `src-tauri/icons/icon.png` を用意して `npm run tauri icon` を実行

