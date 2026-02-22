#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]
// アプリ起動エントリ。トレイ常駐と自動起動フローをここで束ねる。

mod commands;
mod services;
mod utils;

use std::ffi::OsStr;
use std::sync::{
    atomic::{AtomicBool, AtomicU64, Ordering},
    mpsc, Arc, Mutex,
};
use std::time::{Duration, Instant};
use tauri::{
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager, PhysicalPosition, Position, RunEvent, WebviewUrl, WebviewWindowBuilder,
};
use utils::mod_profile;

const TRAY_ID: &str = "main-tray";
const TRAY_MENU_WINDOW_LABEL: &str = "tray-menu";
const TRAY_MENU_WINDOW_WIDTH: f64 = 176.0;
const TRAY_MENU_WINDOW_HEIGHT: f64 = 132.0;
const TRAY_MENU_WINDOW_MARGIN: i32 = 6;
const TRAY_MENU_CURSOR_POLL_MS: u64 = 16;
const TRAY_MENU_CURSOR_LEAVE_CLOSE_DELAY_MS: u64 = 300;
const TRAY_MENU_INDICATOR_SAFE_HALF_WIDTH: f64 = 130.0;
const TRAY_MENU_INDICATOR_SAFE_HALF_HEIGHT: f64 = 72.0;
// Keep the hidden webview alive for 30 minutes so short tray sessions do not
// repeatedly pay window teardown/startup costs, while still eventually freeing memory.
const TRAY_WEBVIEW_KEEPALIVE_MS: u64 = 30 * 60 * 1000;

#[derive(Debug)]
struct TrayWebviewDestroyState {
    generation: AtomicU64,
    pending_cancel_tx: Mutex<Option<mpsc::Sender<()>>>,
}

impl TrayWebviewDestroyState {
    fn new() -> Self {
        // 生成番号は遅延破棄タスクの世代管理に使う。
        Self {
            generation: AtomicU64::new(0),
            pending_cancel_tx: Mutex::new(None),
        }
    }

    fn cancel_pending(&self) {
        // 最新世代へ進めることで、過去に予約した破棄処理を無効化する。
        self.generation.fetch_add(1, Ordering::SeqCst);
        if let Ok(mut guard) = self.pending_cancel_tx.lock() {
            if let Some(cancel_tx) = guard.take() {
                let _ = cancel_tx.send(());
            }
        }
    }

    fn schedule_destroy<R: tauri::Runtime + 'static>(self: &Arc<Self>, app: AppHandle<R>) {
        // 現在世代に紐づく破棄予約を作成し、一定時間後に実行判定する。
        let generation = self.generation.fetch_add(1, Ordering::SeqCst) + 1;
        let (cancel_tx, cancel_rx) = mpsc::channel::<()>();

        if let Ok(mut guard) = self.pending_cancel_tx.lock() {
            if let Some(previous_cancel_tx) = guard.replace(cancel_tx) {
                let _ = previous_cancel_tx.send(());
            }
        } else {
            return;
        }

        let state = self.clone();
        std::thread::spawn(move || {
            match cancel_rx.recv_timeout(Duration::from_millis(TRAY_WEBVIEW_KEEPALIVE_MS)) {
                Ok(()) | Err(mpsc::RecvTimeoutError::Disconnected) => return,
                Err(mpsc::RecvTimeoutError::Timeout) => {}
            }
            if state.generation.load(Ordering::SeqCst) != generation {
                return;
            }

            if let Ok(mut guard) = state.pending_cancel_tx.lock() {
                if state.generation.load(Ordering::SeqCst) == generation {
                    guard.take();
                }
            }

            let should_destroy = match crate::utils::settings::load_or_init_settings(&app) {
                Ok(settings) => {
                    settings.close_to_tray_on_close && settings.close_webview_on_tray_background
                }
                Err(_) => true,
            };
            if !should_destroy {
                return;
            }

            if let Some(window) = app.get_webview_window("main") {
                if matches!(window.is_visible(), Ok(false)) {
                    let _ = window.destroy();
                }
            }
        });
    }
}

