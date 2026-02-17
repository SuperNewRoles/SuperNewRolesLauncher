use aes::Aes256;
use base64::Engine;
use brotli::CompressorWriter;
use cbc::cipher::{block_padding::Pkcs7, BlockEncryptMut, KeyIvInit};
use cbc::Encryptor;
use futures_util::stream;
use rand::RngCore;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use std::time::SystemTime;
use tauri::{AppHandle, Emitter, Runtime};

use crate::utils::settings;

const REPORTING_API_BASE_URL: &str = "https://reports-api.supernewroles.com/api/v3";
const TOKEN_FILE_NAME: &str = "RequestInGame.token";
const LOG_OUTPUT_RELATIVE_PATH: &str = "BepInEx/LogOutput.log";
const USER_AGENT: &str = "SuperNewRolesLauncher/0.1";
const LOG_ENCRYPTION_KEY_SOURCE: &[u8] = b"SNRLogKey2024!@#";
const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;
const REPORT_SEND_PROGRESS_EVENT: &str = "reporting-send-progress";
const REPORT_SEND_UPLOAD_CHUNK_SIZE: usize = 16 * 1024;
const REPORT_SEND_PREPARE_PROGRESS_MAX: f64 = 32.0;
const REPORT_SEND_UPLOAD_PROGRESS_MIN: f64 = 32.0;
const REPORT_SEND_UPLOAD_PROGRESS_MAX: f64 = 96.0;
const REPORT_SEND_PROCESSING_PROGRESS: f64 = 99.0;

