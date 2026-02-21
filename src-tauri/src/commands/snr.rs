//! SNR関連のcommand境界。
//! 実処理はservices層へ委譲し、この層は入出力契約に専念する。

use tauri::{AppHandle, Runtime};

use crate::{services::snr_service, utils::mod_profile};

pub use snr_service::{
    InstallResult, PreservedSaveDataStatus, SaveDataImportResult, SaveDataPresetMergeResult,
    SaveDataPreviewResult, SnrReleaseSummary, UninstallResult,
};

fn ensure_presets_enabled() -> Result<(), String> {
    // プリセット関連APIのみ、機能フラグで明示的にガードする。
    mod_profile::ensure_feature_enabled(mod_profile::Feature::Presets)
}

/// 利用可能なSNRリリース一覧を取得する。
#[tauri::command]
pub async fn snr_releases_list() -> Result<Vec<SnrReleaseSummary>, String> {
    // 後方互換のため、実体は汎用APIへ委譲して返却を統一する。
    mod_releases_list().await
}

/// 保持済みセーブデータの状態を返す。
#[tauri::command]
pub fn snr_preserved_save_data_status<R: Runtime>(
    app: AppHandle<R>,
) -> Result<PreservedSaveDataStatus, String> {
    mod_preserved_save_data_status(app)
}

/// 指定したAmong UsフォルダからSaveDataの取り込み候補を検査する。
#[tauri::command]
pub fn snr_savedata_preview(source_among_us_path: String) -> Result<SaveDataPreviewResult, String> {
    mod_savedata_preview(source_among_us_path)
}

/// 指定したAmong UsフォルダのSaveDataを現在のプロファイルへ取り込む。
#[tauri::command]
pub fn snr_savedata_import<R: Runtime>(
    app: AppHandle<R>,
    source_among_us_path: String,
) -> Result<SaveDataImportResult, String> {
    // 旧snr命名の互換APIとして残しつつ、実装本体は汎用mod APIへ委譲する。
    mod_savedata_import(app, source_among_us_path)
}

/// 指定したAmong UsフォルダのSaveDataからプリセットのみを現在のプロファイルへ追加取り込みする。
#[tauri::command]
pub fn snr_savedata_merge_presets<R: Runtime>(
    app: AppHandle<R>,
    source_among_us_path: String,
) -> Result<SaveDataPresetMergeResult, String> {
    mod_savedata_merge_presets(app, source_among_us_path)
}

/// 保持済みSaveDataからプリセットのみを現在のプロファイルへ追加取り込みする。
#[tauri::command]
pub fn snr_preserved_savedata_merge_presets<R: Runtime>(
    app: AppHandle<R>,
) -> Result<SaveDataPresetMergeResult, String> {
    mod_preserved_savedata_merge_presets(app)
}

/// プロファイルをアンインストールし、必要ならセーブデータを退避する。
#[tauri::command]
pub fn snr_uninstall<R: Runtime>(
    app: AppHandle<R>,
    preserve_save_data: bool,
) -> Result<UninstallResult, String> {
    mod_uninstall(app, preserve_save_data)
}

/// 指定タグのSNRをインストールする。
#[tauri::command]
pub async fn snr_install<R: Runtime>(
    app: AppHandle<R>,
    tag: String,
    platform: String,
    restore_preserved_save_data: Option<bool>,
) -> Result<InstallResult, String> {
    mod_install(app, tag, platform, restore_preserved_save_data).await
}

/// 利用可能なmodリリース一覧を取得する（汎用API）。
#[tauri::command]
pub async fn mod_releases_list() -> Result<Vec<SnrReleaseSummary>, String> {
    snr_service::list_snr_releases().await
}

/// 保持済みセーブデータの状態を返す（汎用API）。
#[tauri::command]
pub fn mod_preserved_save_data_status<R: Runtime>(
    app: AppHandle<R>,
) -> Result<PreservedSaveDataStatus, String> {
    snr_service::get_preserved_save_data_status(app)
}

/// 指定したAmong UsフォルダからSaveDataの取り込み候補を検査する（汎用API）。
#[tauri::command]
pub fn mod_savedata_preview(source_among_us_path: String) -> Result<SaveDataPreviewResult, String> {
    snr_service::preview_savedata_from_among_us(source_among_us_path)
}

/// 指定したAmong UsフォルダのSaveDataを現在のプロファイルへ取り込む（汎用API）。
#[tauri::command]
pub fn mod_savedata_import<R: Runtime>(
    app: AppHandle<R>,
    source_among_us_path: String,
) -> Result<SaveDataImportResult, String> {
    snr_service::import_savedata_from_among_us_into_profile(&app, source_among_us_path)
}

/// 指定したAmong UsフォルダのSaveDataからプリセットのみを追加取り込みする（汎用API）。
#[tauri::command]
pub fn mod_savedata_merge_presets<R: Runtime>(
    app: AppHandle<R>,
    source_among_us_path: String,
) -> Result<SaveDataPresetMergeResult, String> {
    ensure_presets_enabled()?;
    snr_service::merge_savedata_presets_from_among_us_into_profile(&app, source_among_us_path)
}

/// 保持済みSaveDataからプリセットのみを追加取り込みする（汎用API）。
#[tauri::command]
pub fn mod_preserved_savedata_merge_presets<R: Runtime>(
    app: AppHandle<R>,
) -> Result<SaveDataPresetMergeResult, String> {
    ensure_presets_enabled()?;
    snr_service::merge_preserved_savedata_presets_into_profile(&app)
}

/// プロファイルをアンインストールし、必要ならセーブデータを退避する（汎用API）。
#[tauri::command]
pub fn mod_uninstall<R: Runtime>(
    app: AppHandle<R>,
    preserve_save_data: bool,
) -> Result<UninstallResult, String> {
    snr_service::uninstall_snr_profile(app, preserve_save_data)
}

/// 指定タグのmodをインストールする（汎用API）。
#[tauri::command]
pub async fn mod_install<R: Runtime>(
    app: AppHandle<R>,
    tag: String,
    platform: String,
    restore_preserved_save_data: Option<bool>,
) -> Result<InstallResult, String> {
    snr_service::install_snr_release(app, tag, platform, restore_preserved_save_data).await
}
