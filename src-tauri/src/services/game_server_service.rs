//! ゲームサーバー一覧/直接Join向けのサービス層。
//! localhost join API 呼び出しの詳細を command 層から分離する。

use std::time::Duration;

use reqwest::Client;
use serde::Serialize;

use crate::utils::mod_profile;

const JOIN_LOCALHOST_UNREACHABLE_ERROR: &str = "JOIN_LOCALHOST_UNREACHABLE";
const JOIN_LOCALHOST_ERROR: &str = "JOIN_LOCALHOST_ERROR";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameServerJoinDirectResult {
    pub status: u16,
    pub message: String,
    pub ok: bool,
}

fn normalize_query_suffix(query: &str) -> String {
    // query は先頭 ? あり/なしのどちらでも受け付ける。
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return String::new();
    }

    if trimmed.starts_with('?') {
        return trimmed.to_string();
    }

    format!("?{trimmed}")
}

fn direct_join_url(query: &str) -> String {
    let config = &mod_profile::get().apis.join_direct;
    let query_suffix = normalize_query_suffix(query);
    format!(
        "{}{}{}",
        config.localhost_base_url, config.join_path, query_suffix
    )
}

pub async fn join_direct(query: String) -> Result<GameServerJoinDirectResult, String> {
    let config = &mod_profile::get().apis.join_direct;
    let timeout = Duration::from_millis(config.timeout_ms);
    let client = Client::builder()
        .timeout(timeout)
        .build()
        .map_err(|_| JOIN_LOCALHOST_ERROR.to_string())?;

    let url = direct_join_url(&query);
    let response = client.get(&url).send().await.map_err(|error| {
        if error.is_connect() || error.is_timeout() {
            JOIN_LOCALHOST_UNREACHABLE_ERROR.to_string()
        } else {
            JOIN_LOCALHOST_ERROR.to_string()
        }
    })?;

    let status = response.status().as_u16();
    let message = response
        .text()
        .await
        .map_err(|_| JOIN_LOCALHOST_ERROR.to_string())?;
    let ok = status == 200 && message.trim() == "接続しました。";

    Ok(GameServerJoinDirectResult {
        status,
        message,
        ok,
    })
}
