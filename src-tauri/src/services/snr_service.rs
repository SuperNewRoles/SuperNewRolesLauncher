//! SNR配布物の取得・展開・退避復元を扱うサービス層。
//! commands層から呼び出される実処理をここに集約する。

use crate::utils::{download, migration, presets, settings, zip};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::{AppHandle, Emitter, Runtime};

const RELEASES_API_URL: &str =
    "https://api.github.com/repos/SuperNewRoles/SuperNewRoles/releases?per_page=30";
const RELEASE_BY_TAG_API_URL: &str =
    "https://api.github.com/repos/SuperNewRoles/SuperNewRoles/releases/tags";
const PATCHER_MANIFEST_URL: &str = "https://update.supernewroles.com/patchers/data.json";
const PATCHER_BASE_URL: &str = "https://update.supernewroles.com/patchers/";
const PRESERVED_SAVE_DATA_DIR: &str = "preserved_save_data";
const AMONG_US_EXE: &str = "Among Us.exe";
const SOURCE_SAVE_DATA_RELATIVE_PATH: [&str; 2] = ["SuperNewRolesNext", "SaveData"];
const SAVE_DATA_STAGING_DIR_NAME: &str = "SaveData._import_staging";
const SAVE_DATA_BACKUP_DIR_NAME: &str = "SaveData._import_backup";

// インストール全体の進捗(0-100)へ統合するための配分。
// downloading/extracting は各ステージの 0-100 をこの範囲へ線形変換する。
const INSTALL_DOWNLOAD_END: f64 = 80.0;
const INSTALL_EXTRACT_END: f64 = 98.0;
const INSTALL_PATCHERS_END: f64 = 99.0;
const INSTALL_RESTORE_END: f64 = 100.0;

fn scale_progress(stage_percent: f64, start: f64, end: f64) -> f64 {
    let ratio = stage_percent.clamp(0.0, 100.0) / 100.0;
    start + (end - start) * ratio
}

fn map_install_progress(stage: &str, stage_percent: f64) -> f64 {
    let clamped = stage_percent.clamp(0.0, 100.0);
    match stage {
        // resolving は短時間のため 0% のまま扱い、download 開始から可視進捗を進める。
        "resolving" => 0.0,
        "downloading" => scale_progress(clamped, 0.0, INSTALL_DOWNLOAD_END),
        "extracting" => scale_progress(clamped, INSTALL_DOWNLOAD_END, INSTALL_EXTRACT_END),
        "patchers" => scale_progress(clamped, INSTALL_EXTRACT_END, INSTALL_PATCHERS_END),
        "restoring" => scale_progress(clamped, INSTALL_PATCHERS_END, INSTALL_RESTORE_END),
        "complete" => 100.0,
        "failed" => 0.0,
        _ => clamped,
    }
}

#[derive(Debug, Deserialize)]
struct GitHubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Debug, Deserialize)]
struct GitHubRelease {
    tag_name: String,
    name: Option<String>,
    prerelease: bool,
    published_at: Option<String>,
    assets: Vec<GitHubAsset>,
}

#[derive(Debug, Deserialize)]
struct PatchersManifestPayload {
    #[serde(default)]
    windows: Vec<String>,
    #[serde(flatten)]
    hashes: HashMap<String, String>,
}