static TOKEN_CACHE: OnceLock<Mutex<Option<String>>> = OnceLock::new();

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportStatus {
    pub status: String,
    pub color: String,
    pub mark: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportThread {
    pub thread_id: String,
    pub title: String,
    pub first_message: String,
    pub created_at: String,
    pub unread: bool,
    pub current_status: ReportStatus,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ReportMessage {
    pub message_type: String,
    pub message_id: String,
    pub created_at: String,
    pub content: String,
    pub sender: Option<String>,
    pub color: Option<String>,
    pub mark: Option<String>,
}

#[derive(Debug, Clone)]
pub struct PrepareAccountSummary {
    pub token_source: String,
    pub created_account: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogSourceInfo {
    pub profile_candidate: String,
    pub game_candidate: String,
    pub selected_path: Option<String>,
    pub exists: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendReportInput {
    pub report_type: String,
    pub title: String,
    pub description: String,
    pub map: Option<String>,
    pub role: Option<String>,
    pub timing: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CreateAccountResponse {
    token: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GetThreadsResponse {
    threads: Option<Vec<GetThreadsItem>>,
}

#[derive(Debug, Deserialize)]
struct GetThreadsItem {
    thread_id: Option<String>,
    title: Option<String>,
    message: Option<String>,
    created_at: Option<String>,
    has_unread_messages: Option<bool>,
    status: Option<GetThreadsStatus>,
}

#[derive(Debug, Deserialize)]
struct GetThreadsStatus {
    status: Option<String>,
    color: Option<String>,
    mark: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GetMessagesResponse {
    messages: Option<Vec<GetMessagesItem>>,
}

#[derive(Debug, Deserialize)]
struct GetMessagesItem {
    #[serde(rename = "type")]
    message_type: Option<String>,
    message_id: Option<String>,
    created_at: Option<String>,
    content: Option<String>,
    sender: Option<String>,
    color: Option<String>,
    mark: Option<String>,
}

#[derive(Debug, Deserialize)]
struct NotificationResponse {
    notification: Option<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct ReportSendProgressPayload {
    stage: String,
    progress: f64,
    uploaded_bytes: u64,
    total_bytes: u64,
}

#[derive(Debug, Clone)]
struct TokenCandidate {
    path: PathBuf,
    token: String,
    modified: SystemTime,
}

fn reporting_client() -> Result<Client, String> {
    Client::builder()
        .user_agent(USER_AGENT)
        .build()
        .map_err(|e| format!("Failed to create reporting API client: {e}"))
}

fn token_cache() -> &'static Mutex<Option<String>> {
    TOKEN_CACHE.get_or_init(|| Mutex::new(None))
}

fn get_cached_token() -> Option<String> {
    token_cache().lock().ok().and_then(|guard| guard.clone())
}

fn set_cached_token(token: Option<String>) {
    if let Ok(mut guard) = token_cache().lock() {
        *guard = token;
    }
}

fn windows_home_dir() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        std::env::var_os("USERPROFILE")
            .map(PathBuf::from)
            .ok_or_else(|| {
                "Failed to resolve USERPROFILE path for reporting token search".to_string()
            })
    }

    #[cfg(not(target_os = "windows"))]
    {
        Err("Reporting feature currently supports Windows only".to_string())
    }
}

fn token_candidate_paths<R: Runtime>(_app: &AppHandle<R>) -> Result<Vec<PathBuf>, String> {
    let home = windows_home_dir()?;
    let locallow_root = home.join("AppData").join("LocalLow").join("Innersloth");

    Ok(vec![locallow_root
        .join("Among Us")
        .join("SuperNewRolesNextSecrets")
        .join(TOKEN_FILE_NAME)])
}

fn read_token(path: &Path) -> Option<String> {
    let content = fs::read_to_string(path).ok()?;
    let token = content.trim().to_string();
    if token.is_empty() {
        None
    } else {
        Some(token)
    }
}

fn collect_token_candidates(paths: &[PathBuf]) -> Vec<TokenCandidate> {
    let mut candidates = Vec::new();

    for path in paths {
        let Some(token) = read_token(path) else {
            continue;
        };
        let Ok(metadata) = fs::metadata(path) else {
            continue;
        };
        let modified = metadata.modified().unwrap_or(SystemTime::UNIX_EPOCH);

        candidates.push(TokenCandidate {
            path: path.clone(),
            token,
            modified,
        });
    }

    candidates.sort_by(|a, b| b.modified.cmp(&a.modified));
    candidates
}

fn persist_token(paths: &[PathBuf], token: &str) -> Result<(), String> {
    for path in paths {
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "Failed to create reporting token directory '{}': {e}",
                    parent.display()
                )
            })?;
        }

        fs::write(path, token).map_err(|e| {
            format!(
                "Failed to write reporting token to '{}': {e}",
                path.display()
            )
        })?;
    }

    Ok(())
}

async fn validate_token(client: &Client, token: &str) -> Result<bool, String> {
    let trimmed = token.trim();
    if trimmed.is_empty() {
        return Ok(false);
    }

    let response = client
        .get(format!("{REPORTING_API_BASE_URL}/validateToken/"))
        .header("Authorization", format!("Bearer {trimmed}"))
        .send()
        .await
        .map_err(|e| format!("Failed to validate reporting token: {e}"))?;

    Ok(response.status().is_success())
}

async fn create_account(client: &Client) -> Result<String, String> {
    let response = client
        .post(format!("{REPORTING_API_BASE_URL}/createAccount/"))
        .send()
        .await
        .map_err(|e| format!("Failed to create reporting account: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Failed to create reporting account ({status}): {body}"
        ));
    }

    let payload = response
        .json::<CreateAccountResponse>()
        .await
        .map_err(|e| format!("Failed to parse createAccount response: {e}"))?;

    let token = payload.token.unwrap_or_default().trim().to_string();
    if token.is_empty() {
        return Err("Reporting API returned an empty token from createAccount".to_string());
    }

    Ok(token)
}

async fn resolve_valid_token<R: Runtime>(
    app: &AppHandle<R>,
    client: &Client,
    allow_create: bool,
) -> Result<(String, String, bool), String> {
    if let Some(cached) = get_cached_token() {
        if validate_token(client, &cached).await? {
            return Ok((cached, "memory-cache".to_string(), false));
        }
        set_cached_token(None);
    }

    let paths = token_candidate_paths(app)?;
    let candidates = collect_token_candidates(&paths);

    for candidate in candidates {
        if validate_token(client, &candidate.token).await? {
            set_cached_token(Some(candidate.token.clone()));
            return Ok((
                candidate.token,
                candidate.path.to_string_lossy().to_string(),
                false,
            ));
        }
    }

    if !allow_create {
        return Err("No valid reporting token found".to_string());
    }

    let token = create_account(client).await?;
    persist_token(&paths, &token)?;
    set_cached_token(Some(token.clone()));

    Ok((token, "createAccount".to_string(), true))
}

