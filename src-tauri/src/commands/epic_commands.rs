// Epicログイン機能をフロントへ公開するTauriコマンド群。
use tauri::Emitter;

use crate::commands::epic_login_window::EpicLoginWindow;
use crate::utils::{
    epic_api::{self, EpicApi},
    mod_profile,
};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EpicLoginStatus {
    pub logged_in: bool,
    pub account_id: Option<String>,
    pub display_name: Option<String>,
    pub profile_error: Option<String>,
}

fn ensure_epic_login_enabled() -> Result<(), String> {
    // 設定で機能が無効な場合は、共通エラーで早期に処理を止める。
    mod_profile::ensure_feature_enabled(mod_profile::Feature::EpicLogin)
}

/// Epic認証URLを返す（将来拡張用）。
#[tauri::command]
pub fn epic_auth_url_get() -> Result<String, String> {
    // クライアントID等はAPI層に閉じ、ここではURL文字列だけを返す。
    ensure_epic_login_enabled()?;
    Ok(EpicApi::get_auth_url())
}

/// 認証コードでEpicログインを行う。
#[tauri::command]
pub async fn epic_login_code(code: String) -> Result<(), String> {
    ensure_epic_login_enabled()?;
    // コピーペースト由来の余分な引用符を取り除いてから認証に渡す。
    let normalized = code.trim().replace('"', "");
    if normalized.is_empty() {
        return Err("Epic authorization code is empty".to_string());
    }

    // 認証成功時点で取得したセッションを永続化し、次回起動でも再利用可能にする。
    let session = EpicApi::new()?.login_with_auth_code(&normalized).await?;
    epic_api::save_session(&session)
}

/// WebViewでEpicログインを開始する。
#[tauri::command]
pub async fn epic_login_webview(app: tauri::AppHandle) -> Result<(), String> {
    ensure_epic_login_enabled()?;
    // コールバックごとにハンドルを分け、各イベントを独立して通知する。
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
    ensure_epic_login_enabled()?;
    let Some(saved_session) = epic_api::load_session() else {
        // 保存セッションがなければ未ログイン扱いで正常終了する。
        return Ok(false);
    };

    // 既存のリフレッシュトークンで再認証し、成功時のみセッションを更新する。
    match EpicApi::new()?
        .refresh_session(&saved_session.refresh_token)
        .await
    {
        Ok(session) => {
            epic_api::save_session(&session)?;
            Ok(true)
        }
        // 期限切れなどの復元失敗は致命扱いせず、再ログイン導線のため false を返す。
        Err(_) => Ok(false),
    }
}

/// ログイン状態のみを返す簡易API。
#[tauri::command]
pub async fn epic_logged_in_get() -> Result<bool, String> {
    ensure_epic_login_enabled()?;
    Ok(epic_api::load_session().is_some())
}

/// ログイン状態詳細を返す。
#[tauri::command]
pub async fn epic_status_get() -> Result<EpicLoginStatus, String> {
    ensure_epic_login_enabled()?;
    let Some(session) = epic_api::load_session() else {
        // 画面側で分岐しやすいよう、未ログイン時も同一構造体で返す。
        return Ok(EpicLoginStatus {
            logged_in: false,
            account_id: None,
            display_name: None,
            profile_error: None,
        });
    };

    // 空白だけの表示名は未設定として扱い、UI表示のノイズを減らす。
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
    ensure_epic_login_enabled()?;
    epic_api::clear_session()
}