#[derive(Debug, Clone)]
struct PatchFile {
    name: String,
    expected_md5: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SnrReleaseSummary {
    pub tag: String,
    pub name: String,
    pub published_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallResult {
    pub tag: String,
    pub platform: String,
    pub asset_name: String,
    pub profile_path: String,
    pub restored_save_files: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UninstallResult {
    pub profile_path: String,
    pub removed_profile: bool,
    pub preserved_files: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreservedSaveDataStatus {
    pub available: bool,
    pub files: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDataPresetSummary {
    pub id: i32,
    pub name: String,
    pub has_data_file: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDataPreviewResult {
    pub source_among_us_path: String,
    pub source_save_data_path: String,
    pub presets: Vec<SaveDataPresetSummary>,
    pub file_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDataImportResult {
    pub source_save_data_path: String,
    pub target_save_data_path: String,
    pub imported_files: usize,
    pub imported_presets: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveDataPresetMergeResult {
    pub source_save_data_path: String,
    pub imported_presets: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallProgressPayload {
    stage: String,
    progress: f64,
    message: String,
    downloaded: Option<u64>,
    total: Option<u64>,
    current: Option<usize>,
    entries_total: Option<usize>,
}

#[allow(clippy::too_many_arguments)]
fn emit_progress<R: Runtime>(
    app: &AppHandle<R>,
    stage: &str,
    progress: f64,
    message: impl Into<String>,
    downloaded: Option<u64>,
    total: Option<u64>,
    current: Option<usize>,
    entries_total: Option<usize>,
) {
    let progress = map_install_progress(stage, progress);
    let _ = app.emit(
        "snr-install-progress",
        InstallProgressPayload {
            stage: stage.to_string(),
            progress,
            message: message.into(),
            downloaded,
            total,
            current,
            entries_total,
        },
    );
}

async fn fetch_patcher_manifest(client: &Client) -> Result<Vec<PatchFile>, String> {
    let response = client
        .get(PATCHER_MANIFEST_URL)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch patcher manifest: {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Failed to fetch patcher manifest (status {})",
            response.status()
        ));
    }

    let payload = response
        .json::<Value>()
        .await
        .map_err(|e| format!("Failed to parse patcher manifest: {e}"))?;

    let windows = match payload.get("windows").and_then(Value::as_array) {
        Some(items) => items,
        None => return Ok(Vec::new()),
    };

    let mut windows_hashes = HashMap::new();
    if let Some(object) = payload.as_object() {
        for (name, hash_value) in object {
            if name == "windows" {
                continue;
            }
            if let Some(hash) = hash_value.as_str() {
                if !hash.trim().is_empty() {
                    windows_hashes.insert(name.clone(), hash.to_string());
                }
            }
        }
    }

    let payload = PatchersManifestPayload {
        windows: windows
            .iter()
            .filter_map(|file| file.as_str().map(str::trim).filter(|name| !name.is_empty()))
            .map(ToString::to_string)
            .collect(),
        hashes: windows_hashes,
    };

    Ok(payload
        .windows
        .iter()
        .map(|name| PatchFile {
            name: name.to_string(),
            expected_md5: payload.hashes.get(name).cloned(),
        })
        .collect())
}

fn safe_patcher_name(name: &str) -> bool {
    let name = name.trim();
    if name.is_empty() {
        return false;
    }

    if name == "." || name == ".." {
        return false;
    }

    if name.contains('/') || name.contains('\\') {
        return false;
    }

    let path = Path::new(name);
    if path.is_absolute() {
        return false;
    }

    if path
        .components()
        .any(|component| matches!(component, Component::ParentDir | Component::RootDir | Component::Prefix(_)))
    {
        return false;
    }

    path.file_name().and_then(|file_name| file_name.to_str()) == Some(name)
}

fn verify_md5(path: &Path, expected: &str) -> Result<(), String> {
    if expected.trim().is_empty() {
        return Ok(());
    }

    let actual = fs::read(path)
        .map_err(|e| format!("Failed to read patcher '{}': {e}", path.display()))
        .map(|bytes| format!("{:x}", md5::compute(bytes)))?;

    let actual = actual.to_ascii_lowercase();
    let expected = expected.trim().to_ascii_lowercase();

    if actual == expected {
        Ok(())
    } else {
        Err(format!(
            "MD5 mismatch for '{}': expected '{expected}', got '{actual}'",
            path.display()
        ))
    }
}

async fn download_patchers_into_staging<R: Runtime>(
    app: &AppHandle<R>,
    client: &Client,
    staging_path: &Path,
) -> Result<Vec<String>, String> {
    let patchers = fetch_patcher_manifest(client).await?;
    if patchers.is_empty() {
        emit_progress(
            app,
            "patchers",
            100.0,
            "No windows patchers listed; skipping patcher synchronization.",
            None,
            None,
            Some(0),
            Some(0),
        );
        return Ok(Vec::new());
    }

    let patchers_dir = staging_path.join("BepInEx").join("patchers");
    fs::create_dir_all(&patchers_dir)
        .map_err(|e| format!("Failed to create patchers directory '{}': {e}", patchers_dir.display()))?;

    let total_patchers = patchers.len();
    emit_progress(
        app,
        "patchers",
        0.0,
        "Preparing patchers...",
        None,
        None,
        Some(0),
        Some(total_patchers),
    );

    let mut skipped: Vec<String> = Vec::new();

    for (index, patcher) in patchers.iter().enumerate() {
        let index = index + 1;
        let name = patcher.name.trim();
        let base_progress = ((index - 1) as f64 / total_patchers as f64) * 100.0;

        if !safe_patcher_name(name) {
            skipped.push(name.to_string());
            emit_progress(
                app,
                "patchers",
                (index as f64 / total_patchers as f64) * 100.0,
                "Skipping unsafe patcher",
                None,
                None,
                Some(index),
                Some(total_patchers),
            );
            continue;
        }

        let destination = patchers_dir.join(name);
        let encoded_name = urlencoding::encode(name);
        let url = format!("{PATCHER_BASE_URL}{encoded_name}");

        let download_result = download::download_file(
            client,
            &url,
            &destination,
            |downloaded, total| {
                let file_percent = total
                    .map(|size| (downloaded as f64 / size as f64) * 100.0)
                    .unwrap_or(0.0);
                let stage_percent = base_progress + file_percent / total_patchers as f64;
                emit_progress(
                    app,
                    "patchers",
                    stage_percent.clamp(0.0, 100.0),
                    format!("Downloading patcher {index}/{total_patchers}"),
                    Some(downloaded),
                    total,
                    Some(index),
                    Some(total_patchers),
                );
            },
        )
        .await;

        if let Err(error) = download_result {
            skipped.push(name.to_string());
            emit_progress(
                app,
                "patchers",
                (index as f64 / total_patchers as f64) * 100.0,
                format!("Download failed ({index}/{total_patchers}): {error}"),
                None,
                None,
                Some(index),
                Some(total_patchers),
            );
            eprintln!("Failed to download patcher '{name}': {error}");
            let _ = fs::remove_file(&destination);
            continue;
        }

        if let Some(expected_md5) = patcher.expected_md5.as_deref() {
            if let Err(error) = verify_md5(&destination, expected_md5) {
                skipped.push(name.to_string());
                emit_progress(
                    app,
                    "patchers",
                    (index as f64 / total_patchers as f64) * 100.0,
                    format!("MD5 mismatch ({index}/{total_patchers}): {error}"),
                    None,
                    None,
                    Some(index),
                    Some(total_patchers),
                );
                eprintln!("Failed to verify patcher '{name}': {error}");
                let _ = fs::remove_file(&destination);
                continue;
            }
        }

        emit_progress(
            app,
            "patchers",
            (index as f64 / total_patchers as f64) * 100.0,
            format!("Patchers ok ({index}/{total_patchers})"),
            None,
            None,
            Some(index),
            Some(total_patchers),
        );
    }

    if skipped.is_empty() {
        emit_progress(
            app,
            "patchers",
            100.0,
            format!("Downloaded {total_patchers} patcher file(s)."),
            None,
            None,
            Some(total_patchers),
            Some(total_patchers),
        );
    } else {
        emit_progress(
            app,
            "patchers",
            100.0,
            format!("Skipped {} patcher file(s)", skipped.len()),
            None,
            None,
            Some(total_patchers),
            Some(total_patchers),
        );
    }

    Ok(skipped)
}

fn resolve_asset<'a>(
    release: &'a GitHubRelease,
    platform: &settings::GamePlatform,
) -> Result<&'a GitHubAsset, String> {
    let suffix = match platform {
        settings::GamePlatform::Steam => "_Steam.zip",
        settings::GamePlatform::Epic => "_Epic.zip",
    };

    release
        .assets
        .iter()
        .find(|asset| asset.name.ends_with(suffix))
        .ok_or_else(|| {
            format!(
                "Release '{}' does not include an asset ending with '{}'",
                release.tag_name, suffix
            )
        })
}

fn make_profile_paths(profile_path: &Path) -> Result<(PathBuf, PathBuf), String> {
    let parent = profile_path
        .parent()
        .ok_or_else(|| "Profile path must have a parent directory".to_string())?;
    let base_name = profile_path
        .file_name()
        .and_then(|name| name.to_str())
        .filter(|name| !name.trim().is_empty())
        .ok_or_else(|| "Profile path must include a valid directory name".to_string())?;

    Ok((
        parent.join(format!("{base_name}._staging")),
        parent.join(format!("{base_name}._backup")),
    ))
}

fn clean_path(path: &Path) -> Result<(), String> {
    if !path.exists() {
        return Ok(());
    }

    if path.is_dir() {
        fs::remove_dir_all(path)
            .map_err(|e| format!("Failed to remove directory '{}': {e}", path.display()))?;
    } else {
        fs::remove_file(path)
            .map_err(|e| format!("Failed to remove file '{}': {e}", path.display()))?;
    }

    Ok(())
}

fn preserved_save_data_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(settings::app_data_dir(app)?.join(PRESERVED_SAVE_DATA_DIR))
}

fn validate_relative_path(path: &Path) -> Result<(), String> {
    if path.as_os_str().is_empty() {
        return Err("Relative path must not be empty".to_string());
    }

    if path.is_absolute()
        || path.components().any(|component| {
            matches!(
                component,
                Component::ParentDir | Component::RootDir | Component::Prefix(_)
            )
        })
    {
        return Err(format!(
            "Refused unsafe relative path for save data copy: {}",
            path.display()
        ));
    }

    Ok(())
}

fn collect_files_recursive(current: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    for entry in fs::read_dir(current)
        .map_err(|e| format!("Failed to read directory '{}': {e}", current.display()))?
    {
        let entry = entry.map_err(|e| {
            format!(
                "Failed to read directory entry '{}': {e}",
                current.display()
            )
        })?;
        let path = entry.path();

        if path.is_dir() {
            collect_files_recursive(&path, out)?;
            continue;
        }

        if path.is_file() {
            out.push(path);
        }
    }

    Ok(())
}

fn validate_source_among_us_path(source_among_us_path: &str) -> Result<PathBuf, String> {
    let trimmed = source_among_us_path.trim();
    if trimmed.is_empty() {
        return Err("Source Among Us path is required".to_string());
    }

    let among_us_path = PathBuf::from(trimmed);
    if !among_us_path.is_dir() {
        return Err(format!(
            "Source path is not a directory: {}",
            among_us_path.display()
        ));
    }

    if !among_us_path.join(AMONG_US_EXE).is_file() {
        return Err(format!(
            "The selected folder is not an Among Us installation directory: {}",
            among_us_path.display()
        ));
    }

    Ok(among_us_path)
}

fn source_save_data_path_from_among_us(among_us_path: &Path) -> PathBuf {
    among_us_path.join(SOURCE_SAVE_DATA_RELATIVE_PATH[0]).join(SOURCE_SAVE_DATA_RELATIVE_PATH[1])
}

fn resolve_source_save_data_path(source_among_us_path: &str) -> Result<(PathBuf, PathBuf), String> {
    let among_us_path = validate_source_among_us_path(source_among_us_path)?;
    let source_save_data_path = source_save_data_path_from_among_us(&among_us_path);
    if !source_save_data_path.is_dir() {
        return Err(format!(
            "SaveData directory was not found in the selected Among Us folder: {}",
            source_save_data_path.display()
        ));
    }

    Ok((among_us_path, source_save_data_path))
}

fn profile_save_data_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let mut launcher_settings = settings::load_or_init_settings(app)?;
    if launcher_settings.profile_path.trim().is_empty() {
        launcher_settings.profile_path = settings::default_profile_path(app)?
            .to_string_lossy()
            .to_string();
        settings::save_settings(app, &launcher_settings)?;
    }

    Ok(PathBuf::from(launcher_settings.profile_path.trim())
        .join("SuperNewRolesNext")
        .join("SaveData"))
}

fn copy_directory_recursive(source: &Path, destination: &Path) -> Result<(), String> {
    if !source.is_dir() {
        return Err(format!(
            "Source directory does not exist for SaveData import: {}",
            source.display()
        ));
    }

    fs::create_dir_all(destination).map_err(|e| {
        format!(
            "Failed to create SaveData import staging directory '{}': {e}",
            destination.display()
        )
    })?;

    let mut files = Vec::new();
    collect_files_recursive(source, &mut files)?;
    for source_file in files {
        let relative = source_file.strip_prefix(source).map_err(|_| {
            format!(
                "Failed to compute relative path during SaveData import copy: '{}' (source root '{}')",
                source_file.display(),
                source.display()
            )
        })?;

        let destination_file = destination.join(relative);
        if let Some(parent) = destination_file.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "Failed to create destination directory during SaveData import '{}': {e}",
                    parent.display()
                )
            })?;
        }

