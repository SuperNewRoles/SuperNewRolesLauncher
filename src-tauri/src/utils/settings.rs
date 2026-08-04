//! ランチャー設定の永続化と正規化を担当するユーティリティ。
//! フロント向けDTO(camelCase)と内部表現をここで吸収し、他層の責務を軽く保つ。

use serde::{Deserialize, Serialize};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    LazyLock, Mutex, MutexGuard,
};
use tauri::{AppHandle, Manager, Runtime};

use crate::utils::mod_profile;

const SETTINGS_FILE_NAME: &str = "settings.json";
static SETTINGS_TEMP_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);
static SETTINGS_OPERATION_LOCK: LazyLock<Mutex<()>> = LazyLock::new(|| Mutex::new(()));

/// 複数段階の設定読み書きを、他の設定更新から保護する。
pub(crate) fn lock_settings_operation() -> Result<MutexGuard<'static, ()>, String> {
    SETTINGS_OPERATION_LOCK
        .lock()
        .map_err(|_| "Failed to acquire settings operation lock".to_string())
}

fn required_profile_files() -> &'static [String] {
    // プロファイル必須ファイル定義はmod設定から取得する。
    &mod_profile::get().paths.profile_required_files
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum GamePlatform {
    #[default]
    Steam,
    Epic,
    Xbox,
}

impl GamePlatform {
    pub fn from_user_value(value: &str) -> Result<Self, String> {
        match value.trim().to_ascii_lowercase().as_str() {
            "steam" => Ok(Self::Steam),
            "epic" => Ok(Self::Epic),
            "xbox" => Ok(Self::Xbox),
            other => Err(format!("Unsupported platform: {other}")),
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Steam => "steam",
            Self::Epic => "epic",
            Self::Xbox => "xbox",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{
        atomic_write_file_with_replace, default_selected_game_server_id,
        load_or_init_settings_from_path, load_settings_or_default_from_path, save_settings_to_path,
        GamePlatform, LauncherSettings,
    };
    use std::fs;
    use std::io;
    use std::path::{Path, PathBuf};
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static TEST_DIRECTORY_SEQUENCE: AtomicU64 = AtomicU64::new(0);

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(label: &str) -> Self {
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let sequence = TEST_DIRECTORY_SEQUENCE.fetch_add(1, Ordering::Relaxed);
            Self(std::env::temp_dir().join(format!(
                "snr-settings-{label}-{}-{timestamp}-{sequence}",
                std::process::id()
            )))
        }

        fn path(&self) -> &Path {
            &self.0
        }
    }

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn default_settings(root: &Path) -> LauncherSettings {
        LauncherSettings {
            among_us_path: String::new(),
            game_platform: GamePlatform::Steam,
            selected_release_tag: String::new(),
            selected_game_server_id: default_selected_game_server_id(),
            profile_path: root.join("profiles/default").to_string_lossy().to_string(),
            close_to_tray_on_close: true,
            close_webview_on_tray_background: true,
            report_notifications_enabled: true,
            announce_notifications_enabled: true,
            ui_locale: "ja".to_string(),
            onboarding_completed: false,
        }
    }

    #[test]
    fn game_platform_accepts_xbox_user_value() {
        assert_eq!(
            GamePlatform::from_user_value("xbox").expect("xbox should be supported"),
            GamePlatform::Xbox
        );
        assert_eq!(GamePlatform::Xbox.as_str(), "xbox");
    }

    #[test]
    fn game_platform_serializes_xbox_as_lowercase() {
        let json = serde_json::to_string(&GamePlatform::Xbox).expect("serialize xbox");
        assert_eq!(json, "\"xbox\"");
        let platform: GamePlatform = serde_json::from_str(&json).expect("deserialize xbox");
        assert_eq!(platform, GamePlatform::Xbox);
    }

    #[test]
    fn load_or_init_creates_initial_settings_file() {
        let directory = TestDirectory::new("initial");
        let path = directory.path().join("settings.json");
        let expected = default_settings(directory.path());

        let loaded = load_or_init_settings_from_path(&path, expected.clone())
            .expect("initial settings should be created");

        assert_eq!(loaded, expected);
        assert!(path.is_file());
        assert_eq!(
            load_settings_or_default_from_path(&path, expected.clone())
                .expect("saved initial settings should load"),
            expected
        );
    }

    #[test]
    fn partial_settings_merge_defaults_without_rewriting_source() {
        let directory = TestDirectory::new("partial");
        fs::create_dir_all(directory.path()).expect("create test directory");
        let path = directory.path().join("settings.json");
        let partial = r#"{
  "amongUsPath": "  C:\\Games\\Among Us  ",
  "closeToTrayOnClose": false,
  "uiLocale": "en"
}"#;
        fs::write(&path, partial).expect("write partial settings");
        let expected_defaults = default_settings(directory.path());

        let loaded = load_or_init_settings_from_path(&path, expected_defaults.clone())
            .expect("partial settings should load");

        assert_eq!(loaded.among_us_path, "C:\\Games\\Among Us");
        assert_eq!(loaded.game_platform, GamePlatform::Steam);
        assert_eq!(loaded.profile_path, expected_defaults.profile_path);
        assert!(!loaded.close_to_tray_on_close);
        assert!(loaded.close_webview_on_tray_background);
        assert_eq!(loaded.ui_locale, "en");
        assert_eq!(
            fs::read_to_string(&path).expect("read original partial settings"),
            partial,
            "loading an existing valid file must not rewrite it"
        );
    }

