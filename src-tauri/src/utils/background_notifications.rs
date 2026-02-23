// バックグラウンドで通知状態を監視し、必要時のみOS通知を出す。
use std::collections::HashSet;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

use reqwest::Client;
use serde::{Deserialize, Serialize};
#[cfg(target_os = "windows")]
use tauri::Emitter;
use tauri::{AppHandle, Manager, Runtime};

use crate::utils::{mod_profile, reporting_api, settings};

#[cfg(target_os = "windows")]
pub const BACKGROUND_NOTIFICATION_OPEN_EVENT: &str = "background-notification-open";

const REPORT_POLL_INTERVAL: Duration = Duration::from_secs(20);
const ANNOUNCE_POLL_INTERVAL: Duration = Duration::from_secs(60);
const WORKER_TICK_INTERVAL: Duration = Duration::from_secs(1);
const MAX_REPORT_NOTIFICATIONS_PER_POLL: usize = 3;
const ANNOUNCE_PREVIEW_CHARS: usize = 60;
const REPORT_KNOWN_MESSAGE_LIMIT: usize = 10_000;
const ANNOUNCE_KNOWN_ARTICLE_LIMIT: usize = 2_000;

static PENDING_OPEN_TARGET: OnceLock<Mutex<Option<NotificationOpenTarget>>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum NotificationOpenTarget {
    Report {
        #[serde(rename = "threadId")]
        thread_id: String,
    },
    Announce {
        #[serde(rename = "articleId")]
        article_id: String,
    },
}

#[derive(Debug, Clone)]
struct ReportNotificationItem {
    thread_id: String,
    thread_title: String,
    message_type: String,
    message_key: String,
    content: String,
}

#[derive(Debug, Default)]
struct ReportPollingState {
    enabled_last_tick: bool,
    baseline_ready: bool,
    known_message_keys: HashSet<String>,
}

impl ReportPollingState {
    fn disable(&mut self) {
        // 無効化時は次回有効化で基準再構築できるよう状態を初期化する。
        self.enabled_last_tick = false;
        self.baseline_ready = false;
        self.known_message_keys.clear();
    }

    fn handle_enable_transition(&mut self) {
        if self.enabled_last_tick {
            return;
        }
        // 有効化直後は初回差分通知を避けるため、ベースライン未確定に戻す。
        self.enabled_last_tick = true;
        self.baseline_ready = false;
        self.known_message_keys.clear();
    }
}

#[derive(Debug, Clone, Deserialize)]
struct AnnounceArticleListResponse {
    #[serde(default)]
    items: Vec<AnnounceArticleMinimal>,
}

#[derive(Debug, Clone, Deserialize)]
struct AnnounceArticleMinimal {
    #[serde(default)]
    id: String,
    #[serde(default)]
    title: String,
}

#[derive(Debug, Clone, Deserialize)]
struct AnnounceArticleDetail {
    #[serde(default)]
    body: String,
}

#[derive(Debug, Default)]
struct AnnouncePollingState {
    enabled_last_tick: bool,
    baseline_ready: bool,
    known_article_ids: HashSet<String>,
}

impl AnnouncePollingState {
    fn disable(&mut self) {
        // 無効化時は既知IDを破棄し、再有効化時に基準を作り直す。
        self.enabled_last_tick = false;
        self.baseline_ready = false;
        self.known_article_ids.clear();
    }

    fn handle_enable_transition(&mut self) {
        if self.enabled_last_tick {
            return;
        }
        // 有効化直後は差分通知を出さないよう、初回取得をベースライン扱いにする。
        self.enabled_last_tick = true;
        self.baseline_ready = false;
        self.known_article_ids.clear();
    }
}

#[derive(Debug, Default)]
struct BackgroundNotificationWorker {
    report: ReportPollingState,
    announce: AnnouncePollingState,
    announce_client: Option<Client>,
}