        fs::copy(&source_file, &destination_file).map_err(|e| {
            format!(
                "Failed to copy SaveData import file '{}' -> '{}': {e}",
                source_file.display(),
                destination_file.display()
            )
        })?;
    }

    Ok(())
}

fn clear_preserved_save_data<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let preserved_path = preserved_save_data_path(app)?;
    clean_path(&preserved_path)
}

fn preserve_profile_save_data<R: Runtime>(
    app: &AppHandle<R>,
    profile_path: &Path,
) -> Result<usize, String> {
    let files = migration::collect_supported_profile_save_files(profile_path)?;
    let file_count = files.len();
    let preserved_path = preserved_save_data_path(app)?;

    clean_path(&preserved_path)?;

    // 0件だった場合でも「前回保持を実行した」状態を識別できるよう、空ディレクトリを残す。
    fs::create_dir_all(&preserved_path).map_err(|e| {
        format!(
            "Failed to create preserved save data directory '{}': {e}",
            preserved_path.display()
        )
    })?;

    if files.is_empty() {
        return Ok(0);
    }

    for (source_path, relative_path) in &files {
        let relative = PathBuf::from(relative_path);
        validate_relative_path(&relative)?;

        let destination = preserved_path.join(relative);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "Failed to create preserved save data parent '{}': {e}",
                    parent.display()
                )
            })?;
        }

        fs::copy(source_path, &destination).map_err(|e| {
            format!(
                "Failed to preserve save data '{}' -> '{}': {e}",
                source_path.display(),
                destination.display()
            )
        })?;
    }

    Ok(file_count)
}