    #[test]
    fn corrupt_settings_return_error_without_overwriting_source() {
        let directory = TestDirectory::new("corrupt");
        fs::create_dir_all(directory.path()).expect("create test directory");
        let path = directory.path().join("settings.json");
        let corrupt = br#"{"amongUsPath":"C:\\Games", "gamePlatform": }"#;
        fs::write(&path, corrupt).expect("write corrupt settings");

        let error = load_or_init_settings_from_path(&path, default_settings(directory.path()))
            .expect_err("corrupt settings must fail explicitly");

        assert!(error.contains(&path.to_string_lossy().to_string()));
        assert!(error.contains("Failed to parse settings file"));
        assert!(error.contains(&directory.path().to_string_lossy().to_string()));
        assert!(error.contains("rename or delete 'settings.json'"));
        assert_eq!(
            fs::read(&path).expect("read corrupt settings after failed load"),
            corrupt,
            "a corrupt settings file must be preserved for diagnosis and recovery"
        );
    }

    #[test]
    fn save_settings_atomically_replaces_existing_file() {
        let directory = TestDirectory::new("save");
        fs::create_dir_all(directory.path()).expect("create test directory");
        let path = directory.path().join("settings.json");
        fs::write(&path, b"previous settings").expect("write previous settings");
        let mut expected = default_settings(directory.path());
        expected.among_us_path = "  C:\\Games\\Among Us  ".to_string();
        expected.game_platform = GamePlatform::Epic;

        save_settings_to_path(&path, &expected).expect("atomic settings save should succeed");
        let loaded = load_settings_or_default_from_path(&path, default_settings(directory.path()))
            .expect("saved settings should load");

        expected.among_us_path = "C:\\Games\\Among Us".to_string();
        assert_eq!(loaded, expected);
        assert!(
            fs::read_dir(directory.path())
                .expect("list settings directory")
                .filter_map(Result::ok)
                .all(|entry| !entry.file_name().to_string_lossy().ends_with(".tmp")),
            "successful save must not leave temporary files"
        );
    }

