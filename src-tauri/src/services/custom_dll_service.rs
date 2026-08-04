//! カスタムDLLの検証・置換と、関連設定のトランザクションを扱う。

use crate::{
    services::launch_service,
    utils::{mod_profile, settings},
};
use serde::Serialize;
use serde_json::{Map, Value};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions};
use std::io::{self, Read, Write};
use std::path::{Path, PathBuf};
use std::sync::{
    atomic::{AtomicU64, Ordering},
    Mutex,
};
use tauri::{AppHandle, Runtime};

static TEMP_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);
static CUSTOM_DLL_INSTALL_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CustomDllInstallResult {
    pub target_path: String,
    pub sha256: String,
    pub release_tag: String,
    pub auto_update_config_updated: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ReplaceOperation {
    DllApply,
    AutoUpdateConfigApply,
    AutoUpdateConfigRollback,
    DllRollback,
}

struct TemporaryFile {
    path: PathBuf,
    keep: bool,
}

impl TemporaryFile {
    fn new(path: PathBuf) -> Self {
        Self { path, keep: false }
    }

    fn path(&self) -> &Path {
        &self.path
    }

    fn keep(&mut self) {
        self.keep = true;
    }
}

impl Drop for TemporaryFile {
    fn drop(&mut self) {
        if self.keep {
            return;
        }
        let _ = fs::remove_file(&self.path);
    }
}

struct CreatedDirectories {
    // 深いディレクトリから順に保持し、失敗時に空のものだけを戻す。
    paths: Vec<PathBuf>,
    keep: bool,
}

impl CreatedDirectories {
    fn keep(&mut self) {
        self.keep = true;
    }
}

impl Drop for CreatedDirectories {
    fn drop(&mut self) {
        if self.keep {
            return;
        }
        for path in &self.paths {
            let _ = fs::remove_dir(path);
        }
    }
}

/// 保存済み設定が指すプロファイルへカスタムDLLを適用する。
pub fn install_custom_dll<R: Runtime>(
    app: &AppHandle<R>,
    source_path: String,
    disable_auto_update: bool,
) -> Result<CustomDllInstallResult, String> {
    let _operation_guard = CUSTOM_DLL_INSTALL_LOCK
        .lock()
        .map_err(|_| "Failed to acquire the custom DLL install lock.".to_string())?;
    let _game_file_guard = launch_service::lock_game_file_operation()?;
    let _settings_guard = settings::lock_settings_operation()?;

    if launch_service::is_game_running(app.clone())? {
        return Err("Cannot replace the mod DLL while the game is running.".to_string());
    }

    let launcher_settings = settings::load_or_init_settings(app)?;
    let profile_value = launcher_settings.profile_path.trim();
    if profile_value.is_empty() {
        return Err("The saved launcher settings do not contain a profile path.".to_string());
    }

    let profile_path = PathBuf::from(profile_value);
    if !profile_path.is_dir() {
        return Err(format!(
            "The saved profile directory does not exist: {}",
            profile_path.display()
        ));
    }
    settings::verify_profile_required_files(&profile_path).map_err(|error| {
        format!("The saved profile is not ready for custom DLL installation: {error}")
    })?;

    let paths = &mod_profile::get().paths;
    let target_path =
        profile_path.join(mod_profile::to_relative_path(&paths.mod_dll_relative_path));
    let auto_update_config_path = profile_path.join(mod_profile::to_relative_path(
        &paths.mod_auto_update_config_relative_path,
    ));
    let source_path = PathBuf::from(source_path.trim());

    install_custom_dll_transaction(
        &source_path,
        &target_path,
        &auto_update_config_path,
        disable_auto_update,
        &launcher_settings,
        |updated_settings| settings::save_settings(app, updated_settings),
        |source, destination, operation| {
            if operation == ReplaceOperation::DllApply
                && launch_service::is_game_running(app.clone()).map_err(io::Error::other)?
            {
                return Err(io::Error::other(
                    "Cannot replace the mod DLL while the game is running.",
                ));
            }
            atomic_replace_file(source, destination)
        },
    )
}

fn install_custom_dll_transaction<SaveSettings, ReplaceFile>(
    source_path: &Path,
    target_path: &Path,
    auto_update_config_path: &Path,
    disable_auto_update: bool,
    launcher_settings: &settings::LauncherSettings,
    save_settings: SaveSettings,
    mut replace_file: ReplaceFile,
) -> Result<CustomDllInstallResult, String>
where
    SaveSettings: FnOnce(&settings::LauncherSettings) -> Result<(), String>,
    ReplaceFile: FnMut(&Path, &Path, ReplaceOperation) -> io::Result<()>,
{
    validate_source_and_target(source_path, target_path)?;

    let target_parent = target_path.parent().ok_or_else(|| {
        format!(
            "The configured mod DLL path has no parent directory: {}",
            target_path.display()
        )
    })?;
    let (dll_staging, sha256) = stage_source_dll(source_path, target_parent, target_path)?;
    let release_tag = format!("custom:{sha256}");

    let mut created_config_directories = None;
    let mut config_staging = None;
    let config_existed;
    if disable_auto_update {
        let config_parent = auto_update_config_path.parent().ok_or_else(|| {
            format!(
                "The configured auto-update path has no parent directory: {}",
                auto_update_config_path.display()
            )
        })?;
        let created_directories = ensure_directory(config_parent)?;
        let (contents, existed) = disabled_auto_update_config(auto_update_config_path)?;
        config_existed = existed;
        config_staging = Some(stage_bytes(auto_update_config_path, &contents, "stage")?);
        created_config_directories = Some(created_directories);
    } else {
        config_existed = match fs::metadata(auto_update_config_path) {
            Ok(metadata) if metadata.is_file() => true,
            Ok(_) => {
                return Err(format!(
                    "The configured auto-update path is not a file: {}",
                    auto_update_config_path.display()
                ))
            }
            Err(error) if error.kind() == io::ErrorKind::NotFound => false,
            Err(error) => {
                return Err(format!(
                    "Failed to inspect auto-update config '{}': {error}",
                    auto_update_config_path.display()
                ))
            }
        };
    }

    // 全ステージングが完了してからバックアップを作り、対象ファイルにはまだ触れない。
    let mut dll_backup = backup_file(target_path)?;
    let mut config_backup = config_existed
        .then(|| backup_file(auto_update_config_path))
        .transpose()?;

    if let Err(error) = replace_file(dll_staging.path(), target_path, ReplaceOperation::DllApply) {
        return Err(format!(
            "Failed to atomically replace mod DLL '{}' using '{}': {error}",
            target_path.display(),
            dll_staging.path().display()
        ));
    }

    if let Some(staging) = &config_staging {
        if let Err(error) = replace_file(
            staging.path(),
            auto_update_config_path,
            ReplaceOperation::AutoUpdateConfigApply,
        ) {
            let rollback_errors = rollback_files(
                target_path,
                &mut dll_backup,
                None,
                None,
                false,
                &mut replace_file,
            );
            return Err(with_rollback_errors(
                format!(
                    "Failed to atomically replace auto-update config '{}' using '{}': {error}",
                    auto_update_config_path.display(),
                    staging.path().display()
                ),
                rollback_errors,
            ));
        }
    } else if config_existed {
        if let Err(error) = fs::remove_file(auto_update_config_path) {
            let rollback_errors = rollback_files(
                target_path,
                &mut dll_backup,
                Some(auto_update_config_path),
                config_backup.as_mut(),
                false,
                &mut replace_file,
            );
            return Err(with_rollback_errors(
                format!(
                    "Failed to remove auto-update config '{}': {error}",
                    auto_update_config_path.display()
                ),
                rollback_errors,
            ));
        }
    }

    let mut updated_settings = launcher_settings.clone();
    updated_settings.selected_release_tag = release_tag.clone();
    if let Err(error) = save_settings(&updated_settings) {
        let rollback_errors = rollback_files(
            target_path,
            &mut dll_backup,
            Some(auto_update_config_path),
            config_backup.as_mut(),
            disable_auto_update && !config_existed,
            &mut replace_file,
        );
        return Err(with_rollback_errors(
            format!("Failed to save launcher settings after replacing the custom DLL: {error}"),
            rollback_errors,
        ));
    }

    // 設定保存が完了した時点でコミット。バックアップは永続化しない。
    remove_temporary_file(dll_backup.path());
    if let Some(backup) = &config_backup {
        remove_temporary_file(backup.path());
    }
    if let Some(created_directories) = &mut created_config_directories {
        created_directories.keep();
    }

    Ok(CustomDllInstallResult {
        target_path: target_path.to_string_lossy().to_string(),
        sha256,
        release_tag,
        auto_update_config_updated: disable_auto_update || config_existed,
    })
}

fn validate_source_and_target(source_path: &Path, target_path: &Path) -> Result<(), String> {
    if source_path.as_os_str().is_empty() {
        return Err("A source DLL path is required.".to_string());
    }

    let target_metadata = fs::metadata(target_path).map_err(|error| {
        if error.kind() == io::ErrorKind::NotFound {
            format!(
                "The profile mod DLL to replace does not exist: {}",
                target_path.display()
            )
        } else {
            format!(
                "Failed to inspect profile mod DLL '{}': {error}",
                target_path.display()
            )
        }
    })?;
    if !target_metadata.is_file() {
        return Err(format!(
            "The profile mod DLL target is not a file: {}",
            target_path.display()
        ));
    }

    let source_metadata = fs::metadata(source_path).map_err(|error| {
        if error.kind() == io::ErrorKind::NotFound {
            format!("The selected DLL does not exist: {}", source_path.display())
        } else {
            format!(
                "Failed to inspect selected DLL '{}': {error}",
                source_path.display()
            )
        }
    })?;
    if !source_metadata.is_file() {
        return Err(format!(
            "The selected DLL path is not a file: {}",
            source_path.display()
        ));
    }
    if source_metadata.len() == 0 {
        return Err(format!(
            "The selected DLL is empty: {}",
            source_path.display()
        ));
    }

    let extension_is_dll = source_path
        .extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| extension.eq_ignore_ascii_case("dll"));
    if !extension_is_dll {
        return Err(format!(
            "The selected file must have a .dll extension: {}",
            source_path.display()
        ));
    }

    let expected_name = target_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| {
            format!(
                "The configured mod DLL target has an invalid file name: {}",
                target_path.display()
            )
        })?;
    let source_name = source_path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or_else(|| "The selected DLL has an invalid file name.".to_string())?;
    if !source_name.eq_ignore_ascii_case(expected_name) {
        return Err(format!(
            "The selected DLL must be named '{expected_name}' (case-insensitive)."
        ));
    }

    let source_canonical = fs::canonicalize(source_path).map_err(|error| {
        format!(
            "Failed to resolve selected DLL path '{}': {error}",
            source_path.display()
        )
    })?;
    let target_canonical = fs::canonicalize(target_path).map_err(|error| {
        format!(
            "Failed to resolve profile mod DLL path '{}': {error}",
            target_path.display()
        )
    })?;
    if source_canonical == target_canonical {
        return Err("The selected DLL is already the profile DLL target.".to_string());
    }

    Ok(())
}

