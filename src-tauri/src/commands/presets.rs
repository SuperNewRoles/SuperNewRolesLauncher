use std::path::PathBuf;
use tauri::{AppHandle, Runtime};

use crate::utils::{mod_profile, presets};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetSummary {
    pub id: i32,
    pub name: String,
    pub has_data_file: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
pub struct ImportedPresetResult {
    pub source_id: i32,
    pub target_id: i32,
    pub name: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetImportResult {
    pub imported_presets: usize,
    pub imported: Vec<ImportedPresetResult>,
}

fn ensure_presets_enabled() -> Result<(), String> {
    mod_profile::ensure_feature_enabled(mod_profile::Feature::Presets)
}

/// ローカルプリセット一覧を取得する。
#[tauri::command]
pub fn presets_list_local<R: Runtime>(app: AppHandle<R>) -> Result<Vec<PresetSummary>, String> {
    ensure_presets_enabled()?;
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

/// 指定プリセットをアーカイブへ書き出す。
#[tauri::command]
pub fn presets_export<R: Runtime>(
    app: AppHandle<R>,
    preset_ids: Vec<i32>,
    output_path: Option<String>,
) -> Result<PresetExportResult, String> {
    ensure_presets_enabled()?;
    let result = presets::export_selected_presets(&app, preset_ids, output_path)?;
    Ok(PresetExportResult {
        archive_path: result.archive_path.to_string_lossy().to_string(),
        exported_presets: result.exported_presets,
    })
}

/// プリセットアーカイブ内容を確認する。
#[tauri::command]
pub fn presets_inspect_archive(archive_path: String) -> Result<Vec<PresetSummary>, String> {
    ensure_presets_enabled()?;
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

/// プリセットアーカイブを取り込む。
#[tauri::command]
pub fn presets_import_archive<R: Runtime>(
    app: AppHandle<R>,
    archive_path: String,
    selections: Vec<PresetImportSelectionInput>,
) -> Result<PresetImportResult, String> {
    ensure_presets_enabled()?;
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

    let result =
        presets::import_presets_from_archive(&app, &PathBuf::from(normalized), selections)?;

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