    #[test]
    fn failed_atomic_replace_preserves_existing_settings() {
        let directory = TestDirectory::new("replace-failure");
        fs::create_dir_all(directory.path()).expect("create test directory");
        let path = directory.path().join("settings.json");
        fs::write(&path, b"known-good-settings").expect("write known-good settings");

        let error = atomic_write_file_with_replace(&path, b"new-settings", |temp, destination| {
            assert_eq!(destination, path);
            assert_eq!(
                fs::read(temp).expect("temporary file should be readable before replace"),
                b"new-settings"
            );
            Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "simulated replace failure",
            ))
        })
        .expect_err("replace failure should be returned");

        assert!(error.contains(&path.to_string_lossy().to_string()));
        assert!(error.contains("simulated replace failure"));
        assert_eq!(
            fs::read(&path).expect("read preserved settings"),
            b"known-good-settings"
        );
        assert!(
            fs::read_dir(directory.path())
                .expect("list settings directory")
                .filter_map(Result::ok)
                .all(|entry| !entry.file_name().to_string_lossy().ends_with(".tmp")),
            "failed save must clean up its temporary file"
        );
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LauncherSettings {
    pub among_us_path: String,
    pub game_platform: GamePlatform,
    pub selected_release_tag: String,
    pub selected_game_server_id: String,
    pub profile_path: String,
    pub close_to_tray_on_close: bool,
    pub close_webview_on_tray_background: bool,
    pub report_notifications_enabled: bool,
    pub announce_notifications_enabled: bool,
    pub ui_locale: String,
    pub onboarding_completed: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LauncherSettingsOnDisk {
    among_us_path: Option<String>,
    game_platform: Option<GamePlatform>,
    selected_release_tag: Option<String>,
    selected_game_server_id: Option<String>,
    profile_path: Option<String>,
    close_to_tray_on_close: Option<bool>,
    close_webview_on_tray_background: Option<bool>,
    report_notifications_enabled: Option<bool>,
    announce_notifications_enabled: Option<bool>,
    ui_locale: Option<String>,
    onboarding_completed: Option<bool>,
}

#[derive(Debug, Clone, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LauncherSettingsInput {
    pub among_us_path: Option<String>,
    pub game_platform: Option<GamePlatform>,
    pub selected_release_tag: Option<String>,
    pub selected_game_server_id: Option<String>,
    pub profile_path: Option<String>,
    pub close_to_tray_on_close: Option<bool>,
    pub close_webview_on_tray_background: Option<bool>,
    pub report_notifications_enabled: Option<bool>,
    pub announce_notifications_enabled: Option<bool>,
    pub ui_locale: Option<String>,
    pub onboarding_completed: Option<bool>,
}

fn normalize_ui_locale(value: &str) -> &'static str {
    // 想定外の値は既定の日本語ロケールへ寄せる。
    match value.trim().to_ascii_lowercase().as_str() {
        "en" => "en",
        _ => "ja",
    }
}

fn default_selected_game_server_id() -> String {
    // ゲームサーバー未選択時は mod.config の先頭エントリを既定にする。
    mod_profile::default_game_server_id()
        .unwrap_or_default()
        .to_string()
}

fn normalize_selected_game_server_id(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return default_selected_game_server_id();
    }

    if mod_profile::get()
        .apis
        .game_servers
        .iter()
        .any(|server| server.id == trimmed)
    {
        return trimmed.to_string();
    }

    default_selected_game_server_id()
}

/// アプリ固有データの保存先ディレクトリを返す。
pub fn app_data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data directory: {e}"))
}

/// デフォルトのSNRプロファイル保存先を返す。
pub fn default_profile_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join("profiles").join("default"))
}

fn settings_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(app_data_dir(app)?.join(SETTINGS_FILE_NAME))
}

fn make_default_settings<R: Runtime>(app: &AppHandle<R>) -> Result<LauncherSettings, String> {
    let profile_path = default_profile_path(app)?;
    Ok(LauncherSettings {
        among_us_path: String::new(),
        game_platform: GamePlatform::Steam,
        selected_release_tag: String::new(),
        selected_game_server_id: default_selected_game_server_id(),
        profile_path: profile_path.to_string_lossy().to_string(),
        close_to_tray_on_close: true,
        close_webview_on_tray_background: true,
        report_notifications_enabled: true,
        announce_notifications_enabled: true,
        ui_locale: "ja".to_string(),
        onboarding_completed: false,
    })
}

