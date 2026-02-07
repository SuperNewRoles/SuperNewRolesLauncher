use tauri::Emitter;

use crate::commands::epic_login_window::EpicLoginWindow;
use crate::utils::epic_api::{self, EpicApi};

#[derive(Debug, Clone, serde::Serialize)]
pub struct EpicLoginStatus {
    pub logged_in: bool,
    pub account_id: Option<String>,
    pub display_name: Option<String>,
    pub profile_error: Option<String>,
}

#[tauri::command]
pub fn get_epic_auth_url() -> String {
    EpicApi::get_auth_url()
}

#[tauri::command]
pub async fn epic_login_with_code(code: String) -> Result<(), String> {
    let normalized = code.trim().replace('"', "");
    if normalized.is_empty() {
        return Err("Epic authorization code is empty".to_string());
    }

    let session = EpicApi::new()?.login_with_auth_code(&normalized).await?;
    epic_api::save_session(&session)
}

#[tauri::command]
pub async fn epic_login_with_webview(app: tauri::AppHandle) -> Result<(), String> {
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

#[tauri::command]
pub async fn epic_try_restore_session() -> Result<bool, String> {
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

#[tauri::command]
pub async fn epic_is_logged_in() -> Result<bool, String> {
    Ok(epic_api::load_session().is_some())
}

#[tauri::command]
pub async fn epic_get_login_status() -> Result<EpicLoginStatus, String> {
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

#[tauri::command]
pub async fn epic_logout() -> Result<(), String> {
    epic_api::clear_session()
}
