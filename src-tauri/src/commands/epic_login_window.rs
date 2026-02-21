// Epic OAuthログイン用の専用WebViewウィンドウを管理する。
use crate::utils::epic_api::EpicApi;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use tauri::{webview::PageLoadEvent, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

type SuccessCallback = Arc<Mutex<Option<Box<dyn FnOnce() + Send>>>>;
type ErrorCallback = Arc<Mutex<Option<Box<dyn FnOnce(String) + Send>>>>;

const EPIC_LOGIN_WINDOW: &str = "epic-login";
const EPIC_REDIRECT_PATH: &str = "/id/api/redirect";
const CALLBACK_SCHEME: &str = "snrlauncher";

const EXTRACT_CODE_JS: &str = r#"
(function() {
  if (window.__SNR_EXTRACTED__) return;
  window.__SNR_EXTRACTED__ = true;
  try {
    const bodyText = document.body.innerText;
    if (!bodyText.includes("authorizationCode")) return;
    const json = JSON.parse(bodyText);
    if (json.authorizationCode) {
      location.href = 'snrlauncher://auth?code=' + encodeURIComponent(json.authorizationCode);
    }
  } catch (_) {}
})();
"#;

pub struct EpicLoginWindow;

impl EpicLoginWindow {
    pub fn open(
        app: &tauri::AppHandle,
        on_success: impl FnOnce() + Send + 'static,
        on_error: impl FnOnce(String) + Send + 'static,
        on_cancel: impl FnOnce() + Send + 'static,
    ) -> Result<(), String> {
        // 多重コールバックを防ぐため、認証完了フラグを最初に用意する。
        let handled = Arc::new(AtomicBool::new(false));

        let auth_url: url::Url = EpicApi::get_auth_url()
            .parse()
            .map_err(|e| format!("Invalid Epic auth URL: {e}"))?;

        let app_for_navigation = app.clone();
        let handled_for_navigation = handled.clone();

        let on_success: SuccessCallback = Arc::new(Mutex::new(Some(Box::new(on_success))));
        let on_error: ErrorCallback = Arc::new(Mutex::new(Some(Box::new(on_error))));
        let on_cancel: SuccessCallback = Arc::new(Mutex::new(Some(Box::new(on_cancel))));

        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| format!("Failed to resolve app data path: {e}"))?
            .join("cache");

        let window =
            WebviewWindowBuilder::new(app, EPIC_LOGIN_WINDOW, WebviewUrl::External(auth_url))
                .title("Login to Epic Games")
                .inner_size(500.0, 700.0)
                .resizable(true)
                .center()
                .data_directory(data_dir)
                .on_page_load(|webview, payload| {
                    if payload.event() == PageLoadEvent::Finished {
                        if let Ok(url) = webview.url() {
                            if url.path() == EPIC_REDIRECT_PATH {
                                let _ = webview.eval(EXTRACT_CODE_JS);
                            }
                        }
                    }
                })
                .on_navigation(move |url| {
                    if url.scheme() != CALLBACK_SCHEME {
                        return true;
                    }

                    // 同一コールバックが複数回発火しても、最初の1回だけを採用する。
                    if handled_for_navigation.swap(true, Ordering::SeqCst) {
                        return false;
                    }

                    let app = app_for_navigation.clone();
                    if let Some(code) = Self::extract_code_param(url) {
                        // 認証コード交換は spawn された非同期タスク内で実施し、完了後にそのタスク内で必ずウィンドウを閉じる。
                        let on_success = on_success.clone();
                        let on_error = on_error.clone();
                        tauri::async_runtime::spawn(async move {
                            let result = Self::do_login(&code).await;
                            Self::handle_auth_result(&app, result, on_success, on_error);
                            Self::close_window(&app);
                        });
                    } else {
                        let _ = app.emit(
                            "epic-login-error",
                            "Missing authorization code in callback".to_string(),
                        );
                        Self::close_window(&app);
                    }
                    false
                })
                .build()
                .map_err(|e| format!("Failed to create Epic login window: {e}"))?;

        window.on_window_event(move |event| {
            if matches!(event, tauri::WindowEvent::CloseRequested { .. })
                && !handled.load(Ordering::SeqCst)
            {
                if let Some(cancel_callback) = on_cancel.lock().ok().and_then(|mut cb| cb.take()) {
                    cancel_callback();
                }
            }
        });

        Ok(())
    }

    fn extract_code_param(url: &url::Url) -> Option<String> {
        // コールバックURLの query から code パラメータだけを抽出する。
        url.query_pairs()
            .find(|(key, _)| key == "code")
            .map(|(_, value)| value.into_owned())
    }

    async fn do_login(code: &str) -> Result<(), String> {
        // 認証コード入力の表記ゆれを吸収してからAPIに渡す。
        let normalized = code.trim().replace('"', "");
        let session = EpicApi::new()?.login_with_auth_code(&normalized).await?;
        crate::utils::epic_api::save_session(&session)
    }

    fn handle_auth_result(
        app: &tauri::AppHandle,
        result: Result<(), String>,
        on_success: SuccessCallback,
        on_error: ErrorCallback,
    ) {
        match result {
            Ok(()) => {
                // UIイベント発火後に外部コールバックを一度だけ実行する。
                let _ = app.emit("epic-login-success", ());
                if let Some(success_callback) = on_success.lock().ok().and_then(|mut cb| cb.take())
                {
                    success_callback();
                }
            }
            Err(error) => {
                // 失敗理由をイベントとコールバックの双方へ渡す。
                let _ = app.emit("epic-login-error", error.clone());
                if let Some(error_callback) = on_error.lock().ok().and_then(|mut cb| cb.take()) {
                    error_callback(error);
                }
            }
        }
    }

    fn close_window(app: &tauri::AppHandle) {
        // 既に閉じられている場合でも安全に無視できる。
        if let Some(window) = app.get_webview_window(EPIC_LOGIN_WINDOW) {
            let _ = window.close();
        }
    }
}
