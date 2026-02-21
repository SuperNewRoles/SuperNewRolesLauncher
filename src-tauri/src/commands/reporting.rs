// 通報API連携をフロントへ公開するコマンド群。
use tauri::{AppHandle, Runtime};

use crate::utils::{mod_profile, reporting_api};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportingPrepareResult {
    pub ready: bool,
    pub token_source: String,
    pub created_account: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ReportingSendResult {
    pub success: bool,
}

fn ensure_reporting_enabled() -> Result<(), String> {
    // 機能無効時は共通チェックで早期リターンする。
    mod_profile::ensure_feature_enabled(mod_profile::Feature::Reporting)
}

/// 報告アカウント準備を行う。
#[tauri::command]
pub async fn reporting_prepare<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ReportingPrepareResult, String> {
    ensure_reporting_enabled()?;
    // アカウント準備結果をUIで扱いやすい形へ詰め替える。
    let summary = reporting_api::prepare_account(&app).await?;
    Ok(ReportingPrepareResult {
        ready: true,
        token_source: summary.token_source,
        created_account: summary.created_account,
    })
}

/// 報告スレッド一覧を取得する。
#[tauri::command]
pub async fn reporting_threads_list<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<reporting_api::ReportThread>, String> {
    ensure_reporting_enabled()?;
    reporting_api::list_threads(&app).await
}

/// 指定スレッドのメッセージ一覧を取得する。
#[tauri::command]
pub async fn reporting_messages_list<R: Runtime>(
    app: AppHandle<R>,
    thread_id: String,
) -> Result<Vec<reporting_api::ReportMessage>, String> {
    ensure_reporting_enabled()?;
    reporting_api::get_messages(&app, &thread_id).await
}

/// スレッドへ返信メッセージを送信する。
#[tauri::command]
pub async fn reporting_message_send<R: Runtime>(
    app: AppHandle<R>,
    thread_id: String,
    content: String,
) -> Result<ReportingSendResult, String> {
    ensure_reporting_enabled()?;
    // command層では入力を改変せず、API層の検証と送信結果をそのまま利用する。
    reporting_api::send_message(&app, &thread_id, &content).await?;
    Ok(ReportingSendResult { success: true })
}

/// 新規報告を送信する。
#[tauri::command]
pub async fn reporting_report_send<R: Runtime>(
    app: AppHandle<R>,
    input: reporting_api::SendReportInput,
) -> Result<ReportingSendResult, String> {
    ensure_reporting_enabled()?;
    reporting_api::send_report(&app, input).await?;
    Ok(ReportingSendResult { success: true })
}

/// サーバ側通知フラグを取得する。
#[tauri::command]
pub async fn reporting_notification_flag_get<R: Runtime>(
    app: AppHandle<R>,
) -> Result<bool, String> {
    ensure_reporting_enabled()?;
    reporting_api::get_notification_flag(&app).await
}

/// ログソース検出情報を取得する。
#[tauri::command]
pub fn reporting_log_source_get<R: Runtime>(
    app: AppHandle<R>,
) -> Result<reporting_api::LogSourceInfo, String> {
    ensure_reporting_enabled()?;
    reporting_api::get_log_source_info(&app)
}