fn normalize_settings(mut settings: LauncherSettings) -> LauncherSettings {
    // 文字列項目を保存前にトリムし、表記ゆれを抑える。
    settings.among_us_path = settings.among_us_path.trim().to_string();
    settings.selected_release_tag = settings.selected_release_tag.trim().to_string();
    settings.selected_game_server_id =
        normalize_selected_game_server_id(&settings.selected_game_server_id);
    settings.profile_path = settings.profile_path.trim().to_string();
    settings.ui_locale = normalize_ui_locale(&settings.ui_locale).to_string();
    settings
}

#[derive(Debug)]
enum SettingsFileState {
    Missing,
    Loaded(LauncherSettings),
}

struct TemporarySettingsFile {
    path: PathBuf,
    remove_on_drop: bool,
}

impl TemporarySettingsFile {
    fn new(path: PathBuf) -> Self {
        Self {
            path,
            remove_on_drop: true,
        }
    }

    fn disarm(&mut self) {
        self.remove_on_drop = false;
    }
}

impl Drop for TemporarySettingsFile {
    fn drop(&mut self) {
        if self.remove_on_drop {
            let _ = fs::remove_file(&self.path);
        }
    }
}

fn settings_parent(path: &Path) -> &Path {
    path.parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."))
}

fn create_settings_temp_file(path: &Path) -> Result<(PathBuf, File), String> {
    let parent = settings_parent(path);
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy())
        .unwrap_or_else(|| "settings".into());

    for _ in 0..1000 {
        let sequence = SETTINGS_TEMP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let candidate = parent.join(format!(
            ".{file_name}.{}.{}.tmp",
            std::process::id(),
            sequence
        ));

        match OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&candidate)
        {
            Ok(file) => return Ok((candidate, file)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(format!(
                    "Failed to create temporary settings file '{}' for '{}': {error}",
                    candidate.display(),
                    path.display()
                ))
            }
        }
    }

    Err(format!(
        "Failed to allocate a unique temporary settings file next to '{}' after 1000 attempts",
        path.display()
    ))
}

#[cfg(windows)]
fn atomic_replace_file(source: &Path, destination: &Path) -> io::Result<()> {
    use std::os::windows::ffi::OsStrExt;
    use windows::core::PCWSTR;
    use windows::Win32::Storage::FileSystem::{
        MoveFileExW, MOVEFILE_REPLACE_EXISTING, MOVEFILE_WRITE_THROUGH,
    };

    let source_wide = source
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();
    let destination_wide = destination
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect::<Vec<_>>();

    // SAFETY: 両パスは呼び出し中に生存する末尾NUL付きUTF-16バッファである。
    unsafe {
        MoveFileExW(
            PCWSTR(source_wide.as_ptr()),
            PCWSTR(destination_wide.as_ptr()),
            MOVEFILE_REPLACE_EXISTING | MOVEFILE_WRITE_THROUGH,
        )
    }
    .map_err(|error| io::Error::other(error.to_string()))
}

#[cfg(not(windows))]
fn atomic_replace_file(source: &Path, destination: &Path) -> io::Result<()> {
    fs::rename(source, destination)
}

fn atomic_write_file_with_replace<F>(path: &Path, contents: &[u8], replace: F) -> Result<(), String>
where
    F: FnOnce(&Path, &Path) -> io::Result<()>,
{
    let parent = settings_parent(path);
    fs::create_dir_all(parent).map_err(|error| {
        format!(
            "Failed to create settings directory '{}' for '{}': {error}",
            parent.display(),
            path.display()
        )
    })?;

    let (temp_path, mut temp_file) = create_settings_temp_file(path)?;
    let mut cleanup = TemporarySettingsFile::new(temp_path.clone());

    temp_file.write_all(contents).map_err(|error| {
        format!(
            "Failed to write temporary settings file '{}' for '{}': {error}",
            temp_path.display(),
            path.display()
        )
    })?;
    temp_file.sync_all().map_err(|error| {
        format!(
            "Failed to synchronize temporary settings file '{}' for '{}': {error}",
            temp_path.display(),
            path.display()
        )
    })?;
    drop(temp_file);

    replace(&temp_path, path).map_err(|error| {
        format!(
            "Failed to atomically replace settings file '{}' using '{}': {error}",
            path.display(),
            temp_path.display()
        )
    })?;
    cleanup.disarm();
    Ok(())
}

