// バックグラウンド通知の遷移先取得コマンド。
use crate::utils::background_notifications::{self, NotificationOpenTarget};

#[tauri::command]
pub fn notifications_take_open_target() -> Option<NotificationOpenTarget> {
    // 通知クリック時の遷移先を一度だけ取り出す。
    // take系APIのため、同じ値は次回呼び出しでは取得できない。
    background_notifications::take_pending_open_target()
}
