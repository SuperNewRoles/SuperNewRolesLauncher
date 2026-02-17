# ARCHITECTURE

このドキュメントは、`SuperNewRolesLauncher` の実装責務と命名規約をまとめたものです。

## Mod設定駆動

- `src/shared/mod.config.json`
  - fork時の変更起点。Mod名/配布Repo/API/機能トグル/移行対象パス/ブランド情報を定義します。
- `src/shared/mod.config.template.json`
  - fork用入力テンプレート。`mod.config.json` を作るときの下書きに使います。
- `src-tauri/src/utils/mod_profile.rs`
  - バックエンド側の設定ローダー。起動時にバリデーションし、全機能で参照します。
- `src/app/modConfig.ts`
  - フロント側の設定ローダー。UI構成やリンク、機能表示制御に利用します。
- `scripts/generate-tauri-config.mjs`
  - `mod.config.json` から `src-tauri/tauri.generated.conf.json` を生成し、`productName`/`identifier`/updater endpoint を反映します。

## フロントエンド構成

- `src/main.ts`
  - エントリポイント。`styles` の読み込みと `runApp()` 呼び出しのみを担当します。
- `src/app/bootstrap.ts`
  - 画面初期化、イベント購読、機能間連携のオーケストレーションを担当します。
- `src/app/template.ts`
  - HTMLテンプレート生成専用。DOMイベントや状態更新は持ちません。
- `src/app/dom.ts`
  - DOM要素取得を集約し、セレクタ崩れを初期化時に検出します。
- `src/app/state/store.ts`
  - `@preact/signals-core` を使ったアプリ状態コンテナです。
- `src/app/state/selectors.ts`
  - ボタン活性などの条件判定を純関数として提供します。
- `src/app/services/tauriClient.ts`
  - Tauri command 呼び出しの窓口です。

## バックエンド（Tauri/Rust）構成

- `src-tauri/src/commands`
  - Tauri公開境界。入力検証とサービス呼び出しのみを行います。
- `src-tauri/src/services`
  - 業務ロジック層。`snr` / `launch` の重い処理を保持します。
- `src-tauri/src/utils`
  - 共通ユーティリティ（設定、API、圧縮、暗号化、ストレージ）です。

## Tauri command 命名規約

機能プレフィックス付きの `snake_case` で統一します。

- settings: `settings_get`, `settings_update`, `settings_profile_ready`
- finder: `finder_detect_among_us`, `finder_detect_platform`
- snr: `snr_releases_list`, `snr_install`, `snr_uninstall`, `snr_preserved_save_data_status`
- mod: `mod_releases_list`, `mod_install`, `mod_uninstall`, `mod_preserved_save_data_status`
  - 互換のため `snr_*` も当面維持し、内部で `mod_*` 相当処理へ委譲します。
- migration: `migration_export`, `migration_import`
- presets: `presets_list_local`, `presets_export`, `presets_inspect_archive`, `presets_import_archive`
- reporting: `reporting_prepare`, `reporting_threads_list`, `reporting_messages_list`, `reporting_message_send`, `reporting_report_send`, `reporting_notification_flag_get`, `reporting_log_source_get`
- launch: `launch_modded`, `launch_vanilla`, `launch_shortcut_create`, `launch_autolaunch_error_take`, `launch_game_running_get`
- epic: `epic_auth_url_get`, `epic_login_webview`, `epic_login_code`, `epic_session_restore`, `epic_logged_in_get`, `epic_status_get`, `epic_logout`

## DTO ポリシー

- フロントとの送受信は `camelCase` を基本とします。
- Rust 側は `serde(rename_all = "camelCase")` を使い、内部実装の `snake_case` と分離します。

## コメント方針

- コメントは日本語で記述します。
- モジュール先頭に責務を明記します。
- 公開関数や複雑処理には「何を保証するか」「なぜ必要か」を記載します。
- OS依存分岐や `unsafe` には安全性前提をコメントで示します。