fn atomic_write_file(path: &Path, contents: &[u8]) -> Result<(), String> {
    atomic_write_file_with_replace(path, contents, atomic_replace_file)
}

fn merge_settings(
    mut default_settings: LauncherSettings,
    on_disk: LauncherSettingsOnDisk,
) -> LauncherSettings {
    if let Some(among_us_path) = on_disk.among_us_path {
        default_settings.among_us_path = among_us_path;
    }
    if let Some(game_platform) = on_disk.game_platform {
        default_settings.game_platform = game_platform;
    }
    if let Some(selected_release_tag) = on_disk.selected_release_tag {
        default_settings.selected_release_tag = selected_release_tag;
    }
    if let Some(selected_game_server_id) = on_disk.selected_game_server_id {
        default_settings.selected_game_server_id = selected_game_server_id;
    }
    if let Some(close_to_tray_on_close) = on_disk.close_to_tray_on_close {
        default_settings.close_to_tray_on_close = close_to_tray_on_close;
    }
    if let Some(close_webview_on_tray_background) = on_disk.close_webview_on_tray_background {
        default_settings.close_webview_on_tray_background = close_webview_on_tray_background;
    }
    if let Some(report_notifications_enabled) = on_disk.report_notifications_enabled {
        default_settings.report_notifications_enabled = report_notifications_enabled;
    }
    if let Some(announce_notifications_enabled) = on_disk.announce_notifications_enabled {
        default_settings.announce_notifications_enabled = announce_notifications_enabled;
    }
    if let Some(ui_locale) = on_disk.ui_locale {
        default_settings.ui_locale = normalize_ui_locale(&ui_locale).to_string();
    }
    if let Some(profile_path) = on_disk.profile_path {
        let trimmed = profile_path.trim();
        if !trimmed.is_empty() {
            default_settings.profile_path = trimmed.to_string();
        }
    }
    if let Some(onboarding_completed) = on_disk.onboarding_completed {
        default_settings.onboarding_completed = onboarding_completed;
    }

    normalize_settings(default_settings)
}

fn read_settings_file(
    path: &Path,
    default_settings: LauncherSettings,
) -> Result<SettingsFileState, String> {
    let content = match fs::read_to_string(path) {
        Ok(content) => content,
        Err(error) if error.kind() == io::ErrorKind::NotFound => {
            return Ok(SettingsFileState::Missing)
        }
        Err(error) => {
            return Err(format!(
                "Failed to read settings file '{}': {error}. To recover, open the app-data folder '{}', rename or delete 'settings.json', then restart the launcher.",
                path.display(),
                settings_parent(path).display()
            ))
        }
    };

    let on_disk = serde_json::from_str::<LauncherSettingsOnDisk>(&content).map_err(|error| {
        format!(
            "Failed to parse settings file '{}': {error}. To recover, open the app-data folder '{}', rename or delete 'settings.json', then restart the launcher.",
            path.display(),
            settings_parent(path).display()
        )
    })?;

    Ok(SettingsFileState::Loaded(merge_settings(
        default_settings,
        on_disk,
    )))
}

fn save_settings_to_path(path: &Path, settings: &LauncherSettings) -> Result<(), String> {
    let settings = normalize_settings(settings.clone());
    let json = serde_json::to_vec_pretty(&settings).map_err(|error| {
        format!(
            "Failed to serialize settings for '{}': {error}",
            path.display()
        )
    })?;
    atomic_write_file(path, &json)
}

fn load_settings_or_default_from_path(
    path: &Path,
    default_settings: LauncherSettings,
) -> Result<LauncherSettings, String> {
    match read_settings_file(path, default_settings.clone())? {
        SettingsFileState::Missing => Ok(normalize_settings(default_settings)),
        SettingsFileState::Loaded(settings) => Ok(settings),
    }
}

