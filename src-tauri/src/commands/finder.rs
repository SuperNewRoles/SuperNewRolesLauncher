use crate::utils::finder::{detect_platform, get_among_us_paths};

/// Among Usのインストール候補を検出し、先頭候補を返す。
#[tauri::command]
pub fn finder_detect_among_us() -> Result<String, String> {
    get_among_us_paths()
        .first()
        .map(|path| path.to_string_lossy().to_string())
        .ok_or_else(|| "Among Us installation not found".to_string())
}

/// 指定パスからプラットフォーム種別を判定する。
#[tauri::command]
pub fn finder_detect_platform(path: String) -> Result<String, String> {
    detect_platform(&path)
}
