use std::path::PathBuf;
use tauri::{AppHandle, Runtime};

use crate::utils::migration;

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

/// お引越しデータを書き出す。
#[tauri::command]
pub fn migration_export<R: Runtime>(
    app: AppHandle<R>,
    output_path: Option<String>,
    encryption_enabled: Option<bool>,
    password: Option<String>,
) -> Result<MigrationExportResult, String> {
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
