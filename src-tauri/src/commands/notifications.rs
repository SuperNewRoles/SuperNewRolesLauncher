use crate::utils::background_notifications::{self, NotificationOpenTarget};

#[tauri::command]
pub fn notifications_take_open_target() -> Option<NotificationOpenTarget> {
    background_notifications::take_pending_open_target()
}