fn stage_source_dll(
    source_path: &Path,
    target_parent: &Path,
    target_path: &Path,
) -> Result<(TemporaryFile, String), String> {
    let mut source = File::open(source_path).map_err(|error| {
        format!(
            "Failed to open selected DLL '{}': {error}",
            source_path.display()
        )
    })?;
    let (staging_path, mut staging_file) = create_temporary_file(target_path, "stage")?;
    let staging = TemporaryFile::new(staging_path.clone());
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 64 * 1024];
    let mut copied = 0_u64;

    loop {
        let read = source.read(&mut buffer).map_err(|error| {
            format!(
                "Failed to read selected DLL '{}': {error}",
                source_path.display()
            )
        })?;
        if read == 0 {
            break;
        }
        staging_file.write_all(&buffer[..read]).map_err(|error| {
            format!(
                "Failed to stage selected DLL in '{}': {error}",
                target_parent.display()
            )
        })?;
        hasher.update(&buffer[..read]);
        copied += read as u64;
    }

    if copied == 0 {
        return Err(format!(
            "The selected DLL became empty while it was being copied: {}",
            source_path.display()
        ));
    }
    staging_file.sync_all().map_err(|error| {
        format!(
            "Failed to synchronize staged DLL '{}': {error}",
            staging_path.display()
        )
    })?;
    drop(staging_file);

    Ok((staging, format!("{:x}", hasher.finalize())))
}

