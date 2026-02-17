use base64::Engine;
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

use crate::utils::{mod_profile, storage::KeyringStorage};

const OAUTH_HOST: &str = "account-public-service-prod03.ol.epicgames.com";
const LAUNCHER_CLIENT_ID: &str = "34a02cf8f4414e29b15921876da36f9a";
const LAUNCHER_CLIENT_SECRET: &str = "daafbccc737745039dffe53d94fc76cf";
const USER_AGENT: &str =
    "UELauncher/11.0.1-14907503+++Portal+Release-Live Windows/10.0.19041.1.256.64bit";

const B64: base64::engine::GeneralPurpose = base64::engine::general_purpose::STANDARD;
static STORAGE: OnceLock<KeyringStorage<EpicSession>> = OnceLock::new();
static SESSION_CACHE: OnceLock<Mutex<Option<EpicSession>>> = OnceLock::new();
static STORAGE_SERVICE_NAME: OnceLock<&'static str> = OnceLock::new();
static FALLBACK_SESSION_DIR_NAME: OnceLock<&'static str> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EpicSession {
    #[serde(alias = "accessToken")]
    pub access_token: String,
    #[serde(alias = "refreshToken")]
    pub refresh_token: String,
    #[serde(alias = "accountId")]
    pub account_id: String,
    #[serde(alias = "displayName")]
    pub display_name: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GameTokenResponse {
    code: String,
}

pub struct EpicApi {
    client: Client,
}

impl EpicApi {
    pub fn new() -> Result<Self, String> {
        Client::builder()
            .user_agent(USER_AGENT)
            .gzip(true)
            .build()
            .map(|client| Self { client })
            .map_err(|e| format!("Failed to create Epic API client: {e}"))
    }

    fn basic_auth() -> String {
        B64.encode(format!("{LAUNCHER_CLIENT_ID}:{LAUNCHER_CLIENT_SECRET}"))
    }

    pub fn get_auth_url() -> String {
        let redirect = format!(
            "https://www.epicgames.com/id/api/redirect?clientId={LAUNCHER_CLIENT_ID}&responseType=code"
        );
        format!(
            "https://www.epicgames.com/id/login?redirectUrl={}",
            urlencoding::encode(&redirect)
        )
    }

    pub async fn login_with_auth_code(&self, code: &str) -> Result<EpicSession, String> {
        self.oauth_request(&[
            ("grant_type", "authorization_code"),
            ("code", code),
            ("token_type", "eg1"),
        ])
        .await
    }

    pub async fn refresh_session(&self, refresh_token: &str) -> Result<EpicSession, String> {
        self.oauth_request(&[
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh_token),
            ("token_type", "eg1"),
        ])
        .await
    }

    pub async fn get_game_token(&self, session: &EpicSession) -> Result<String, String> {
        let response = self
            .client
            .get(format!("https://{OAUTH_HOST}/account/api/oauth/exchange"))
            .header("Authorization", format!("Bearer {}", session.access_token))
            .send()
            .await
            .map_err(|e| format!("Failed to request Epic game token: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Failed to get Epic game token ({status}): {body}"));
        }

        response
            .json::<GameTokenResponse>()
            .await
            .map(|payload| payload.code)
            .map_err(|e| format!("Failed to parse Epic game token response: {e}"))
    }

    async fn oauth_request(&self, params: &[(&str, &str)]) -> Result<EpicSession, String> {
        let response = self
            .client
            .post(format!("https://{OAUTH_HOST}/account/api/oauth/token"))
            .header("Authorization", format!("Basic {}", Self::basic_auth()))
            .form(params)
            .send()
            .await
            .map_err(|e| format!("Epic OAuth request failed: {e}"))?;

        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            return Err(format!("Epic OAuth failed ({status}): {body}"));
        }

        response
            .json::<EpicSession>()
            .await
            .map_err(|e| format!("Failed to parse Epic OAuth response: {e}"))
    }
}

fn storage() -> &'static KeyringStorage<EpicSession> {
    STORAGE.get_or_init(|| KeyringStorage::new(storage_service_name(), "epic_session"))
}

