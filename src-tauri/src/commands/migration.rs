use std::path::PathBuf;
use tauri::{AppHandle, Runtime};

use crate::utils::migration;

#[derive(Debug, Clone, serde::Serialize)]
pub struct MigrationExportResult {
    pub archive_path: String,
    pub included_files: usize,
    pub profile_files: usize,
    pub locallow_files: usize,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct MigrationImportResult {
    pub imported_files: usize,
    pub profile_files: usize,
    pub locallow_files: usize,
}

#[tauri::command]
pub fn export_migration_data<R: Runtime>(
    app: AppHandle<R>,
    output_path: Option<String>,
) -> Result<MigrationExportResult, String> {
    let result = migration::export_migration_data(&app, output_path)?;

    Ok(MigrationExportResult {
        archive_path: result.archive_path.to_string_lossy().to_string(),
        included_files: result.included_files,
        profile_files: result.profile_files,
        locallow_files: result.locallow_files,
    })
}

#[tauri::command]
pub fn import_migration_data<R: Runtime>(
    app: AppHandle<R>,
    archive_path: String,
) -> Result<MigrationImportResult, String> {
    let normalized = archive_path.trim();
    if normalized.is_empty() {
        return Err("Migration archive path is required".to_string());
    }

    let result = migration::import_migration_data(&app, &PathBuf::from(normalized))?;

    Ok(MigrationImportResult {
        imported_files: result.imported_files,
        profile_files: result.profile_files,
        locallow_files: result.locallow_files,
    })
}