fn disabled_auto_update_config(path: &Path) -> Result<(Vec<u8>, bool), String> {
    let (existing, existed) = match fs::read(path) {
        Ok(contents) => (Some(contents), true),
        Err(error) if error.kind() == io::ErrorKind::NotFound => (None, false),
        Err(error) => {
            return Err(format!(
                "Failed to read auto-update config '{}': {error}",
                path.display()
            ))
        }
    };

    let mut object = existing
        .as_deref()
        .and_then(|contents| serde_json::from_slice::<Value>(contents).ok())
        .and_then(|value| value.as_object().cloned())
        .unwrap_or_else(canonical_disabled_auto_update_object);
    object.insert(
        "updateType".to_string(),
        Value::String("disable".to_string()),
    );

    let mut serialized = serde_json::to_vec_pretty(&Value::Object(object)).map_err(|error| {
        format!(
            "Failed to serialize disabled auto-update config '{}': {error}",
            path.display()
        )
    })?;
    serialized.push(b'\n');
    Ok((serialized, existed))
}

fn canonical_disabled_auto_update_object() -> Map<String, Value> {
    let mut object = Map::new();
    object.insert(
        "updateType".to_string(),
        Value::String("disable".to_string()),
    );
    object.insert("version".to_string(), Value::Null);
    object.insert("channel".to_string(), Value::String("all".to_string()));
    object
}