impl BackgroundNotificationWorker {
    fn poll_report<R: Runtime + 'static>(
        &mut self,
        app: &AppHandle<R>,
        enabled: bool,
        locale: &str,
        suppress_notifications: bool,
    ) {
        // 機能フラグまたは設定で無効なら、保持状態をクリアして終了する。
        if !mod_profile::feature_enabled(mod_profile::Feature::Reporting) {
            self.report.disable();
            return;
        }

        if !enabled {
            self.report.disable();
            return;
        }

        self.report.handle_enable_transition();

        let notification_state =
            match tauri::async_runtime::block_on(reporting_api::get_notifications(app)) {
                Ok(state) => state,
                Err(error) => {
                    eprintln!(
                    "[background-notifications] failed to fetch reporting notifications: {error}"
                );
                    return;
                }
            };

        let mut discovered_items = Vec::new();
        for thread in notification_state.threads {
            let thread_id = thread.thread_id.trim().to_string();
            if thread_id.is_empty() {
                continue;
            }
            let thread_title = if thread.thread_name.trim().is_empty() {
                "(untitled)".to_string()
            } else {
                thread.thread_name.trim().to_string()
            };

            let message_key = report_latest_message_key(
                &thread_id,
                &thread.latest_message,
                &thread.latest_message_id,
                &thread.latest_message_created_at,
            );
            if message_key.is_empty() {
                continue;
            }

            discovered_items.push(ReportNotificationItem {
                thread_id,
                thread_title,
                message_type: thread.latest_message_type,
                message_key,
                content: thread.latest_message,
            });
        }

        if !self.report.baseline_ready {
            for item in discovered_items {
                self.report.known_message_keys.insert(item.message_key);
            }
            self.report.baseline_ready = true;
            return;
        }

        let mut new_items = Vec::new();
        for item in discovered_items {
            if !self.report.known_message_keys.contains(&item.message_key) {
                new_items.push(item.clone());
            }
            self.report.known_message_keys.insert(item.message_key);
        }

        if self.report.known_message_keys.len() > REPORT_KNOWN_MESSAGE_LIMIT {
            self.report.baseline_ready = false;
            self.report.known_message_keys.clear();
        }

        if suppress_notifications || new_items.is_empty() {
            return;
        }

        let launcher_name = &mod_profile::get().branding.launcher_name;

        for item in new_items.iter().take(MAX_REPORT_NOTIFICATIONS_PER_POLL) {
            let content = condense_whitespace(&item.content);
            let body = report_notification_body(&item.message_type, &content, locale);
            show_background_notification(
                app,
                &format!("{launcher_name} - {}", item.thread_title),
                &body,
                NotificationOpenTarget::Report {
                    thread_id: item.thread_id.clone(),
                },
            );
        }

        if new_items.len() > MAX_REPORT_NOTIFICATIONS_PER_POLL {
            let remaining = new_items.len() - MAX_REPORT_NOTIFICATIONS_PER_POLL;
            if let Some(first_item) = new_items.first() {
                show_background_notification(
                    app,
                    &format!("{launcher_name} - Report Center"),
                    &format!("{remaining} additional new message(s)."),
                    NotificationOpenTarget::Report {
                        thread_id: first_item.thread_id.clone(),
                    },
                );
            }
        }
    }

    fn poll_announce<R: Runtime + 'static>(
        &mut self,
        app: &AppHandle<R>,
        enabled: bool,
        locale: &str,
        suppress_notifications: bool,
    ) {
        if !mod_profile::feature_enabled(mod_profile::Feature::Announce) {
            self.announce.disable();
            return;
        }

        if !enabled {
            self.announce.disable();
            return;
        }

        self.announce.handle_enable_transition();
        if self.announce_client.is_none() {
            self.announce_client = build_announce_client();
        }
        let Some(client) = self.announce_client.as_ref() else {
            return;
        };

        let items = match tauri::async_runtime::block_on(fetch_announce_list(client, locale)) {
            Ok(items) => items,
            Err(error) => {
                eprintln!("[background-notifications] failed to fetch announce list: {error}");
                return;
            }
        };

        if !self.announce.baseline_ready {
            for item in items {
                if !item.id.trim().is_empty() {
                    self.announce
                        .known_article_ids
                        .insert(item.id.trim().to_string());
                }
            }
            self.announce.baseline_ready = true;
            return;
        }

        let mut new_items = Vec::new();
        for item in items {
            let id = item.id.trim();
            if id.is_empty() {
                continue;
            }

            if !self.announce.known_article_ids.contains(id) {
                new_items.push(item.clone());
            }
            self.announce.known_article_ids.insert(id.to_string());
        }

        if self.announce.known_article_ids.len() > ANNOUNCE_KNOWN_ARTICLE_LIMIT {
            self.announce.baseline_ready = false;
            self.announce.known_article_ids.clear();
        }

        if suppress_notifications || new_items.is_empty() {
            return;
        }

        let launcher_name = &mod_profile::get().branding.launcher_name;
        for item in new_items {
            let body = match tauri::async_runtime::block_on(fetch_announce_preview(
                client, locale, &item.id,
            )) {
                Ok(preview) => {
                    if preview.is_empty() {
                        "New announcement available.".to_string()
                    } else {
                        preview
                    }
                }
                Err(error) => {
                    eprintln!(
                        "[background-notifications] failed to fetch announce article '{}': {error}",
                        item.id
                    );
                    "New announcement available.".to_string()
                }
            };

            let title = if item.title.trim().is_empty() {
                format!("{launcher_name} - Announcement")
            } else {
                item.title.trim().to_string()
            };

            show_background_notification(
                app,
                &title,
                &body,
                NotificationOpenTarget::Announce {
                    article_id: item.id.trim().to_string(),
                },
            );
        }
    }
}

