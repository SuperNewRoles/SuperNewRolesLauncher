// Among Usのインストール場所検出を公開するコマンド群。
use crate::utils::finder::{detect_platform, get_among_us_paths};
use serde::Serialize;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedPlatform {
    pub path: String,
    pub platform: String,
}

/// 検出された全Among Usインストール候補とそのプラットフォームを返す。
/// 検出されたもののみ表示する（SteamだけならSteamのみ、EpicだけならEpicのみ）。
#[tauri::command]
pub fn finder_detect_platforms() -> Result<Vec<DetectedPlatform>, String> {
    let paths = get_among_us_paths();
    let mut result = Vec::with_capacity(paths.len());
    for path in paths {
        let path_str = path.to_string_lossy().to_string();
        // 検証に失敗した候補は返却対象から除外する。
        if let Ok(platform) = detect_platform(&path_str) {
            result.push(DetectedPlatform {
                path: path_str,
                platform,
            });
        }
    }
    Ok(result)
}

/// Among Usのインストール候補を検出し、先頭候補を返す。
#[tauri::command]
pub fn finder_detect_among_us() -> Result<String, String> {
    // UI初期表示向けに、検出候補の先頭のみを既定値として返す。
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
