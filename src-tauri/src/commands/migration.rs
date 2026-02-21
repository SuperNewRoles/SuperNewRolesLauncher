// お引越し機能の入出力DTOとTauriコマンドを提供する。
use std::path::PathBuf;
use tauri::{AppHandle, Runtime};

use crate::utils::{migration, mod_profile};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationExportResult {
    pub archive_path: String,
    pub included_files: usize,
    pub profile_files: usize,
    pub locallow_files: usize,
    pub encrypted: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationImportResult {
    pub imported_files: usize,
    pub profile_files: usize,
    pub locallow_files: usize,
    pub encrypted: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MigrationPasswordValidationResult {
    pub encrypted: bool,
}

fn ensure_migration_enabled() -> Result<(), String> {
    // 機能フラグで無効化されている場合に共通エラーを返す。
    mod_profile::ensure_feature_enabled(mod_profile::Feature::Migration)
}

/// お引越しデータを書き出す。
#[tauri::command]
pub fn migration_export<R: Runtime>(
    app: AppHandle<R>,
    output_path: Option<String>,
    encryption_enabled: Option<bool>,
    password: Option<String>,
) -> Result<MigrationExportResult, String> {
    ensure_migration_enabled()?;
    // オプションの未指定時は既定値(暗号化なし)を適用する。
    let result = migration::export_migration_data(
        &app,
        output_path,
        encryption_enabled.unwrap_or(false),
        password,
    )?;

    Ok(MigrationExportResult {
        archive_path: result.archive_path.to_string_lossy().to_string(),
        included_files: result.included_files,
        profile_files: result.profile_files,
        locallow_files: result.locallow_files,
        encrypted: result.encrypted,
    })
}

/// お引越しデータを読み込む。
#[tauri::command]
pub fn migration_import<R: Runtime>(
    app: AppHandle<R>,
    archive_path: String,
    password: Option<String>,
) -> Result<MigrationImportResult, String> {
    ensure_migration_enabled()?;
    // 空文字の誤入力を防ぐため、パスはトリムして検証する。
    let normalized = archive_path.trim();
    if normalized.is_empty() {
        return Err("Migration archive path is required".to_string());
    }

    let result = migration::import_migration_data(&app, &PathBuf::from(normalized), password)?;

    Ok(MigrationImportResult {
        imported_files: result.imported_files,
        profile_files: result.profile_files,
        locallow_files: result.locallow_files,
        encrypted: result.encrypted,
    })
}

/// お引越しアーカイブのパスワードを検証する。
#[tauri::command]
pub fn migration_validate_archive_password(
    archive_path: String,
    password: Option<String>,
) -> Result<MigrationPasswordValidationResult, String> {
    ensure_migration_enabled()?;
    let normalized = archive_path.trim();
    if normalized.is_empty() {
        return Err("Migration archive path is required".to_string());
    }

    // ここではパスワードの妥当性だけを確認し、実データの展開は行わない。
    let result =
        migration::validate_migration_archive_password(&PathBuf::from(normalized), password)?;
    Ok(MigrationPasswordValidationResult {
        encrypted: result.encrypted,
    })
}