fn normalize_report_type(value: &str) -> Result<&'static str, String> {
    match value.trim().to_ascii_lowercase().as_str() {
        "bug" => Ok("Bug"),
        "question" => Ok("Question"),
        "request" => Ok("Request"),
        "thanks" => Ok("Thanks"),
        "other" => Ok("Other"),
        other => Err(format!("Unsupported report type: {other}")),
    }
}

fn report_log_source_info<R: Runtime>(app: &AppHandle<R>) -> Result<LogSourceInfo, String> {
    let launcher_settings = settings::load_or_init_settings(app)?;

    let profile_candidate_path =
        PathBuf::from(&launcher_settings.profile_path).join(LOG_OUTPUT_RELATIVE_PATH);
    let game_candidate_path = if launcher_settings.among_us_path.trim().is_empty() {
        PathBuf::new()
    } else {
        PathBuf::from(&launcher_settings.among_us_path).join(LOG_OUTPUT_RELATIVE_PATH)
    };

    let selected_path = if profile_candidate_path.is_file() {
        Some(profile_candidate_path.clone())
    } else if !game_candidate_path.as_os_str().is_empty() && game_candidate_path.is_file() {
        Some(game_candidate_path.clone())
    } else {
        None
    };

    let exists = selected_path.is_some();
    let selected_path = selected_path.map(|path| path.to_string_lossy().to_string());

    Ok(LogSourceInfo {
        profile_candidate: profile_candidate_path.to_string_lossy().to_string(),
        game_candidate: game_candidate_path.to_string_lossy().to_string(),
        selected_path,
        exists,
    })
}

fn emit_report_send_progress<R: Runtime>(
    app: &AppHandle<R>,
    stage: &str,
    progress: f64,
    uploaded_bytes: u64,
    total_bytes: u64,
) {
    let _ = app.emit(
        REPORT_SEND_PROGRESS_EVENT,
        ReportSendProgressPayload {
            stage: stage.to_string(),
            progress: progress.clamp(0.0, 100.0),
            uploaded_bytes,
            total_bytes,
        },
    );
}

fn version_field(selected_release_tag: &str) -> String {
    let tag = selected_release_tag.trim();
    let snr = if tag.is_empty() { "unknown" } else { tag };
    format!("SNR:{snr}&AmongUs:unknown")
}

fn format_report_message<R: Runtime>(app: &AppHandle<R>, input: &SendReportInput) -> String {
    let mut lines = vec![format!(
        "送信元: SNR Launcher v{}",
        app.package_info().version
    )];

    if let Some(map_value) = input
        .map
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        lines.push(format!("マップ: {map_value}"));
    }

    if let Some(role_value) = input
        .role
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        lines.push(format!("役職/機能: {role_value}"));
    }

    if let Some(timing_value) = input
        .timing
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        lines.push(format!("発生タイミング: {timing_value}"));
    }

    lines.push("---".to_string());
    lines.push(input.description.trim().to_string());
    lines.join("\n")
}

fn make_log_encryption_key() -> [u8; 32] {
    let mut key = [0u8; 32];
    let copy_len = LOG_ENCRYPTION_KEY_SOURCE.len().min(key.len());
    key[..copy_len].copy_from_slice(&LOG_ENCRYPTION_KEY_SOURCE[..copy_len]);
    key
}

