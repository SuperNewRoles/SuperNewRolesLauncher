# Mod Config Editing Guide

SuperNewRolesLauncherは、他のModが簡単にフォークできるようにmod.config.jsonを用意しています。
このガイドでは、mod.config.jsonの編集方法などについて解説します。
前提条件として、Node.jsのインストール及び`npm install`が必須です。

1. `src/shared/mod.config.json` を開く。
2. Mod名やId、Github Releasesのリンクなどを置き換える
3. 次のコマンドを実行する。
```bash
npm run tauri:prepare-config
npm run typecheck
cargo check --manifest-path src-tauri/Cargo.toml
```
4. `npm run tauri:dev` で起動し、必要なタブだけ表示されることを確認する。

他Modのランチャーとして活用する場合、報告センターやアナウンスなどの機能は無効にすることをオススメします。

---

# Mod Config Editing Guide

SuperNewRolesLauncher provides a `mod.config.json` file to make it easy for other mods to fork.
This guide explains how to edit `mod.config.json` and other related procedures.
As a prerequisite, you must have Node.js installed and have run `npm install`.

1. Open `src/shared/mod.config.json`.
2. Replace the Mod name, ID, GitHub Releases link, and other relevant information.
3. Run the following commands:
```bash
npm run tauri:prepare-config
npm run typecheck
cargo check --manifest-path src-tauri/Cargo.toml
```
4. Start the application with `npm run tauri:dev` and verify that only the necessary tabs are displayed.

If you are using this as a launcher for other mods, we recommend disabling features such as the Report Center and Announcements.