fn stage_bytes(target_path: &Path, contents: &[u8], label: &str) -> Result<TemporaryFile, String> {
    let (staging_path, mut staging_file) = create_temporary_file(target_path, label)?;
    let staging = TemporaryFile::new(staging_path.clone());
    staging_file.write_all(contents).map_err(|error| {
        format!(
            "Failed to write temporary file '{}' for '{}': {error}",
            staging_path.display(),
            target_path.display()
        )
    })?;
    staging_file.sync_all().map_err(|error| {
        format!(
            "Failed to synchronize temporary file '{}' for '{}': {error}",
            staging_path.display(),
            target_path.display()
        )
    })?;
    drop(staging_file);
    Ok(staging)
}

fn backup_file(path: &Path) -> Result<TemporaryFile, String> {
    let mut source = File::open(path).map_err(|error| {
        format!(
            "Failed to open file for backup '{}': {error}",
            path.display()
        )
    })?;
    let (backup_path, mut backup_file) = create_temporary_file(path, "backup")?;
    let backup = TemporaryFile::new(backup_path.clone());
    io::copy(&mut source, &mut backup_file).map_err(|error| {
        format!(
            "Failed to create transaction backup '{}' for '{}': {error}",
            backup_path.display(),
            path.display()
        )
    })?;
    backup_file.sync_all().map_err(|error| {
        format!(
            "Failed to synchronize transaction backup '{}' for '{}': {error}",
            backup_path.display(),
            path.display()
        )
    })?;
    drop(backup_file);
    Ok(backup)
}

fn create_temporary_file(target_path: &Path, label: &str) -> Result<(PathBuf, File), String> {
    let parent = target_path.parent().ok_or_else(|| {
        format!(
            "Target path has no parent directory: {}",
            target_path.display()
        )
    })?;
    let file_name = target_path
        .file_name()
        .map(|name| name.to_string_lossy())
        .unwrap_or_else(|| "file".into());

    for _ in 0..1000 {
        let sequence = TEMP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
        let candidate = parent.join(format!(
            ".{file_name}.custom-dll.{}.{}.{label}",
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
                    "Failed to create temporary file '{}' next to '{}': {error}",
                    candidate.display(),
                    target_path.display()
                ))
            }
        }
    }

    Err(format!(
        "Failed to allocate a temporary file next to '{}' after 1000 attempts.",
        target_path.display()
    ))
}

fn ensure_directory(path: &Path) -> Result<CreatedDirectories, String> {
    let mut missing = Vec::new();
    let mut current = path;
    while !current.exists() {
        missing.push(current.to_path_buf());
        current = current.parent().ok_or_else(|| {
            format!(
                "Cannot resolve an existing ancestor for directory '{}'.",
                path.display()
            )
        })?;
    }
    if !current.is_dir() {
        return Err(format!(
            "Cannot create auto-update config directory because '{}' is not a directory.",
            current.display()
        ));
    }

    let cleanup = CreatedDirectories {
        paths: missing,
        keep: false,
    };
    fs::create_dir_all(path).map_err(|error| {
        format!(
            "Failed to create auto-update config directory '{}': {error}",
            path.display()
        )
    })?;
    Ok(cleanup)
}

fn rollback_files<ReplaceFile>(
    target_path: &Path,
    dll_backup: &mut TemporaryFile,
    config_path: Option<&Path>,
    config_backup: Option<&mut TemporaryFile>,
    remove_created_config: bool,
    replace_file: &mut ReplaceFile,
) -> Vec<String>
where
    ReplaceFile: FnMut(&Path, &Path, ReplaceOperation) -> io::Result<()>,
{
    let mut errors = Vec::new();

    if let Some(config_path) = config_path {
        if let Some(backup) = config_backup {
            let backup_path = backup.path().to_path_buf();
            if let Err(error) = replace_file(
                backup.path(),
                config_path,
                ReplaceOperation::AutoUpdateConfigRollback,
            ) {
                backup.keep();
                errors.push(format!(
                    "failed to restore auto-update config '{}': {error}; backup retained at '{}'",
                    config_path.display(),
                    backup_path.display()
                ));
            }
        } else if remove_created_config {
            match fs::remove_file(config_path) {
                Ok(()) => {}
                Err(error) if error.kind() == io::ErrorKind::NotFound => {}
                Err(error) => errors.push(format!(
                    "failed to remove newly created auto-update config '{}': {error}",
                    config_path.display()
                )),
            }
        }
    }

    let dll_backup_path = dll_backup.path().to_path_buf();
    if let Err(error) = replace_file(&dll_backup_path, target_path, ReplaceOperation::DllRollback) {
        dll_backup.keep();
        errors.push(format!(
            "failed to restore profile mod DLL '{}': {error}; backup retained at '{}'",
            target_path.display(),
            dll_backup_path.display()
        ));
    }

    errors
}