fn compress_and_encrypt_log(log_text: &str) -> Result<String, String> {
    if log_text.is_empty() {
        return Ok(String::new());
    }

    let mut compressed = Vec::new();
    {
        let mut writer = CompressorWriter::new(&mut compressed, 4096, 5, 22);
        writer
            .write_all(log_text.as_bytes())
            .map_err(|e| format!("Failed to compress log text: {e}"))?;
        writer
            .flush()
            .map_err(|e| format!("Failed to finalize compressed log stream: {e}"))?;
    }

    let key = make_log_encryption_key();
    let mut iv = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut iv);

    let plain_len = compressed.len();
    let mut buffer = compressed;
    buffer.resize(plain_len + 16, 0);

    let encrypted = Encryptor::<Aes256>::new((&key).into(), (&iv).into())
        .encrypt_padded_mut::<Pkcs7>(&mut buffer, plain_len)
        .map_err(|e| format!("Failed to encrypt compressed log: {e}"))?;

    let mut output = Vec::with_capacity(iv.len() + encrypted.len());
    output.extend_from_slice(&iv);
    output.extend_from_slice(encrypted);

    Ok(B64.encode(output))
}

pub async fn prepare_account<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<PrepareAccountSummary, String> {
    let client = reporting_client()?;
    let (_, token_source, created_account) = resolve_valid_token(app, &client, true).await?;

    Ok(PrepareAccountSummary {
        token_source,
        created_account,
    })
}

pub async fn list_threads<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<ReportThread>, String> {
    let client = reporting_client()?;
    let (token, _, _) = resolve_valid_token(app, &client, true).await?;

    let response = client
        .get(format!("{REPORTING_API_BASE_URL}/getThreads/"))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| format!("Failed to get reporting threads: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Failed to get reporting threads ({status}): {body}"
        ));
    }

    let payload = response
        .json::<GetThreadsResponse>()
        .await
        .map_err(|e| format!("Failed to parse reporting threads response: {e}"))?;

    let threads = payload
        .threads
        .unwrap_or_default()
        .into_iter()
        .map(|thread| {
            let status = thread.status.unwrap_or(GetThreadsStatus {
                status: None,
                color: None,
                mark: None,
            });

            ReportThread {
                thread_id: thread.thread_id.unwrap_or_default(),
                title: thread.title.unwrap_or_default(),
                first_message: thread.message.unwrap_or_default(),
                created_at: thread.created_at.unwrap_or_default(),
                unread: thread.has_unread_messages.unwrap_or(false),
                current_status: ReportStatus {
                    status: status.status.unwrap_or_default(),
                    color: status.color.unwrap_or_else(|| "#32CD32".to_string()),
                    mark: status.mark.unwrap_or_else(|| "●".to_string()),
                },
            }
        })
        .collect();

    Ok(threads)
}

pub async fn get_messages<R: Runtime>(
    app: &AppHandle<R>,
    thread_id: &str,
) -> Result<Vec<ReportMessage>, String> {
    let normalized_thread_id = thread_id.trim();
    if normalized_thread_id.is_empty() {
        return Err("thread_id is required".to_string());
    }

    let client = reporting_client()?;
    let (token, _, _) = resolve_valid_token(app, &client, true).await?;

    let response = client
        .get(format!(
            "{REPORTING_API_BASE_URL}/getMessages/{normalized_thread_id}"
        ))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| format!("Failed to get thread messages: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Failed to get thread messages ({status}): {body}"));
    }

    let payload = response
        .json::<GetMessagesResponse>()
        .await
        .map_err(|e| format!("Failed to parse thread messages response: {e}"))?;

    let messages = payload
        .messages
        .unwrap_or_default()
        .into_iter()
        .map(|item| ReportMessage {
            message_type: item.message_type.unwrap_or_default(),
            message_id: item.message_id.unwrap_or_default(),
            created_at: item.created_at.unwrap_or_default(),
            content: item.content.unwrap_or_default(),
            sender: item.sender,
            color: item.color,
            mark: item.mark,
        })
        .collect();

    Ok(messages)
}