fn resolve_ui_locale<R: tauri::Runtime>(app: &AppHandle<R>) -> String {
    crate::utils::settings::load_or_init_settings(app)
        .map(|settings| settings.ui_locale)
        .unwrap_or_else(|_| "ja".to_string())
}

pub(crate) fn hide_tray_menu_window<R: tauri::Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window(TRAY_MENU_WINDOW_LABEL) {
        let _ = window.hide();
    }
}

fn ensure_tray_menu_window<R: tauri::Runtime>(
    app: &AppHandle<R>,
) -> Option<tauri::WebviewWindow<R>> {
    if let Some(window) = app.get_webview_window(TRAY_MENU_WINDOW_LABEL) {
        return Some(window);
    }

    let locale = resolve_ui_locale(app);
    let version = app.package_info().version.to_string();
    let short_name = mod_profile::get().mod_info.short_name.clone();
    let url = format!(
        "index.html?tray-menu=1&locale={}&version={}&shortName={}",
        urlencoding::encode(&locale),
        urlencoding::encode(&version),
        urlencoding::encode(&short_name)
    );
    let window =
        WebviewWindowBuilder::new(app, TRAY_MENU_WINDOW_LABEL, WebviewUrl::App(url.into()))
            .title("tray-menu")
            .inner_size(TRAY_MENU_WINDOW_WIDTH, TRAY_MENU_WINDOW_HEIGHT)
            .resizable(false)
            .maximizable(false)
            .minimizable(false)
            .closable(false)
            .decorations(false)
            .transparent(true)
            .always_on_top(true)
            .skip_taskbar(true)
            .shadow(false)
            .focusable(true)
            .visible(false)
            .build()
            .ok()?;

    Some(window)
}

fn show_tray_menu_window<R: tauri::Runtime>(app: &AppHandle<R>, position: PhysicalPosition<f64>) {
    let Some(window) = ensure_tray_menu_window(app) else {
        return;
    };

    let mut x = (position.x.round() as i32) - (TRAY_MENU_WINDOW_WIDTH as i32) / 2;
    let mut y =
        (position.y.round() as i32) - (TRAY_MENU_WINDOW_HEIGHT as i32) - TRAY_MENU_WINDOW_MARGIN;

    if let Ok(Some(monitor)) = window.current_monitor() {
        let monitor_pos = monitor.position();
        let monitor_size = monitor.size();
        let max_x = monitor_pos.x + monitor_size.width as i32 - TRAY_MENU_WINDOW_WIDTH as i32;
        let max_y = monitor_pos.y + monitor_size.height as i32 - TRAY_MENU_WINDOW_HEIGHT as i32;
        x = x.clamp(monitor_pos.x, max_x.max(monitor_pos.x));
        y = y.clamp(monitor_pos.y, max_y.max(monitor_pos.y));
    }

    let _ = window.set_position(Position::Physical(PhysicalPosition::new(x, y)));
    let _ = window.show();
    let _ = window.set_focus();
    start_tray_menu_cursor_leave_watcher(app.clone(), position);
}

fn is_tray_menu_visible<R: tauri::Runtime>(app: &AppHandle<R>) -> bool {
    let Some(window) = app.get_webview_window(TRAY_MENU_WINDOW_LABEL) else {
        return false;
    };
    matches!(window.is_visible(), Ok(true))
}

fn is_cursor_inside_window<R: tauri::Runtime>(
    cursor_pos: &PhysicalPosition<f64>,
    window: &tauri::WebviewWindow<R>,
) -> bool {
    let Ok(window_pos) = window.outer_position() else {
        return false;
    };
    let Ok(window_size) = window.outer_size() else {
        return false;
    };

    let left = f64::from(window_pos.x);
    let top = f64::from(window_pos.y);
    let right = left + f64::from(window_size.width);
    let bottom = top + f64::from(window_size.height);
    cursor_pos.x >= left && cursor_pos.x < right && cursor_pos.y >= top && cursor_pos.y < bottom
}

