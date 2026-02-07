use crate::utils::{download, settings, zip};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter, Runtime};

const RELEASES_API_URL: &str =
    "https://api.github.com/repos/SuperNewRoles/SuperNewRoles/releases?per_page=30";
const RELEASE_BY_TAG_API_URL: &str =
    "https://api.github.com/repos/SuperNewRoles/SuperNewRoles/releases/tags";

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

#[derive(Debug, Clone, Serialize)]
pub struct SnrReleaseSummary {
    pub tag: String,
    pub name: String,
    pub published_at: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstallResult {
    pub tag: String,
    pub platform: String,
    pub asset_name: String,
    pub profile_path: String,
}

#[derive(Debug, Clone, Serialize)]
struct InstallProgressPayload {
    stage: String,
    progress: f64,
    message: String,
    downloaded: Option<u64>,
    total: Option<u64>,
    current: Option<usize>,
    entries_total: Option<usize>,
}

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

#[tauri::command]
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

#[tauri::command]
pub async fn install_snr_release<R: Runtime>(
    app: AppHandle<R>,
    tag: String,
    platform: String,
) -> Result<InstallResult, String> {
    let platform = settings::GamePlatform::from_user_value(&platform)?;
    let tag = tag.trim().to_string();
    if tag.is_empty() {
        return Err("Release tag is required".to_string());
    }

    let result = install_snr_release_inner(&app, &tag, &platform).await;
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
    })
}
