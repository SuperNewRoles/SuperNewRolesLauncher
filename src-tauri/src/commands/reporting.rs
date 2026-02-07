use tauri::{AppHandle, Runtime};

use crate::utils::reporting_api;

#[derive(Debug, Clone, serde::Serialize)]
pub struct ReportingPrepareResult {
    pub ready: bool,
    pub token_source: String,
    pub created_account: bool,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct ReportingSendResult {
    pub success: bool,
}

#[tauri::command]
pub async fn reporting_prepare_account<R: Runtime>(
    app: AppHandle<R>,
) -> Result<ReportingPrepareResult, String> {
    let summary = reporting_api::prepare_account(&app).await?;
    Ok(ReportingPrepareResult {
        ready: true,
        token_source: summary.token_source,
        created_account: summary.created_account,
    })
}

#[tauri::command]
pub async fn reporting_list_threads<R: Runtime>(
    app: AppHandle<R>,
) -> Result<Vec<reporting_api::ReportThread>, String> {
    reporting_api::list_threads(&app).await
}

#[tauri::command]
pub async fn reporting_get_messages<R: Runtime>(
    app: AppHandle<R>,
    thread_id: String,
) -> Result<Vec<reporting_api::ReportMessage>, String> {
    reporting_api::get_messages(&app, &thread_id).await
}

#[tauri::command]
pub async fn reporting_send_message<R: Runtime>(
    app: AppHandle<R>,
    thread_id: String,
    content: String,
) -> Result<ReportingSendResult, String> {
    reporting_api::send_message(&app, &thread_id, &content).await?;
    Ok(ReportingSendResult { success: true })
}

#[tauri::command]
pub async fn reporting_send_report<R: Runtime>(
    app: AppHandle<R>,
    input: reporting_api::SendReportInput,
) -> Result<ReportingSendResult, String> {
    reporting_api::send_report(&app, input).await?;
    Ok(ReportingSendResult { success: true })
}

#[tauri::command]
pub async fn reporting_get_notification_flag<R: Runtime>(
    app: AppHandle<R>,
) -> Result<bool, String> {
    reporting_api::get_notification_flag(&app).await
}

#[tauri::command]
pub fn reporting_get_log_source_info<R: Runtime>(
    app: AppHandle<R>,
) -> Result<reporting_api::LogSourceInfo, String> {
    reporting_api::get_log_source_info(&app)
}