fn restore_preserved_save_data_into_profile<R: Runtime>(
    app: &AppHandle<R>,
    profile_path: &Path,
) -> Result<usize, String> {
    let preserved_path = preserved_save_data_path(app)?;
    if !preserved_path.exists() {
        return Ok(0);
    }

    if !preserved_path.is_dir() {
        return Err(format!(
            "Preserved save data path is not a directory: {}",
            preserved_path.display()
        ));
    }

    let mut files = Vec::new();
    collect_files_recursive(&preserved_path, &mut files)?;

    for source_path in &files {
        let relative = source_path.strip_prefix(&preserved_path).map_err(|_| {
            format!(
                "Internal path error while restoring preserved save data: '{}' is not under '{}'.",
                source_path.display(),
                preserved_path.display()
            )
        })?;
        validate_relative_path(relative)?;

        let destination = profile_path.join(relative);
        if let Some(parent) = destination.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "Failed to create profile directory while restoring save data '{}': {e}",
                    parent.display()
                )
            })?;
        }

        fs::copy(source_path, &destination).map_err(|e| {
            format!(
                "Failed to restore preserved save data '{}' -> '{}': {e}",
                source_path.display(),
                destination.display()
            )
        })?;
    }

    Ok(files.len())
}

fn promote_staging_to_profile(staging: &Path, profile: &Path, backup: &Path) -> Result<(), String> {
    clean_path(backup)?;

    if profile.exists() {
        fs::rename(profile, backup).map_err(|e| {
            format!(
                "Failed to move existing profile to backup ('{}' -> '{}'): {e}",
                profile.display(),
                backup.display()
            )
        })?;
    }

    match fs::rename(staging, profile) {
        Ok(()) => {
            let _ = clean_path(backup);
            Ok(())
        }
        Err(err) => {
            let _ = clean_path(profile);
            if backup.exists() {
                let _ = fs::rename(backup, profile);
            }
            Err(format!(
                "Failed to move staging profile into place ('{}' -> '{}'): {err}",
                staging.display(),
                profile.display()
            ))
        }
    }
}