fn is_cursor_inside_indicator_safe_zone(
    cursor_pos: &PhysicalPosition<f64>,
    indicator_anchor: &PhysicalPosition<f64>,
) -> bool {
    let left = indicator_anchor.x - TRAY_MENU_INDICATOR_SAFE_HALF_WIDTH;
    let right = indicator_anchor.x + TRAY_MENU_INDICATOR_SAFE_HALF_WIDTH;
    let top = indicator_anchor.y - TRAY_MENU_INDICATOR_SAFE_HALF_HEIGHT;
    let bottom = indicator_anchor.y + TRAY_MENU_INDICATOR_SAFE_HALF_HEIGHT;
    cursor_pos.x >= left && cursor_pos.x <= right && cursor_pos.y >= top && cursor_pos.y <= bottom
}

fn start_tray_menu_cursor_leave_watcher<R: tauri::Runtime + 'static>(
    app: AppHandle<R>,
    indicator_anchor: PhysicalPosition<f64>,
) {
    std::thread::spawn(move || {
        let mut outside_since: Option<Instant> = None;
        loop {
            std::thread::sleep(Duration::from_millis(TRAY_MENU_CURSOR_POLL_MS));

            let Some(window) = app.get_webview_window(TRAY_MENU_WINDOW_LABEL) else {
                break;
            };
            if !matches!(window.is_visible(), Ok(true)) {
                break;
            }

            let Ok(cursor_pos) = app.cursor_position() else {
                continue;
            };

            let is_inside_menu = is_cursor_inside_window(&cursor_pos, &window);
            let is_inside_indicator =
                is_cursor_inside_indicator_safe_zone(&cursor_pos, &indicator_anchor);
            if is_inside_menu || is_inside_indicator {
                outside_since = None;
                continue;
            }

            match outside_since {
                Some(started_at)
                    if started_at.elapsed()
                        >= Duration::from_millis(TRAY_MENU_CURSOR_LEAVE_CLOSE_DELAY_MS) =>
                {
                    let _ = window.hide();
                    break;
                }
                Some(_) => {}
                None => {
                    outside_since = Some(Instant::now());
                }
            }
        }
    });
}

fn args_contain_autolaunch_modded<I, S>(args: I) -> bool
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    // single-instance 経由で渡された引数群から自動起動フラグのみ検出する。
    args.into_iter()
        .any(|arg| arg.as_ref() == commands::launch::AUTOLAUNCH_MODDED_ARGUMENT)
}

fn should_auto_launch_modded() -> bool {
    std::env::args_os().any(|arg| arg == OsStr::new(commands::launch::AUTOLAUNCH_MODDED_ARGUMENT))
}

fn start_modded_autolaunch<R: tauri::Runtime>(
    app_handle: AppHandle<R>,
    bypass_close_to_tray: Arc<AtomicBool>,
    tray_webview_destroy_state: Arc<TrayWebviewDestroyState>,
    exit_on_success: bool,
) {
    // 新しい自動起動試行の前に、前回エラーを消して状態を初期化する。
    commands::launch::clear_autolaunch_error();
    tauri::async_runtime::spawn(async move {
        match commands::launch::launch_modded_from_saved_settings(app_handle.clone()).await {
            Ok(()) => {
                if exit_on_success {
                    bypass_close_to_tray.store(true, Ordering::SeqCst);
                    app_handle.exit(0);
                }
            }
            Err(error) => {
                commands::launch::set_autolaunch_error(error);
                show_main_window(&app_handle, &tray_webview_destroy_state);
            }
        }
    });
}

pub(crate) fn create_main_window<R: tauri::Runtime>(
    app: &AppHandle<R>,
) -> Option<tauri::WebviewWindow<R>> {
    let window_config = app
        .config()
        .app
        .windows
        .iter()
        .find(|window| window.label == "main")?;
    let builder = WebviewWindowBuilder::from_config(app, window_config).ok()?;
    builder.build().ok()
}

pub(crate) fn get_or_create_main_window<R: tauri::Runtime>(
    app: &AppHandle<R>,
) -> Option<tauri::WebviewWindow<R>> {
    app.get_webview_window("main")
        .or_else(|| create_main_window(app))
}