fn storage_service_name() -> &'static str {
    STORAGE_SERVICE_NAME.get_or_init(|| {
        let identifier = mod_profile::get().branding.identifier.trim();
        let value = if identifier.is_empty() {
            "launcher-epic-session".to_string()
        } else {
            identifier.to_ascii_lowercase().replace(' ', "_")
        };
        Box::leak(value.into_boxed_str())
    })
}

fn fallback_session_dir_name() -> &'static str {
    FALLBACK_SESSION_DIR_NAME.get_or_init(|| {
        let launcher_name = mod_profile::get().branding.launcher_name.trim();
        let value = if launcher_name.is_empty() {
            "Launcher".to_string()
        } else {
            launcher_name.to_string()
        };
        Box::leak(value.into_boxed_str())
    })
}

fn session_cache() -> &'static Mutex<Option<EpicSession>> {
    SESSION_CACHE.get_or_init(|| Mutex::new(None))
}

fn fallback_session_path() -> Option<PathBuf> {
    #[cfg(windows)]
    {
        std::env::var_os("APPDATA").map(|app_data| {
            PathBuf::from(app_data)
                .join(fallback_session_dir_name())
                .join("epic_session.json")
        })
    }

    #[cfg(not(windows))]
    {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| {
                std::env::var_os("HOME").map(|home| PathBuf::from(home).join(".local/share"))
            })
            .map(|data_home| {
                data_home
                    .join(fallback_session_dir_name())
                    .join("epic_session.json")
            })
    }
}

fn save_session_fallback_file(session: &EpicSession) -> Result<(), String> {
    let Some(path) = fallback_session_path() else {
        return Err("No writable fallback path for Epic session".to_string());
    };

    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create fallback session directory: {e}"))?;
    }

    let json =
        serde_json::to_string(session).map_err(|e| format!("Failed to serialize session: {e}"))?;
    fs::write(&path, json).map_err(|e| format!("Failed to write fallback session file: {e}"))?;
    Ok(())
}

fn load_session_fallback_file() -> Option<EpicSession> {
    let path = fallback_session_path()?;
    let content = fs::read_to_string(path).ok()?;
    serde_json::from_str::<EpicSession>(&content).ok()
}

fn clear_session_fallback_file() -> Result<(), String> {
    let Some(path) = fallback_session_path() else {
        return Ok(());
    };
    if !path.exists() {
        return Ok(());
    }
    fs::remove_file(path).map_err(|e| format!("Failed to remove fallback session file: {e}"))
}

pub fn save_session(session: &EpicSession) -> Result<(), String> {
    let keyring_result = storage().save(session);
    let file_result = save_session_fallback_file(session);

    if let Ok(mut guard) = session_cache().lock() {
        *guard = Some(session.clone());
    }

    if keyring_result.is_ok() || file_result.is_ok() {
        Ok(())
    } else {
        Err(format!(
            "Failed to persist Epic session (keyring: {}, file: {})",
            keyring_result
                .err()
                .unwrap_or_else(|| "unknown".to_string()),
            file_result.err().unwrap_or_else(|| "unknown".to_string())
        ))
    }
}

pub fn load_session() -> Option<EpicSession> {
    if let Ok(guard) = session_cache().lock() {
        if let Some(session) = guard.clone() {
            return Some(session);
        }
    }

    let loaded = storage().load();
    if let Some(session) = loaded {
        let _ = save_session_fallback_file(&session);
        if let Ok(mut guard) = session_cache().lock() {
            *guard = Some(session.clone());
        }
        return Some(session);
    }

    let fallback_loaded = load_session_fallback_file();
    if let Some(session) = fallback_loaded {
        let _ = storage().save(&session);
        if let Ok(mut guard) = session_cache().lock() {
            *guard = Some(session.clone());
        }
        return Some(session);
    }

    None
}

pub fn clear_session() -> Result<(), String> {
    if let Ok(mut guard) = session_cache().lock() {
        *guard = None;
    }
    let keyring_result = storage().clear();
    let file_result = clear_session_fallback_file();

    if keyring_result.is_ok() || file_result.is_ok() {
        Ok(())
    } else {
        Err(format!(
            "Failed to clear Epic session (keyring: {}, file: {})",
            keyring_result
                .err()
                .unwrap_or_else(|| "unknown".to_string()),
            file_result.err().unwrap_or_else(|| "unknown".to_string())
        ))
    }
}