pub async fn list_snr_releases() -> Result<Vec<SnrReleaseSummary>, String> {
    let client = download::github_client()?;
    let releases = client
        .get(RELEASES_API_URL)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch releases: {e}"))?;

    if !releases.status().is_success() {
        return Err(format!(
            "Failed to fetch releases list: status {}",
            releases.status()
        ));
    }

    let releases = releases
        .json::<Vec<GitHubRelease>>()
        .await
        .map_err(|e| format!("Failed to parse releases list: {e}"))?;

    Ok(releases
        .into_iter()
        .filter(|release| !release.prerelease)
        .filter(|release| {
            release
                .assets
                .iter()
                .any(|asset| asset.name.ends_with("_Steam.zip"))
                || release
                    .assets
                    .iter()
                    .any(|asset| asset.name.ends_with("_Epic.zip"))
        })
        .map(|release| SnrReleaseSummary {
            tag: release.tag_name,
            name: release.name.unwrap_or_default(),
            published_at: release.published_at.unwrap_or_default(),
        })
        .collect())
}

pub fn get_preserved_save_data_status<R: Runtime>(
    app: AppHandle<R>,
) -> Result<PreservedSaveDataStatus, String> {
    let preserved_path = preserved_save_data_path(&app)?;
    if !preserved_path.exists() {
        return Ok(PreservedSaveDataStatus {
            available: false,
            files: 0,
        });
    }

    if !preserved_path.is_dir() {
        return Err(format!(
            "Preserved save data path is not a directory: {}",
            preserved_path.display()
        ));
    }

    let mut files = Vec::new();
    collect_files_recursive(&preserved_path, &mut files)?;

    Ok(PreservedSaveDataStatus {
        // 空のディレクトリは復元不能として扱う。
        available: !files.is_empty(),
        files: files.len(),
    })
}

