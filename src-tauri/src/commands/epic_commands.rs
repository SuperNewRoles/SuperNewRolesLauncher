use tauri::Emitter;

use crate::commands::epic_login_window::EpicLoginWindow;
use crate::utils::epic_api::{self, EpicApi};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EpicLoginStatus {
    pub logged_in: bool,
    pub account_id: Option<String>,
    pub display_name: Option<String>,
    pub profile_error: Option<String>,
}

/// Epic認証URLを返す（将来拡張用）。
#[tauri::command]
pub fn epic_auth_url_get() -> String {
    EpicApi::get_auth_url()
}

/// 認証コードでEpicログインを行う。
#[tauri::command]
pub async fn epic_login_code(code: String) -> Result<(), String> {
    let normalized = code.trim().replace('"', "");
    if normalized.is_empty() {
        return Err("Epic authorization code is empty".to_string());
    }

    let session = EpicApi::new()?.login_with_auth_code(&normalized).await?;
    epic_api::save_session(&session)
}

/// WebViewでEpicログインを開始する。
#[tauri::command]
pub async fn epic_login_webview(app: tauri::AppHandle) -> Result<(), String> {
    let app_success = app.clone();
    let app_error = app.clone();
    let app_cancel = app.clone();

    EpicLoginWindow::open(
        &app,
        move || {
            let _ = app_success.emit("epic-login-success", ());
        },
        move |error| {
            let _ = app_error.emit("epic-login-error", error);
        },
        move || {
            let _ = app_cancel.emit("epic-login-cancelled", ());
        },
    )
}

/// 保存済みセッションの復元を試みる。
#[tauri::command]
pub async fn epic_session_restore() -> Result<bool, String> {
    let Some(saved_session) = epic_api::load_session() else {
        return Ok(false);
    };

    match EpicApi::new()?
        .refresh_session(&saved_session.refresh_token)
        .await
    {
        Ok(session) => {
            epic_api::save_session(&session)?;
            Ok(true)
        }
        Err(_) => Ok(false),
    }
}

/// ログイン状態のみを返す簡易API。
#[tauri::command]
pub async fn epic_logged_in_get() -> Result<bool, String> {
    Ok(epic_api::load_session().is_some())
}

/// ログイン状態詳細を返す。
#[tauri::command]
pub async fn epic_status_get() -> Result<EpicLoginStatus, String> {
    let Some(session) = epic_api::load_session() else {
        return Ok(EpicLoginStatus {
            logged_in: false,
            account_id: None,
            display_name: None,
            profile_error: None,
        });
    };

    let display_name = session
        .display_name
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    Ok(EpicLoginStatus {
        logged_in: true,
        account_id: Some(session.account_id.clone()),
        display_name,
        profile_error: None,
    })
}

/// Epicセッションを削除する。
#[tauri::command]
pub async fn epic_logout() -> Result<(), String> {
    epic_api::clear_session()
}