fn with_rollback_errors(message: String, rollback_errors: Vec<String>) -> String {
    if rollback_errors.is_empty() {
        message
    } else {
        format!(
            "{message} Rollback also failed: {}",
            rollback_errors.join("; ")
        )
    }
}

fn remove_temporary_file(path: &Path) {
    if let Err(error) = fs::remove_file(path) {
        if error.kind() != io::ErrorKind::NotFound {
            eprintln!(
                "Failed to remove custom DLL transaction file '{}': {error}",
                path.display()
            );
        }
    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::utils::settings::{GamePlatform, LauncherSettings};
    use std::cell::RefCell;
    use std::time::{SystemTime, UNIX_EPOCH};

    struct TestDirectory(PathBuf);

    impl TestDirectory {
        fn new(label: &str) -> Self {
            let timestamp = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            Self(std::env::temp_dir().join(format!(
                "snr-custom-dll-{label}-{}-{timestamp}",
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

    struct Fixture {
        directory: TestDirectory,
        source: PathBuf,
        target: PathBuf,
        config: PathBuf,
    }

    impl Fixture {
        fn new(label: &str, source_contents: &[u8], target_contents: &[u8]) -> Self {
            let directory = TestDirectory::new(label);
            let source = directory.path().join("selected").join("SuperNewRoles.dll");
            let target = directory
                .path()
                .join("profile")
                .join("BepInEx")
                .join("plugins")
                .join("SuperNewRoles.dll");
            let config = directory
                .path()
                .join("profile")
                .join("BepInEx")
                .join("patchers")
                .join("snrupdate.json");
            fs::create_dir_all(source.parent().expect("source parent"))
                .expect("create source parent");
            fs::create_dir_all(target.parent().expect("target parent"))
                .expect("create target parent");
            fs::write(&source, source_contents).expect("write source DLL");
            fs::write(&target, target_contents).expect("write target DLL");
            Self {
                directory,
                source,
                target,
                config,
            }
        }

        fn launcher_settings(&self) -> LauncherSettings {
            LauncherSettings {
                among_us_path: String::new(),
                game_platform: GamePlatform::Steam,
                selected_release_tag: "v-old".to_string(),
                selected_game_server_id: String::new(),
                profile_path: self
                    .directory
                    .path()
                    .join("profile")
                    .to_string_lossy()
                    .to_string(),
                close_to_tray_on_close: true,
                close_webview_on_tray_background: true,
                report_notifications_enabled: true,
                announce_notifications_enabled: true,
                ui_locale: "ja".to_string(),
                onboarding_completed: true,
            }
        }

        fn install<SaveSettings, ReplaceFile>(
            &self,
            disable_auto_update: bool,
            save_settings: SaveSettings,
            replace_file: ReplaceFile,
        ) -> Result<CustomDllInstallResult, String>
        where
            SaveSettings: FnOnce(&LauncherSettings) -> Result<(), String>,
            ReplaceFile: FnMut(&Path, &Path, ReplaceOperation) -> io::Result<()>,
        {
            install_custom_dll_transaction(
                &self.source,
                &self.target,
                &self.config,
                disable_auto_update,
                &self.launcher_settings(),
                save_settings,
                replace_file,
            )
        }

        fn transaction_files(&self) -> Vec<PathBuf> {
            let mut transaction_files = Vec::new();
            let mut pending = vec![self.directory.path().to_path_buf()];
            while let Some(directory) = pending.pop() {
                if !directory.exists() {
                    continue;
                }
                for entry in fs::read_dir(&directory).expect("read test directory") {
                    let entry = entry.expect("read test entry");
                    let path = entry.path();
                    if path.is_dir() {
                        pending.push(path);
                    } else if entry.file_name().to_string_lossy().contains(".custom-dll.") {
                        transaction_files.push(path);
                    }
                }
            }
            transaction_files
        }

        fn assert_no_transaction_files(&self) {
            let transaction_files = self.transaction_files();
            assert!(
                transaction_files.is_empty(),
                "transaction files were not cleaned up: {transaction_files:?}"
            );
        }
    }

    fn production_replace(
        source: &Path,
        destination: &Path,
        _operation: ReplaceOperation,
    ) -> io::Result<()> {
        atomic_replace_file(source, destination)
    }

    #[test]
    fn installs_dll_hashes_it_updates_tag_and_preserves_json_keys() {
        let fixture = Fixture::new("happy", b"abc", b"official DLL");
        fs::create_dir_all(fixture.config.parent().expect("config parent"))
            .expect("create config parent");
        fs::write(
            &fixture.config,
            br#"{"updateType":"all","version":"v1","unknown":{"enabled":true}}"#,
        )
        .expect("write update config");
        let saved_settings = RefCell::new(None);

        let result = fixture
            .install(
                true,
                |settings| {
                    saved_settings.replace(Some(settings.clone()));
                    Ok(())
                },
                production_replace,
            )
            .expect("custom DLL install should succeed");

        let expected_hash = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
        assert_eq!(fs::read(&fixture.target).expect("read target"), b"abc");
        assert_eq!(result.sha256, expected_hash);
        assert_eq!(result.release_tag, format!("custom:{expected_hash}"));
        assert_eq!(result.target_path, fixture.target.to_string_lossy());
        assert!(result.auto_update_config_updated);
        let saved = saved_settings
            .borrow()
            .clone()
            .expect("settings should be saved");
        assert_eq!(saved.selected_release_tag, result.release_tag);

        let config: Value = serde_json::from_slice(
            &fs::read(&fixture.config).expect("read updated auto-update config"),
        )
        .expect("updated config should be JSON");
        assert_eq!(config["updateType"], "disable");
        assert_eq!(config["version"], "v1");
        assert_eq!(config["unknown"]["enabled"], true);

        let dto = serde_json::to_value(&result).expect("serialize result DTO");
        assert!(dto.get("targetPath").is_some());
        assert!(dto.get("sha256").is_some());
        assert!(dto.get("releaseTag").is_some());
        assert!(dto.get("autoUpdateConfigUpdated").is_some());
        fixture.assert_no_transaction_files();
    }

    #[test]
    fn creates_canonical_disabled_config_when_missing() {
        let fixture = Fixture::new("missing-config", b"new DLL", b"old DLL");
        assert!(!fixture.config.exists());

        fixture
            .install(true, |_| Ok(()), production_replace)
            .expect("missing config should be created");

        let config: Value = serde_json::from_slice(
            &fs::read(&fixture.config).expect("read created auto-update config"),
        )
        .expect("created config should be JSON");
        assert_eq!(
            config,
            serde_json::json!({
                "updateType": "disable",
                "version": null,
                "channel": "all"
            })
        );
        fixture.assert_no_transaction_files();
    }

    #[test]
    fn repairs_malformed_and_non_object_configs() {
        for (label, original) in [
            ("malformed", b"{not-json".as_slice()),
            ("array", br#"["not", "an", "object"]"#.as_slice()),
        ] {
            let fixture = Fixture::new(label, b"new DLL", b"old DLL");
            fs::create_dir_all(fixture.config.parent().expect("config parent"))
                .expect("create config parent");
            fs::write(&fixture.config, original).expect("write invalid config");

            fixture
                .install(true, |_| Ok(()), production_replace)
                .expect("invalid config should be repaired");

            let config: Value = serde_json::from_slice(
                &fs::read(&fixture.config).expect("read repaired auto-update config"),
            )
            .expect("repaired config should be JSON");
            assert_eq!(config["updateType"], "disable");
            assert!(config["version"].is_null());
            assert_eq!(config["channel"], "all");
            fixture.assert_no_transaction_files();
        }
    }

    #[test]
    fn enabling_auto_update_removes_existing_disable_config() {
        let fixture = Fixture::new("config-enabled", b"new DLL", b"old DLL");
        fs::create_dir_all(fixture.config.parent().expect("config parent"))
            .expect("create config parent");
        fs::write(&fixture.config, b"disabled marker").expect("write config marker");

        let result = fixture
            .install(false, |_| Ok(()), production_replace)
            .expect("enabling auto-update should succeed");

        assert!(result.auto_update_config_updated);
        assert!(!fixture.config.exists());
        fixture.assert_no_transaction_files();
    }

    #[test]
    fn enabling_auto_update_does_not_create_missing_config() {
        let fixture = Fixture::new("config-already-enabled", b"new DLL", b"old DLL");

        let result = fixture
            .install(false, |_| Ok(()), production_replace)
            .expect("missing auto-update config should remain missing");

        assert!(!result.auto_update_config_updated);
        assert!(!fixture.config.exists());
        fixture.assert_no_transaction_files();
    }

    #[test]
    fn rejects_invalid_sources_and_missing_target() {
        let fixture = Fixture::new("invalid", b"valid DLL", b"old DLL");
        let selected_dir = fixture.source.parent().expect("selected directory");

        let missing = selected_dir.join("missing").join("SuperNewRoles.dll");
        assert!(validate_source_and_target(&missing, &fixture.target)
            .expect_err("missing source should fail")
            .contains("does not exist"));

        let directory_source = selected_dir.join("directory").join("SuperNewRoles.dll");
        fs::create_dir_all(&directory_source).expect("create directory source");
        assert!(
            validate_source_and_target(&directory_source, &fixture.target)
                .expect_err("directory source should fail")
                .contains("not a file")
        );

        let empty = selected_dir.join("empty").join("SuperNewRoles.dll");
        fs::create_dir_all(empty.parent().expect("empty parent")).expect("create empty parent");
        fs::write(&empty, b"").expect("write empty DLL");
        assert!(validate_source_and_target(&empty, &fixture.target)
            .expect_err("empty source should fail")
            .contains("empty"));

        let wrong_extension = selected_dir.join("SuperNewRoles.txt");
        fs::write(&wrong_extension, b"data").expect("write wrong extension");
        assert!(
            validate_source_and_target(&wrong_extension, &fixture.target)
                .expect_err("wrong extension should fail")
                .contains(".dll extension")
        );

        let wrong_name = selected_dir.join("AnotherMod.dll");
        fs::write(&wrong_name, b"data").expect("write wrong name");
        assert!(validate_source_and_target(&wrong_name, &fixture.target)
            .expect_err("wrong name should fail")
            .contains("must be named"));

        assert!(validate_source_and_target(&fixture.target, &fixture.target)
            .expect_err("same path should fail")
            .contains("already the profile DLL target"));

        let missing_target = fixture
            .directory
            .path()
            .join("missing-profile")
            .join("SuperNewRoles.dll");
        assert!(validate_source_and_target(&fixture.source, &missing_target)
            .expect_err("missing target should fail")
            .contains("does not exist"));
    }

    #[test]
    fn accepts_expected_file_name_case_insensitively() {
        let fixture = Fixture::new("case-name", b"valid DLL", b"old DLL");
        let upper_case_source = fixture
            .directory
            .path()
            .join("case-selected")
            .join("supernewroles.DLL");
        fs::create_dir_all(upper_case_source.parent().expect("case source parent"))
            .expect("create case source parent");
        fs::write(&upper_case_source, b"valid DLL").expect("write case source");

        validate_source_and_target(&upper_case_source, &fixture.target)
            .expect("case-insensitive expected name should be accepted");
    }

    #[test]
    fn settings_save_failure_restores_dll_and_existing_config() {
        let fixture = Fixture::new("settings-rollback", b"new DLL", b"old DLL");
        let original_config = br#"{"updateType":"all","custom":42}"#;
        fs::create_dir_all(fixture.config.parent().expect("config parent"))
            .expect("create config parent");
        fs::write(&fixture.config, original_config).expect("write original config");
        let original_settings = fixture.launcher_settings();

        let error = install_custom_dll_transaction(
            &fixture.source,
            &fixture.target,
            &fixture.config,
            true,
            &original_settings,
            |updated| {
                assert!(updated.selected_release_tag.starts_with("custom:"));
                assert_eq!(
                    fs::read(&fixture.target).expect("read applied DLL"),
                    b"new DLL"
                );
                Err("simulated settings failure".to_string())
            },
            production_replace,
        )
        .expect_err("settings failure should abort transaction");

        assert!(error.contains("simulated settings failure"));
        assert_eq!(
            fs::read(&fixture.target).expect("read restored DLL"),
            b"old DLL"
        );
        assert_eq!(
            fs::read(&fixture.config).expect("read restored config"),
            original_config
        );
        assert_eq!(original_settings.selected_release_tag, "v-old");
        fixture.assert_no_transaction_files();
    }

    #[test]
    fn settings_save_failure_restores_config_removed_while_enabling_updates() {
        let fixture = Fixture::new("enable-settings-rollback", b"new DLL", b"old DLL");
        let original_config = b"disabled marker";
        fs::create_dir_all(fixture.config.parent().expect("config parent"))
            .expect("create config parent");
        fs::write(&fixture.config, original_config).expect("write original config");

        fixture
            .install(
                false,
                |_| Err("simulated settings failure".to_string()),
                production_replace,
            )
            .expect_err("settings failure should restore the removed config");

        assert_eq!(
            fs::read(&fixture.target).expect("read restored DLL"),
            b"old DLL"
        );
        assert_eq!(
            fs::read(&fixture.config).expect("read restored config"),
            original_config
        );
        fixture.assert_no_transaction_files();
    }

    #[test]
    fn rollback_failures_retain_recovery_backups() {
        let fixture = Fixture::new("rollback-failure", b"new DLL", b"old DLL");
        let original_config = br#"{"updateType":"all","custom":42}"#;
        fs::create_dir_all(fixture.config.parent().expect("config parent"))
            .expect("create config parent");
        fs::write(&fixture.config, original_config).expect("write original config");

        let error = fixture
            .install(
                true,
                |_| Err("simulated settings failure".to_string()),
                |source, destination, operation| match operation {
                    ReplaceOperation::AutoUpdateConfigRollback => Err(io::Error::new(
                        io::ErrorKind::PermissionDenied,
                        "simulated config rollback failure",
                    )),
                    ReplaceOperation::DllRollback => Err(io::Error::new(
                        io::ErrorKind::PermissionDenied,
                        "simulated DLL rollback failure",
                    )),
                    _ => atomic_replace_file(source, destination),
                },
            )
            .expect_err("rollback failures should abort the transaction");

        assert!(error.contains("simulated config rollback failure"));
        assert!(error.contains("simulated DLL rollback failure"));
        assert!(error.contains("backup retained at"));

        let backup_files = fixture.transaction_files();
        assert_eq!(backup_files.len(), 2, "both backups should be retained");
        assert!(backup_files
            .iter()
            .all(|path| path.to_string_lossy().ends_with(".backup")));
        let backup_contents = backup_files
            .iter()
            .map(|path| fs::read(path).expect("read retained backup"))
            .collect::<Vec<_>>();
        assert!(backup_contents
            .iter()
            .any(|contents| contents == b"old DLL"));
        assert!(backup_contents
            .iter()
            .any(|contents| contents == original_config));
    }

    #[test]
    fn settings_failure_removes_new_config_and_directories() {
        let fixture = Fixture::new("missing-config-rollback", b"new DLL", b"old DLL");
        let patchers_directory = fixture
            .config
            .parent()
            .expect("config parent")
            .to_path_buf();
        assert!(!patchers_directory.exists());

        fixture
            .install(
                true,
                |_| Err("simulated settings failure".to_string()),
                production_replace,
            )
            .expect_err("settings failure should abort transaction");

        assert_eq!(
            fs::read(&fixture.target).expect("read restored DLL"),
            b"old DLL"
        );
        assert!(!fixture.config.exists());
        assert!(!patchers_directory.exists());
        fixture.assert_no_transaction_files();
    }

    #[test]
    fn config_replace_failure_rolls_back_dll_and_cleans_temporary_files() {
        let fixture = Fixture::new("config-replace-failure", b"new DLL", b"old DLL");
        let original_config = br#"{"updateType":"all"}"#;
        fs::create_dir_all(fixture.config.parent().expect("config parent"))
            .expect("create config parent");
        fs::write(&fixture.config, original_config).expect("write original config");

        let error = fixture
            .install(
                true,
                |_| panic!("settings must not be saved after config replacement failure"),
                |source, destination, operation| {
                    if operation == ReplaceOperation::AutoUpdateConfigApply {
                        return Err(io::Error::new(
                            io::ErrorKind::PermissionDenied,
                            "simulated config replacement failure",
                        ));
                    }
                    atomic_replace_file(source, destination)
                },
            )
            .expect_err("config replacement failure should abort transaction");

        assert!(error.contains("simulated config replacement failure"));
        assert_eq!(
            fs::read(&fixture.target).expect("read restored DLL"),
            b"old DLL"
        );
        assert_eq!(
            fs::read(&fixture.config).expect("read untouched config"),
            original_config
        );
        fixture.assert_no_transaction_files();
    }

    #[test]
    fn dll_replace_failure_keeps_every_original_file() {
        let fixture = Fixture::new("dll-replace-failure", b"new DLL", b"old DLL");
        let original_config = br#"{"updateType":"all"}"#;
        fs::create_dir_all(fixture.config.parent().expect("config parent"))
            .expect("create config parent");
        fs::write(&fixture.config, original_config).expect("write original config");

        let error = fixture
            .install(
                true,
                |_| panic!("settings must not be saved after DLL replacement failure"),
                |_source, _destination, operation| {
                    assert_eq!(operation, ReplaceOperation::DllApply);
                    Err(io::Error::new(
                        io::ErrorKind::PermissionDenied,
                        "simulated DLL replacement failure",
                    ))
                },
            )
            .expect_err("DLL replacement failure should abort transaction");

        assert!(error.contains("simulated DLL replacement failure"));
        assert_eq!(
            fs::read(&fixture.target).expect("read original DLL"),
            b"old DLL"
        );
        assert_eq!(
            fs::read(&fixture.config).expect("read original config"),
            original_config
        );
        fixture.assert_no_transaction_files();
    }
}