pub(crate) fn show_main_window_now<R: tauri::Runtime>(app: &AppHandle<R>) {
    if let Some(window) = get_or_create_main_window(app) {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn show_main_window<R: tauri::Runtime>(
    app: &AppHandle<R>,
    tray_webview_destroy_state: &Arc<TrayWebviewDestroyState>,
) {
    hide_tray_menu_window(app);
    tray_webview_destroy_state.cancel_pending();
    show_main_window_now(app);
}

fn setup_tray<R: tauri::Runtime>(
    app: &AppHandle<R>,
    tray_webview_destroy_state: Arc<TrayWebviewDestroyState>,
) -> tauri::Result<()> {
    // トレイアイコンを初期化する。
    let mod_profile = mod_profile::get();

    let tray_webview_destroy_state_for_tray = tray_webview_destroy_state.clone();
    let mut tray_builder = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip(mod_profile.branding.tray_tooltip.clone())
        .on_tray_icon_event(move |tray, event| match event {
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Down,
                ..
            } => {
                hide_tray_menu_window(tray.app_handle());
                tray_webview_destroy_state_for_tray.cancel_pending();
                let _ = get_or_create_main_window(tray.app_handle());
            }
            TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } => {
                hide_tray_menu_window(tray.app_handle());
                show_main_window(tray.app_handle(), &tray_webview_destroy_state_for_tray);
            }
            TrayIconEvent::Click {
                button: MouseButton::Right,
                button_state: MouseButtonState::Up,
                position,
                ..
            } => {
                tray_webview_destroy_state_for_tray.cancel_pending();
                if is_tray_menu_visible(tray.app_handle()) {
                    hide_tray_menu_window(tray.app_handle());
                } else {
                    show_tray_menu_window(tray.app_handle(), position);
                }
            }
            _ => {}
        });

    if let Some(icon) = app.default_window_icon() {
        tray_builder = tray_builder.icon(icon.clone());
    }

    tray_builder.build(app)?;
    // 初回右クリック時の体感遅延を減らすため、メニューWebViewを先行生成しておく。
    let _ = ensure_tray_menu_window(app);
    hide_tray_menu_window(app);

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // 起動引数と共有状態を先に確定し、後続クロージャで再利用する。
    let auto_launch_modded = should_auto_launch_modded();
    let bypass_close_to_tray = Arc::new(AtomicBool::new(false));
    let bypass_close_to_tray_for_single_instance = bypass_close_to_tray.clone();
    let bypass_close_to_tray_for_window = bypass_close_to_tray.clone();
    let bypass_close_to_tray_for_exit = bypass_close_to_tray.clone();
    let tray_webview_destroy_state = Arc::new(TrayWebviewDestroyState::new());
    let tray_webview_destroy_state_for_single_instance = tray_webview_destroy_state.clone();
    let tray_webview_destroy_state_for_window = tray_webview_destroy_state.clone();
    let tray_webview_destroy_state_for_setup = tray_webview_destroy_state.clone();
    let tray_webview_destroy_state_for_autolaunch = tray_webview_destroy_state.clone();

    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(
            move |app, args, _cwd| {
                if args_contain_autolaunch_modded(args) {
                    start_modded_autolaunch(
                        app.clone(),
                        bypass_close_to_tray_for_single_instance.clone(),
                        tray_webview_destroy_state_for_single_instance.clone(),
                        false,
                    );
                    return;
                }

                show_main_window(app, &tray_webview_destroy_state_for_single_instance);
            },
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .on_window_event(move |window, event| {
            if window.label() == TRAY_MENU_WINDOW_LABEL {
                match event {
                    tauri::WindowEvent::CloseRequested { .. } => {
                        hide_tray_menu_window(window.app_handle());
                    }
                    _ => {}
                }
                return;
            }

            if window.label() != "main" {
                return;
            }

            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if bypass_close_to_tray_for_window.load(Ordering::SeqCst) {
                    return;
                }

                let close_to_tray =
                    match crate::utils::settings::load_or_init_settings(window.app_handle()) {
                        // 設定読み込み失敗時は安全側としてトレイ遷移+webview解放を既定にする。
                        Ok(settings) => (
                            settings.close_to_tray_on_close,
                            settings.close_webview_on_tray_background,
                        ),
                        Err(_) => (true, true),
                    };

                if close_to_tray.0 {
                    api.prevent_close();
                    let _ = window.hide();
                    if close_to_tray.1 {
                        tray_webview_destroy_state_for_window
                            .schedule_destroy(window.app_handle().clone());
                    } else {
                        tray_webview_destroy_state_for_window.cancel_pending();
                    }
                }
            }
        })
        .setup(move |app| {
            crate::utils::mod_profile::validate().map_err(
                |error| -> Box<dyn std::error::Error> { Box::new(std::io::Error::other(error)) },
            )?;
            setup_tray(app.handle(), tray_webview_destroy_state_for_setup.clone())?;
            crate::utils::background_notifications::start_worker(app.handle().clone());

            if auto_launch_modded {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }

                start_modded_autolaunch(
                    app.handle().clone(),
                    bypass_close_to_tray.clone(),
                    tray_webview_destroy_state_for_autolaunch.clone(),
                    true,
                );
            } else {
                show_main_window(app.handle(), &tray_webview_destroy_state_for_setup);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings::settings_get,
            commands::settings::settings_update,
            commands::settings::settings_profile_ready,
            commands::settings::settings_open_folder,
            commands::migration::migration_export,
            commands::migration::migration_import,
            commands::migration::migration_validate_archive_password,
            commands::presets::presets_list_local,
            commands::presets::presets_export,
            commands::presets::presets_inspect_archive,
            commands::presets::presets_import_archive,
            commands::finder::finder_detect_among_us,
            commands::finder::finder_detect_platform,
            commands::finder::finder_detect_platforms,
            commands::snr::mod_releases_list,
            commands::snr::mod_install,
            commands::snr::mod_uninstall,
            commands::snr::mod_preserved_save_data_status,
            commands::snr::mod_savedata_preview,
            commands::snr::mod_savedata_import,
            commands::snr::mod_savedata_merge_presets,
            commands::snr::mod_preserved_savedata_merge_presets,
            commands::snr::snr_releases_list,
            commands::snr::snr_install,
            commands::snr::snr_uninstall,
            commands::snr::snr_preserved_save_data_status,
            commands::snr::snr_savedata_preview,
            commands::snr::snr_savedata_import,
            commands::snr::snr_savedata_merge_presets,
            commands::snr::snr_preserved_savedata_merge_presets,
            commands::reporting::reporting_prepare,
            commands::reporting::reporting_threads_list,
            commands::reporting::reporting_messages_list,
            commands::reporting::reporting_message_send,
            commands::reporting::reporting_report_send,
            commands::reporting::reporting_notification_flag_get,
            commands::reporting::reporting_log_source_get,
            commands::notifications::notifications_take_open_target,
            commands::game_servers::game_servers_join_direct,
            commands::launch::launch_modded,
            commands::launch::launch_vanilla,
            commands::launch::launch_shortcut_create,
            commands::launch::launch_modded_first_setup_pending,
            commands::launch::launch_autolaunch_error_take,
            commands::launch::launch_game_running_get,
            commands::tray::tray_launch_modded,
            commands::tray::tray_show_main_window,
            commands::tray::tray_exit_app,
            commands::epic_commands::epic_auth_url_get,
            commands::epic_commands::epic_login_code,
            commands::epic_commands::epic_login_webview,
            commands::epic_commands::epic_session_restore,
            commands::epic_commands::epic_logged_in_get,
            commands::epic_commands::epic_status_get,
            commands::epic_commands::epic_logout,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    app.run(move |app_handle, event| {
        if let RunEvent::ExitRequested { api, code, .. } = event {
            // 明示終了(codeあり)か終了バイパス時は、通常終了フローをそのまま通す。
            if code.is_some() || bypass_close_to_tray_for_exit.load(Ordering::SeqCst) {
                return;
            }

            // No windows + close-to-tray + close-webview mode means this exit was caused
            // by destroying the main window, so keep the tray process alive.
            if app_handle.get_webview_window("main").is_none() {
                let keep_alive_without_window =
                    match crate::utils::settings::load_or_init_settings(app_handle) {
                        Ok(settings) => {
                            settings.close_to_tray_on_close
                                && settings.close_webview_on_tray_background
                        }
                        Err(_) => true,
                    };
                if keep_alive_without_window {
                    api.prevent_exit();
                }
            }
        }
    });
}

fn main() {
    run();
}