pub fn start_worker<R: Runtime + 'static>(app: AppHandle<R>) {
    std::thread::spawn(move || {
        let mut worker = BackgroundNotificationWorker::default();
        let mut next_report_poll = Instant::now();
        let mut next_announce_poll = Instant::now();

        loop {
            // 通知ワーカー単体の panic で常駐機能全体が止まらないように保護する。
            let tick_result = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                let now = Instant::now();
                let should_poll_report = now >= next_report_poll;
                let should_poll_announce = now >= next_announce_poll;

                if should_poll_report || should_poll_announce {
                    let current_settings = settings::load_settings_or_default(&app).ok();
                    let report_enabled = current_settings
                        .as_ref()
                        .map(|s| s.report_notifications_enabled)
                        .unwrap_or(true);
                    let announce_enabled = current_settings
                        .as_ref()
                        .map(|s| s.announce_notifications_enabled)
                        .unwrap_or(true);
                    let locale = current_settings
                        .as_ref()
                        .map(|s| normalize_locale(&s.ui_locale))
                        .unwrap_or("ja");
                    let suppress_notifications = is_main_window_visible(&app);

                    if should_poll_report {
                        worker.poll_report(&app, report_enabled, locale, suppress_notifications);
                        next_report_poll = now + REPORT_POLL_INTERVAL;
                    }
                    if should_poll_announce {
                        worker.poll_announce(
                            &app,
                            announce_enabled,
                            locale,
                            suppress_notifications,
                        );
                        next_announce_poll = now + ANNOUNCE_POLL_INTERVAL;
                    }
                }
            }));
            if tick_result.is_err() {
                eprintln!(
                    "[background-notifications] worker tick panicked; continuing notification loop"
                );
            }

            std::thread::sleep(WORKER_TICK_INTERVAL);
        }
    });
}

pub fn take_pending_open_target() -> Option<NotificationOpenTarget> {
    pending_open_target_storage()
        .lock()
        .ok()
        .and_then(|mut guard| guard.take())
}

fn pending_open_target_storage() -> &'static Mutex<Option<NotificationOpenTarget>> {
    PENDING_OPEN_TARGET.get_or_init(|| Mutex::new(None))
}

#[cfg(target_os = "windows")]
fn set_pending_open_target(target: NotificationOpenTarget) {
    if let Ok(mut guard) = pending_open_target_storage().lock() {
        *guard = Some(target);
    }
}

fn normalize_locale(value: &str) -> &'static str {
    // 通知APIが想定する言語コードに丸め込む。
    if value.trim().eq_ignore_ascii_case("en") {
        "en"
    } else {
        "ja"
    }
}

fn report_latest_message_key(
    thread_id: &str,
    latest_message: &str,
    latest_message_id: &str,
    latest_message_created_at: &str,
) -> String {
    let normalized_thread_id = thread_id.trim();
    if normalized_thread_id.is_empty() {
        return String::new();
    }

    let normalized_message_id = latest_message_id.trim();
    if !normalized_message_id.is_empty() {
        return format!("{normalized_thread_id}:id:{normalized_message_id}");
    }

    let normalized_created_at = latest_message_created_at.trim();
    if !normalized_created_at.is_empty() {
        return format!(
            "{normalized_thread_id}:created:{normalized_created_at}:{}",
            condense_whitespace(latest_message.trim())
        );
    }

    format!(
        "{normalized_thread_id}:body:{}",
        condense_whitespace(latest_message.trim())
    )
}

fn report_notification_body(message_type: &str, content: &str, locale: &str) -> String {
    if content.trim().is_empty() {
        return "New message received.".to_string();
    }

    let normalized = truncate_chars(content, 120);
    if message_type == "status" {
        let status_label = if locale == "en" {
            "Status updated"
        } else {
            "ステータス更新"
        };
        format!("{status_label}: {normalized}")
    } else {
        normalized
    }
}