pub async fn send_message<R: Runtime>(
    app: &AppHandle<R>,
    thread_id: &str,
    content: &str,
) -> Result<(), String> {
    let normalized_thread_id = thread_id.trim();
    if normalized_thread_id.is_empty() {
        return Err("thread_id is required".to_string());
    }

    let normalized_content = content.trim();
    if normalized_content.is_empty() {
        return Err("Message content is required".to_string());
    }

    let client = reporting_client()?;
    let (token, _, _) = resolve_valid_token(app, &client, true).await?;

    let mut body = Map::new();
    body.insert(
        "thread_id".to_string(),
        Value::String(normalized_thread_id.to_string()),
    );
    body.insert(
        "content".to_string(),
        Value::String(normalized_content.to_string()),
    );

    let response = client
        .post(format!(
            "{REPORTING_API_BASE_URL}/sendMessage/{normalized_thread_id}"
        ))
        .header("Authorization", format!("Bearer {token}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("Failed to send message: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Failed to send message ({status}): {body}"));
    }

    Ok(())
}

pub async fn send_report<R: Runtime>(
    app: &AppHandle<R>,
    input: SendReportInput,
) -> Result<(), String> {
    let report_type = normalize_report_type(&input.report_type)?;
    let title = input.title.trim();
    let description = input.description.trim();

    if title.is_empty() {
        return Err("Report title is required".to_string());
    }
    if description.is_empty() {
        return Err("Report description is required".to_string());
    }

    emit_report_send_progress(app, "preparing", 0.0, 0, 0);

    let formatted_message = format_report_message(app, &input);

    let launcher_settings = settings::load_or_init_settings(app).inspect_err(|_| {
        emit_report_send_progress(app, "failed", 0.0, 0, 0);
    })?;
    let client = reporting_client().inspect_err(|_| {
        emit_report_send_progress(app, "failed", 0.0, 0, 0);
    })?;
    let (token, _, _) = resolve_valid_token(app, &client, true)
        .await
        .inspect_err(|_| {
            emit_report_send_progress(app, "failed", 0.0, 0, 0);
        })?;

    let mut payload = Map::new();
    payload.insert("message".to_string(), Value::String(formatted_message));
    payload.insert("title".to_string(), Value::String(title.to_string()));
    payload.insert(
        "version".to_string(),
        Value::String(version_field(&launcher_settings.selected_release_tag)),
    );
    payload.insert(
        "platform".to_string(),
        Value::String(launcher_settings.game_platform.as_str().to_string()),
    );

    emit_report_send_progress(app, "preparing", 12.0, 0, 0);

    if report_type == "Bug" {
        let log_info = match report_log_source_info(app) {
            Ok(info) => info,
            Err(e) => {
                emit_report_send_progress(app, "failed", 12.0, 0, 0);
                return Err(e);
            }
        };
        let Some(log_path) = log_info.selected_path else {
            emit_report_send_progress(app, "failed", 12.0, 0, 0);
            return Err(
                "BepInEx/LogOutput.log が見つかりません。先にModを起動してログを生成してください。"
                    .to_string(),
            );
        };

        let log_bytes = match fs::read(&log_path) {
            Ok(bytes) => bytes,
            Err(e) => {
                emit_report_send_progress(app, "failed", 12.0, 0, 0);
                return Err(format!(
                    "Failed to read BepInEx LogOutput for bug report '{}': {e}",
                    log_path
                ));
            }
        };
        emit_report_send_progress(app, "preparing", 22.0, 0, 0);
        let log_text = String::from_utf8_lossy(&log_bytes).to_string();
        let compressed = match compress_and_encrypt_log(&log_text) {
            Ok(value) => value,
            Err(e) => {
                emit_report_send_progress(app, "failed", 22.0, 0, 0);
                return Err(e);
            }
        };
        emit_report_send_progress(app, "preparing", REPORT_SEND_PREPARE_PROGRESS_MAX, 0, 0);

        payload.insert("mode".to_string(), Value::String("Launcher".to_string()));
        payload.insert("log_compressed".to_string(), Value::String(compressed));

        if let Some(map_value) = input
            .map
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            payload.insert("map".to_string(), Value::String(map_value.to_string()));
        }
        if let Some(role_value) = input
            .role
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            payload.insert("role".to_string(), Value::String(role_value.to_string()));
        }
        if let Some(timing_value) = input
            .timing
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            payload.insert(
                "timing".to_string(),
                Value::String(timing_value.to_string()),
            );
        }
    }

    let request_body = match serde_json::to_vec(&payload) {
        Ok(body) => body,
        Err(e) => {
            let failed_progress = if report_type == "Bug" {
                REPORT_SEND_PREPARE_PROGRESS_MAX
            } else {
                12.0
            };
            emit_report_send_progress(app, "failed", failed_progress, 0, 0);
            return Err(format!("Failed to serialize report request body: {e}"));
        }
    };
    if report_type != "Bug" {
        emit_report_send_progress(app, "preparing", REPORT_SEND_PREPARE_PROGRESS_MAX, 0, 0);
    }

    let total_bytes = request_body.len() as u64;
    let initial_upload_progress = if total_bytes == 0 {
        REPORT_SEND_UPLOAD_PROGRESS_MAX
    } else {
        REPORT_SEND_UPLOAD_PROGRESS_MIN
    };
    emit_report_send_progress(app, "uploading", initial_upload_progress, 0, total_bytes);

    let upload_stream = stream::unfold(
        (request_body, 0usize, app.clone(), total_bytes),
        |(request_body, offset, app, total_bytes)| async move {
            if offset >= request_body.len() {
                return None;
            }

            let end = (offset + REPORT_SEND_UPLOAD_CHUNK_SIZE).min(request_body.len());
            let uploaded_bytes = end as u64;
            let progress = if total_bytes == 0 {
                REPORT_SEND_UPLOAD_PROGRESS_MAX
            } else {
                let ratio = uploaded_bytes as f64 / total_bytes as f64;
                (REPORT_SEND_UPLOAD_PROGRESS_MIN
                    + ratio * (REPORT_SEND_UPLOAD_PROGRESS_MAX - REPORT_SEND_UPLOAD_PROGRESS_MIN))
                    .clamp(
                        REPORT_SEND_UPLOAD_PROGRESS_MIN,
                        REPORT_SEND_UPLOAD_PROGRESS_MAX,
                    )
            };
            emit_report_send_progress(&app, "uploading", progress, uploaded_bytes, total_bytes);

            Some((
                Ok::<Vec<u8>, std::io::Error>(request_body[offset..end].to_vec()),
                (request_body, end, app, total_bytes),
            ))
        },
    );

    // Intentionally send plain JSON (no HTTP Content-Encoding) for current API compatibility.
    let response = match client
        .post(format!(
            "{REPORTING_API_BASE_URL}/sendRequest/{report_type}"
        ))
        .header("Authorization", format!("Bearer {token}"))
        .header("Content-Type", "application/json")
        .body(reqwest::Body::wrap_stream(upload_stream))
        .send()
        .await
    {
        Ok(response) => response,
        Err(e) => {
            emit_report_send_progress(
                app,
                "failed",
                REPORT_SEND_UPLOAD_PROGRESS_MAX,
                total_bytes,
                total_bytes,
            );
            return Err(format!("Failed to send report: {e}"));
        }
    };

    emit_report_send_progress(
        app,
        "processing",
        REPORT_SEND_PROCESSING_PROGRESS,
        total_bytes,
        total_bytes,
    );

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        emit_report_send_progress(
            app,
            "failed",
            REPORT_SEND_PROCESSING_PROGRESS,
            total_bytes,
            total_bytes,
        );
        return Err(format!("Failed to send report ({status}): {body}"));
    }

    emit_report_send_progress(app, "complete", 100.0, total_bytes, total_bytes);

    Ok(())
}

pub async fn get_notification_flag<R: Runtime>(app: &AppHandle<R>) -> Result<bool, String> {
    let client = reporting_client()?;
    let (token, _, _) = resolve_valid_token(app, &client, true).await?;

    let response = client
        .get(format!("{REPORTING_API_BASE_URL}/getNotification/"))
        .header("Authorization", format!("Bearer {token}"))
        .send()
        .await
        .map_err(|e| format!("Failed to get reporting notification state: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!(
            "Failed to get reporting notification state ({status}): {body}"
        ));
    }

    let payload = response
        .json::<NotificationResponse>()
        .await
        .map_err(|e| format!("Failed to parse notification response: {e}"))?;

    Ok(payload.notification.unwrap_or(false))
}

pub fn get_log_source_info<R: Runtime>(app: &AppHandle<R>) -> Result<LogSourceInfo, String> {
    report_log_source_info(app)
}
