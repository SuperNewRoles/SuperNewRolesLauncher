//! ゲームサーバー関連 command。
//! 直接Joinなどの公開API境界をこの層に集約する。

use crate::{services::game_server_service, utils::mod_profile};

fn ensure_game_servers_enabled() -> Result<(), String> {
    mod_profile::ensure_feature_enabled(mod_profile::Feature::GameServers)
}

/// localhost join API を直接呼び出して参加処理を実行する。
#[tauri::command]
pub async fn game_servers_join_direct(
    query: String,
) -> Result<game_server_service::GameServerJoinDirectResult, String> {
    ensure_game_servers_enabled()?;
    game_server_service::join_direct(query).await
}
