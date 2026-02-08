//! SNR関連のcommand境界。
//! 実処理はservices層へ委譲し、この層は入出力契約に専念する。

use tauri::{AppHandle, Runtime};

use crate::services::snr_service;

pub use snr_service::{InstallResult, PreservedSaveDataStatus, SnrReleaseSummary, UninstallResult};

/// 利用可能なSNRリリース一覧を取得する。
#[tauri::command]
pub async fn snr_releases_list() -> Result<Vec<SnrReleaseSummary>, String> {
    snr_service::list_snr_releases().await
}

/// 保持済みセーブデータの状態を返す。
#[tauri::command]
pub fn snr_preserved_save_data_status<R: Runtime>(
    app: AppHandle<R>,
) -> Result<PreservedSaveDataStatus, String> {
    snr_service::get_preserved_save_data_status(app)
}

/// プロファイルをアンインストールし、必要ならセーブデータを退避する。
#[tauri::command]
pub fn snr_uninstall<R: Runtime>(
    app: AppHandle<R>,
    preserve_save_data: bool,
) -> Result<UninstallResult, String> {
    snr_service::uninstall_snr_profile(app, preserve_save_data)
}

/// 指定タグのSNRをインストールする。
#[tauri::command]
pub async fn snr_install<R: Runtime>(
    app: AppHandle<R>,
    tag: String,
    platform: String,
    restore_preserved_save_data: Option<bool>,
) -> Result<InstallResult, String> {
    snr_service::install_snr_release(app, tag, platform, restore_preserved_save_data).await
}