pub fn preview_savedata_from_among_us(
    source_among_us_path: String,
) -> Result<SaveDataPreviewResult, String> {
    let (among_us_path, source_save_data_path) = resolve_source_save_data_path(&source_among_us_path)?;

    let mut files = Vec::new();
    collect_files_recursive(&source_save_data_path, &mut files)?;

    let presets = presets::list_presets_from_save_data_dir(&source_save_data_path)?
        .into_iter()
        .map(|preset| SaveDataPresetSummary {
            id: preset.id,
            name: preset.name,
            has_data_file: preset.has_data_file,
        })
        .collect();

    Ok(SaveDataPreviewResult {
        source_among_us_path: among_us_path.to_string_lossy().to_string(),
        source_save_data_path: source_save_data_path.to_string_lossy().to_string(),
        presets,
        file_count: files.len(),
    })
}

pub fn import_savedata_from_among_us_into_profile<R: Runtime>(
    app: &AppHandle<R>,
    source_among_us_path: String,
) -> Result<SaveDataImportResult, String> {
    let preview = preview_savedata_from_among_us(source_among_us_path)?;
    let source_save_data_path = PathBuf::from(&preview.source_save_data_path);
    let target_save_data_path = profile_save_data_path(app)?;

    let target_parent = target_save_data_path.parent().ok_or_else(|| {
        format!(
            "SaveData target path has no parent directory: {}",
            target_save_data_path.display()
        )
    })?;
    fs::create_dir_all(target_parent).map_err(|e| {
        format!(
            "Failed to create target parent directory for SaveData import '{}': {e}",
            target_parent.display()
        )
    })?;

    let staging_path = target_parent.join(SAVE_DATA_STAGING_DIR_NAME);
    let backup_path = target_parent.join(SAVE_DATA_BACKUP_DIR_NAME);
    clean_path(&staging_path)?;
    clean_path(&backup_path)?;

    if let Err(error) = copy_directory_recursive(&source_save_data_path, &staging_path) {
        let _ = clean_path(&staging_path);
        return Err(error);
    }

    if let Err(error) = promote_staging_to_profile(&staging_path, &target_save_data_path, &backup_path) {
        let _ = clean_path(&staging_path);
        let _ = clean_path(&backup_path);
        return Err(error);
    }

    Ok(SaveDataImportResult {
        source_save_data_path: source_save_data_path.to_string_lossy().to_string(),
        target_save_data_path: target_save_data_path.to_string_lossy().to_string(),
        imported_files: preview.file_count,
        imported_presets: preview.presets.len(),
    })
}

pub fn merge_savedata_presets_from_among_us_into_profile<R: Runtime>(
    app: &AppHandle<R>,
    source_among_us_path: String,
) -> Result<SaveDataPresetMergeResult, String> {
    let (_, source_save_data_path) = resolve_source_save_data_path(&source_among_us_path)?;
    let imported = presets::import_presets_from_save_data_dir(app, &source_save_data_path)?;

    Ok(SaveDataPresetMergeResult {
        source_save_data_path: source_save_data_path.to_string_lossy().to_string(),
        imported_presets: imported.imported_presets,
    })
}

pub fn merge_preserved_savedata_presets_into_profile<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<SaveDataPresetMergeResult, String> {
    let source_save_data_path = preserved_save_data_path(app)?
        .join(SOURCE_SAVE_DATA_RELATIVE_PATH[0])
        .join(SOURCE_SAVE_DATA_RELATIVE_PATH[1]);
    let imported = presets::import_presets_from_save_data_dir(app, &source_save_data_path)?;

    Ok(SaveDataPresetMergeResult {
        source_save_data_path: source_save_data_path.to_string_lossy().to_string(),
        imported_presets: imported.imported_presets,
    })
}

