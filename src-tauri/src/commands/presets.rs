use std::path::PathBuf;
use tauri::{AppHandle, Runtime};

use crate::utils::presets;

#[derive(Debug, Clone, serde::Serialize)]
pub struct PresetSummary {
    pub id: i32,
    pub name: String,
    pub has_data_file: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PresetExportResult {
    pub archive_path: String,
    pub exported_presets: usize,
}

#[derive(Debug, Clone, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetImportSelectionInput {
    pub source_id: i32,
    pub name: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ImportedPresetResult {
    pub source_id: i32,
    pub target_id: i32,
    pub name: String,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct PresetImportResult {
    pub imported_presets: usize,
    pub imported: Vec<ImportedPresetResult>,
}

#[tauri::command]
pub fn list_local_presets<R: Runtime>(app: AppHandle<R>) -> Result<Vec<PresetSummary>, String> {
    let presets = presets::list_local_presets(&app)?;
    Ok(presets
        .into_iter()
        .map(|preset| PresetSummary {
            id: preset.id,
            name: preset.name,
            has_data_file: preset.has_data_file,
        })
        .collect())
}

#[tauri::command]
pub fn export_selected_presets<R: Runtime>(
    app: AppHandle<R>,
    preset_ids: Vec<i32>,
    output_path: Option<String>,
) -> Result<PresetExportResult, String> {
    let result = presets::export_selected_presets(&app, preset_ids, output_path)?;
    Ok(PresetExportResult {
        archive_path: result.archive_path.to_string_lossy().to_string(),
        exported_presets: result.exported_presets,
    })
}

#[tauri::command]
pub fn inspect_preset_archive(archive_path: String) -> Result<Vec<PresetSummary>, String> {
    let normalized = archive_path.trim();
    if normalized.is_empty() {
        return Err("Preset archive path is required".to_string());
    }

    let presets = presets::inspect_preset_archive(&PathBuf::from(normalized))?;
    Ok(presets
        .into_iter()
        .map(|preset| PresetSummary {
            id: preset.id,
            name: preset.name,
            has_data_file: preset.has_data_file,
        })
        .collect())
}

#[tauri::command]
pub fn import_presets_from_archive<R: Runtime>(
    app: AppHandle<R>,
    archive_path: String,
    selections: Vec<PresetImportSelectionInput>,
) -> Result<PresetImportResult, String> {
    let normalized = archive_path.trim();
    if normalized.is_empty() {
        return Err("Preset archive path is required".to_string());
    }

    let selections = selections
        .into_iter()
        .map(|selection| presets::PresetImportSelection {
            source_id: selection.source_id,
            name: selection.name,
        })
        .collect();

    let result = presets::import_presets_from_archive(&app, &PathBuf::from(normalized), selections)?;

    Ok(PresetImportResult {
        imported_presets: result.imported_presets,
        imported: result
            .imported
            .into_iter()
            .map(|item| ImportedPresetResult {
                source_id: item.source_id,
                target_id: item.target_id,
                name: item.name,
            })
            .collect(),
    })
}