fn load_or_init_settings_from_path(
    path: &Path,
    default_settings: LauncherSettings,
) -> Result<LauncherSettings, String> {
    match read_settings_file(path, default_settings.clone())? {
        SettingsFileState::Missing => {
            let default_settings = normalize_settings(default_settings);
            save_settings_to_path(path, &default_settings)?;
            Ok(default_settings)
        }
        // 読み取り成功時は設定取得を副作用のない処理に保ち、既存ファイルを書き直さない。
        SettingsFileState::Loaded(settings) => Ok(settings),
    }
}

pub fn save_settings<R: Runtime>(
    app: &AppHandle<R>,
    settings: &LauncherSettings,
) -> Result<(), String> {
    let path = settings_path(app)?;
    save_settings_to_path(&path, settings)
}

pub fn load_settings_or_default<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<LauncherSettings, String> {
    let path = settings_path(app)?;
    let default_settings = make_default_settings(app)?;
    load_settings_or_default_from_path(&path, default_settings)
}

pub fn load_or_init_settings<R: Runtime>(app: &AppHandle<R>) -> Result<LauncherSettings, String> {
    let path = settings_path(app)?;
    let default_settings = make_default_settings(app)?;
    load_or_init_settings_from_path(&path, default_settings)
}

pub fn apply_settings_input<R: Runtime>(
    app: &AppHandle<R>,
    input: LauncherSettingsInput,
) -> Result<LauncherSettings, String> {
    let _operation_guard = lock_settings_operation()?;
    let mut settings = load_or_init_settings(app)?;

    if let Some(among_us_path) = input.among_us_path {
        settings.among_us_path = among_us_path;
    }
    if let Some(game_platform) = input.game_platform {
        settings.game_platform = game_platform;
    }
    if let Some(selected_release_tag) = input.selected_release_tag {
        settings.selected_release_tag = selected_release_tag;
    }
    if let Some(selected_game_server_id) = input.selected_game_server_id {
        settings.selected_game_server_id = selected_game_server_id;
    }
    if let Some(profile_path) = input.profile_path {
        settings.profile_path = profile_path;
    }
    if let Some(close_to_tray_on_close) = input.close_to_tray_on_close {
        settings.close_to_tray_on_close = close_to_tray_on_close;
    }
    if let Some(close_webview_on_tray_background) = input.close_webview_on_tray_background {
        settings.close_webview_on_tray_background = close_webview_on_tray_background;
    }
    if let Some(report_notifications_enabled) = input.report_notifications_enabled {
        settings.report_notifications_enabled = report_notifications_enabled;
    }
    if let Some(announce_notifications_enabled) = input.announce_notifications_enabled {
        settings.announce_notifications_enabled = announce_notifications_enabled;
    }
    if let Some(ui_locale) = input.ui_locale {
        settings.ui_locale = ui_locale;
    }
    if let Some(onboarding_completed) = input.onboarding_completed {
        settings.onboarding_completed = onboarding_completed;
    }

    // 空文字で上書きされた場合でも、最低限の保存先は維持する。
    if settings.profile_path.trim().is_empty() {
        settings.profile_path = default_profile_path(app)?.to_string_lossy().to_string();
    }

    // 外部入力を都度正規化してから保存し、不正な空白やlocale値を残さない。
    settings = normalize_settings(settings);
    save_settings(app, &settings)?;
    Ok(settings)
}

/// プロファイルの必須ファイルがすべて揃っているかを判定する。
pub fn is_profile_ready(profile_path: &Path) -> bool {
    required_profile_files()
        .iter()
        .all(|relative_path| profile_path.join(relative_path).is_file())
}

/// 必須ファイルの不足内容を詳細メッセージ付きで検証する。
pub fn verify_profile_required_files(profile_path: &Path) -> Result<(), String> {
    for relative_path in required_profile_files() {
        let file_path = profile_path.join(relative_path);
        // どのファイルが欠けているかを明示し、設定ミス調査を容易にする。
        if !file_path.is_file() {
            return Err(format!(
                "Missing required file in profile: {}",
                file_path.to_string_lossy()
            ));
        }
    }
    Ok(())
}