pub fn uninstall_snr_profile<R: Runtime>(
    app: AppHandle<R>,
    preserve_save_data: bool,
) -> Result<UninstallResult, String> {
    let mut launcher_settings = settings::load_or_init_settings(&app)?;
    if launcher_settings.profile_path.trim().is_empty() {
        launcher_settings.profile_path = settings::default_profile_path(&app)?
            .to_string_lossy()
            .to_string();
        settings::save_settings(&app, &launcher_settings)?;
    }

    let profile_path = PathBuf::from(&launcher_settings.profile_path);

    if let Some(parent) = profile_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create profile parent directory: {e}"))?;
    }

    let preserved_files = if preserve_save_data {
        preserve_profile_save_data(&app, &profile_path)?
    } else {
        clear_preserved_save_data(&app)?;
        0
    };

    let removed_profile = profile_path.exists();
    clean_path(&profile_path)?;
    fs::create_dir_all(&profile_path)
        .map_err(|e| format!("Failed to recreate profile directory after uninstall: {e}"))?;

    Ok(UninstallResult {
        profile_path: profile_path.to_string_lossy().to_string(),
        removed_profile,
        preserved_files,
    })
}

pub async fn install_snr_release<R: Runtime>(
    app: AppHandle<R>,
    tag: String,
    platform: String,
    restore_preserved_save_data: Option<bool>,
) -> Result<InstallResult, String> {
    let platform = settings::GamePlatform::from_user_value(&platform)?;
    let tag = tag.trim().to_string();
    if tag.is_empty() {
        return Err("Release tag is required".to_string());
    }

    let restore_preserved_save_data = restore_preserved_save_data.unwrap_or(false);

    let result =
        install_snr_release_inner(&app, &tag, &platform, restore_preserved_save_data).await;
    if let Err(ref error) = result {
        emit_progress(
            &app,
            "failed",
            0.0,
            format!("Installation failed: {error}"),
            None,
            None,
            None,
            None,
        );
    }
    result
}