fn is_main_window_visible<R: Runtime>(app: &AppHandle<R>) -> bool {
    app.get_webview_window("main")
        .and_then(|window| window.is_visible().ok())
        .unwrap_or(false)
}

fn build_announce_client() -> Option<Client> {
    Client::builder()
        .user_agent(format!(
            "{}/{}",
            mod_profile::get().branding.launcher_name,
            env!("CARGO_PKG_VERSION")
        ))
        .build()
        .ok()
}

async fn fetch_announce_list(
    client: &Client,
    locale: &str,
) -> Result<Vec<AnnounceArticleMinimal>, String> {
    let base = mod_profile::get()
        .apis
        .announce_base_url
        .trim_end_matches('/');
    let url = format!(
        "{base}/articles?lang={}&fallback=true&page=1&page_size=20",
        normalize_locale(locale)
    );
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("Failed to request announce list: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Announce list request failed ({status}): {body}"));
    }

    let payload = response
        .json::<AnnounceArticleListResponse>()
        .await
        .map_err(|error| format!("Failed to parse announce list response: {error}"))?;
    Ok(payload.items)
}

async fn fetch_announce_preview(
    client: &Client,
    locale: &str,
    article_id: &str,
) -> Result<String, String> {
    let base = mod_profile::get()
        .apis
        .announce_base_url
        .trim_end_matches('/');
    let url = format!(
        "{base}/articles/{}?lang={}&fallback=true",
        urlencoding::encode(article_id),
        normalize_locale(locale)
    );
    let response = client
        .get(url)
        .send()
        .await
        .map_err(|error| format!("Failed to request announce article: {error}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Announce article request failed ({status}): {body}"
        ));
    }

    let payload = response
        .json::<AnnounceArticleDetail>()
        .await
        .map_err(|error| format!("Failed to parse announce article response: {error}"))?;

    let plain = markdown_to_plain_text(&payload.body);
    Ok(truncate_chars(&plain, ANNOUNCE_PREVIEW_CHARS))
}

fn condense_whitespace(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn markdown_to_plain_text(value: &str) -> String {
    let mut plain = value.replace("\r\n", "\n").replace('\r', "\n");
    let mut normalized_lines = Vec::new();
    for line in plain.lines() {
        let mut current = line.trim_start();
        while let Some(next) = strip_markdown_line_prefix(current) {
            current = next;
        }
        normalized_lines.push(current);
    }
    plain = normalized_lines.join(" ");

    for marker in ["```", "`", "**", "__", "~~"] {
        plain = plain.replace(marker, " ");
    }
    condense_whitespace(&plain)
}

fn strip_markdown_line_prefix(value: &str) -> Option<&str> {
    for marker in [
        "###### ", "##### ", "#### ", "### ", "## ", "# ", "> ", "- ", "* ", "+ ",
    ] {
        if let Some(stripped) = value.strip_prefix(marker) {
            return Some(stripped.trim_start());
        }
    }

    let mut chars = value.chars();
    let mut digit_count = 0usize;
    while let Some(ch) = chars.next() {
        if ch.is_ascii_digit() {
            digit_count += 1;
            continue;
        }

        if ch == '.' && digit_count > 0 {
            let rest = chars.as_str();
            if let Some(stripped) = rest.strip_prefix(' ') {
                return Some(stripped.trim_start());
            }
        }
        break;
    }

    None
}

fn truncate_chars(value: &str, max_chars: usize) -> String {
    value.chars().take(max_chars).collect::<String>()
}

#[cfg(target_os = "windows")]
fn show_background_notification<R: Runtime + 'static>(
    app: &AppHandle<R>,
    title: &str,
    body: &str,
    target: NotificationOpenTarget,
) {
    use tauri_winrt_notification::{Duration, Toast};

    let app_handle = app.clone();
    let click_target = target.clone();
    let app_id = mod_profile::get().branding.identifier.clone();

    let _ = Toast::new(&app_id)
        .title(title)
        .text1(body)
        .duration(Duration::Short)
        .on_activated(move |_| {
            set_pending_open_target(click_target.clone());
            crate::show_main_window_now(&app_handle);
            let _ = app_handle.emit(BACKGROUND_NOTIFICATION_OPEN_EVENT, click_target.clone());
            Ok(())
        })
        .show();
}

#[cfg(not(target_os = "windows"))]
fn show_background_notification<R: Runtime + 'static>(
    _app: &AppHandle<R>,
    _title: &str,
    _body: &str,
    _target: NotificationOpenTarget,
) {
}