async fn install_snr_release_inner<R: Runtime>(
    app: &AppHandle<R>,
    tag: &str,
    platform: &settings::GamePlatform,
    restore_preserved_save_data: bool,
) -> Result<InstallResult, String> {
    emit_progress(
        app,
        "resolving",
        0.0,
        "Resolving release metadata...",
        None,
        None,
        None,
        None,
    );

    let client = download::github_client()?;
    let release = client
        .get(format!("{RELEASE_BY_TAG_API_URL}/{tag}"))
        .send()
        .await
        .map_err(|e| format!("Failed to fetch release '{tag}': {e}"))?;

    if !release.status().is_success() {
        return Err(format!(
            "Release '{}' was not found (status {})",
            tag,
            release.status()
        ));
    }

    let release = release
        .json::<GitHubRelease>()
        .await
        .map_err(|e| format!("Failed to parse release payload: {e}"))?;
    let asset = resolve_asset(&release, platform)?;

    let mut launcher_settings = settings::load_or_init_settings(app)?;
    if launcher_settings.profile_path.trim().is_empty() {
        launcher_settings.profile_path = settings::default_profile_path(app)?
            .to_string_lossy()
            .to_string();
    }
    let profile_path = PathBuf::from(&launcher_settings.profile_path);

    if let Some(parent) = profile_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create profile parent directory: {e}"))?;
    }

    let cache_zip = settings::app_data_dir(app)?
        .join("cache")
        .join("snr")
        .join(tag)
        .join(format!("{}.zip", platform.as_str()));

    emit_progress(
        app,
        "downloading",
        0.0,
        format!("Downloading '{}'", asset.name),
        Some(0),
        None,
        None,
        None,
    );

    download::download_file(
        &client,
        &asset.browser_download_url,
        &cache_zip,
        |downloaded, total| {
            let progress = total
                .map(|total| (downloaded as f64 / total as f64) * 100.0)
                .unwrap_or(0.0);
            emit_progress(
                app,
                "downloading",
                progress.clamp(0.0, 100.0),
                "Downloading SNR package...",
                Some(downloaded),
                total,
                None,
                None,
            );
        },
    )
    .await?;

    let (staging_path, backup_path) = make_profile_paths(&profile_path)?;
    clean_path(&staging_path)?;
    clean_path(&backup_path)?;

    emit_progress(
        app,
        "extracting",
        0.0,
        "Extracting package...",
        None,
        None,
        Some(0),
        None,
    );

    zip::extract_zip(&cache_zip, &staging_path, |current, total| {
        let progress = if total == 0 {
            100.0
        } else {
            (current as f64 / total as f64) * 100.0
        };
        emit_progress(
            app,
            "extracting",
            progress.clamp(0.0, 100.0),
            "Extracting package...",
            None,
            None,
            Some(current),
            Some(total),
        );
    })?;

    if let Err(error) = download_patchers_into_staging(app, &client, &staging_path).await {
        emit_progress(
            app,
            "patchers",
            100.0,
            format!("Skipping patchers synchronization: {error}"),
            None,
            None,
            None,
            None,
        );
        eprintln!("Failed to synchronize patchers: {error}");
    }

    let restored_save_files = if restore_preserved_save_data {
        emit_progress(
            app,
            "restoring",
            0.0,
            "Restoring preserved save data...",
            None,
            None,
            None,
            None,
        );

        let restored = restore_preserved_save_data_into_profile(app, &staging_path)?;
        emit_progress(
            app,
            "restoring",
            100.0,
            format!("Restored {restored} preserved save file(s)"),
            None,
            None,
            None,
            None,
        );
        restored
    } else {
        0
    };

    settings::verify_profile_required_files(&staging_path)?;
    promote_staging_to_profile(&staging_path, &profile_path, &backup_path)?;

    launcher_settings.selected_release_tag = tag.to_string();
    launcher_settings.game_platform = platform.clone();
    launcher_settings.profile_path = profile_path.to_string_lossy().to_string();
    settings::save_settings(app, &launcher_settings)?;

    emit_progress(
        app,
        "complete",
        100.0,
        "Installation complete",
        None,
        None,
        None,
        None,
    );

    Ok(InstallResult {
        tag: tag.to_string(),
        platform: platform.as_str().to_string(),
        asset_name: asset.name.clone(),
        profile_path: profile_path.to_string_lossy().to_string(),
        restored_save_files,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn make_temp_dir(label: &str) -> PathBuf {
        let millis = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis();
        std::env::temp_dir().join(format!(
            "snr-service-{label}-{}-{millis}",
            std::process::id()
        ))
    }

    fn make_minimal_options_data() -> Vec<u8> {
        let mut bytes = Vec::new();
        bytes.push(1);
        bytes.push(2);
        bytes.push(4);
        bytes.extend_from_slice(&0i32.to_le_bytes());
        bytes.extend_from_slice(&0i32.to_le_bytes());
        bytes
    }

    #[test]
    fn preview_savedata_requires_among_us_exe() {
        let path = make_temp_dir("missing-exe");
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("failed to create temp dir");

        let error = preview_savedata_from_among_us(path.to_string_lossy().to_string())
            .expect_err("expected missing exe to fail");
        assert!(error.contains("Among Us installation"));

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn preview_savedata_requires_savedata_directory() {
        let path = make_temp_dir("missing-savedata");
        let _ = fs::remove_dir_all(&path);
        fs::create_dir_all(&path).expect("failed to create temp dir");
        fs::write(path.join(AMONG_US_EXE), b"").expect("failed to write exe marker");

        let error = preview_savedata_from_among_us(path.to_string_lossy().to_string())
            .expect_err("expected missing save data to fail");
        assert!(error.contains("SaveData directory"));

        let _ = fs::remove_dir_all(&path);
    }

    #[test]
    fn preview_savedata_returns_file_count() {
        let path = make_temp_dir("preview-success");
        let _ = fs::remove_dir_all(&path);
        let save_data_path = path.join("SuperNewRolesNext").join("SaveData");
        fs::create_dir_all(&save_data_path).expect("failed to create save data dir");
        fs::write(path.join(AMONG_US_EXE), b"").expect("failed to write exe marker");
        fs::write(save_data_path.join("Options.data"), make_minimal_options_data())
            .expect("failed to write options");
        fs::write(save_data_path.join("CustomCosmetics.data"), [1u8, 2u8, 3u8])
            .expect("failed to write extra file");

        let preview = preview_savedata_from_among_us(path.to_string_lossy().to_string())
            .expect("preview should succeed");
        assert_eq!(
            preview.source_save_data_path,
            save_data_path.to_string_lossy().to_string()
        );
        assert_eq!(preview.file_count, 2);
        assert!(preview.presets.is_empty());

        let _ = fs::remove_dir_all(&path);
    }
}
