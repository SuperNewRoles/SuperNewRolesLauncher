use regex::Regex;
use std::fs::{self, File};
use std::io;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Runtime};
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::utils::settings;

const PROFILE_ARCHIVE_PREFIX: &str = "profile";
const LOCALLOW_ARCHIVE_PREFIX: &str = "locallow";
const LOCALLOW_ALLOWED_PREFIX: &str = "Innersloth/SuperNewRoles";
const DEFAULT_ARCHIVE_DIR_NAME: &str = "migrations";

const PROFILE_INCLUDE_REGEX_PATTERNS: [&str; 4] = [
    r"^SuperNewRolesNext/SaveData/Options\.data$",
    r"^SuperNewRolesNext/SaveData/PresetOptions_(0|[1-9]\d*)\.data$",
    r"^SuperNewRolesNext/SaveData/SuperTrophyData\.dat$",
    r"^SuperNewRolesNext/SaveData/CustomCosmetics\.data$",
];

#[derive(Debug, Clone)]
pub struct MigrationExportSummary {
    pub archive_path: PathBuf,
    pub included_files: usize,
    pub profile_files: usize,
    pub locallow_files: usize,
}

#[derive(Debug, Clone)]
pub struct MigrationImportSummary {
    pub imported_files: usize,
    pub profile_files: usize,
    pub locallow_files: usize,
}

fn compile_profile_patterns() -> Result<Vec<Regex>, String> {
    PROFILE_INCLUDE_REGEX_PATTERNS
        .iter()
        .map(|pattern| Regex::new(pattern).map_err(|e| format!("Invalid profile regex '{pattern}': {e}")))
        .collect()
}

fn normalize_path_for_archive(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn collect_files_recursive(base: &Path, current: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
    for entry in fs::read_dir(current).map_err(|e| {
        format!(
            "Failed to read directory '{}' while collecting migration data: {e}",
            current.display()
        )
    })? {
        let entry = entry.map_err(|e| {
            format!(
                "Failed to read a directory entry under '{}': {e}",
                current.display()
            )
        })?;

        let path = entry.path();
        if path.is_dir() {
            collect_files_recursive(base, &path, out)?;
            continue;
        }

        if path.is_file() {
            let _ = path.strip_prefix(base).map_err(|_| {
                format!(
                    "Internal path error while collecting migration files: '{}' is not under '{}'.",
                    path.display(),
                    base.display()
                )
            })?;
            out.push(path);
        }
    }

    Ok(())
}

fn collect_profile_files(
    profile_root: &Path,
    patterns: &[Regex],
) -> Result<Vec<(PathBuf, String)>, String> {
    if !profile_root.exists() {
        return Ok(Vec::new());
    }

    let mut all_files = Vec::new();
    collect_files_recursive(profile_root, profile_root, &mut all_files)?;

    let mut matched = Vec::new();
    for file_path in all_files {
        let relative = file_path.strip_prefix(profile_root).map_err(|_| {
            format!(
                "Failed to make profile-relative path from '{}' (root: '{}').",
                file_path.display(),
                profile_root.display()
            )
        })?;
        let relative_normalized = normalize_path_for_archive(relative);

        if patterns
            .iter()
            .any(|pattern| pattern.is_match(&relative_normalized))
        {
            matched.push((file_path, relative_normalized));
        }
    }

    Ok(matched)
}

fn resolve_locallow_root() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        let user_profile = std::env::var_os("USERPROFILE").or_else(|| {
            let drive = std::env::var_os("HOMEDRIVE")?;
            let path = std::env::var_os("HOMEPATH")?;
            let mut combined = PathBuf::from(drive);
            combined.push(path);
            Some(combined.into_os_string())
        });

        let user_profile = user_profile
            .ok_or_else(|| "Failed to resolve Windows home directory for LocalLow path".to_string())?;

        return Ok(PathBuf::from(user_profile)
            .join("AppData")
            .join("LocalLow"));
    }

    #[allow(unreachable_code)]
    Err("Data migration is currently supported on Windows only".to_string())
}

fn resolve_locallow_snr_dir() -> Result<(PathBuf, PathBuf), String> {
    let locallow_root = resolve_locallow_root()?;
    let snr_dir = locallow_root.join("Innersloth").join("SuperNewRoles");
    Ok((locallow_root, snr_dir))
}

fn collect_locallow_files(
    locallow_root: &Path,
    locallow_snr_dir: &Path,
) -> Result<Vec<(PathBuf, String)>, String> {
    if !locallow_snr_dir.exists() {
        return Ok(Vec::new());
    }

    let mut all_files = Vec::new();
    collect_files_recursive(locallow_snr_dir, locallow_snr_dir, &mut all_files)?;

    let mut matched = Vec::new();
    for file_path in all_files {
        let relative = file_path.strip_prefix(locallow_root).map_err(|_| {
            format!(
                "Failed to make LocalLow-relative path from '{}' (root: '{}').",
                file_path.display(),
                locallow_root.display()
            )
        })?;

        let relative_normalized = normalize_path_for_archive(relative);
        if relative_normalized == LOCALLOW_ALLOWED_PREFIX
            || relative_normalized.starts_with("Innersloth/SuperNewRoles/")
        {
            matched.push((file_path, relative_normalized));
        }
    }

    Ok(matched)
}

fn archive_extension_is_supported(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            let ext_lower = ext.to_ascii_lowercase();
            ext_lower == "snrdata" || ext_lower == "zip"
        })
        .unwrap_or(false)
}

fn make_default_archive_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let base_dir = settings::app_data_dir(app)?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    Ok(base_dir
        .join(DEFAULT_ARCHIVE_DIR_NAME)
        .join(format!("snr-migration-{timestamp}.snrdata")))
}

fn resolve_archive_output_path<R: Runtime>(
    app: &AppHandle<R>,
    output_path: Option<String>,
) -> Result<PathBuf, String> {
    let mut output = if let Some(path) = output_path {
        let trimmed = path.trim();
        if trimmed.is_empty() {
            make_default_archive_path(app)?
        } else {
            PathBuf::from(trimmed)
        }
    } else {
        make_default_archive_path(app)?
    };

    match output.extension().and_then(|ext| ext.to_str()) {
        Some(ext) if ext.eq_ignore_ascii_case("snrdata") => {}
        Some(_) => {
            return Err(format!(
                "Export path must end with .snrdata: {}",
                output.display()
            ));
        }
        None => {
            output.set_extension("snrdata");
        }
    }

    Ok(output)
}

fn write_file_to_zip(zip: &mut ZipWriter<File>, source: &Path, archive_path: &str) -> Result<(), String> {
    let mut input = File::open(source)
        .map_err(|e| format!("Failed to open migration source file '{}': {e}", source.display()))?;

    let options = zip::write::SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);

    zip.start_file(archive_path, options)
        .map_err(|e| format!("Failed to start zip entry '{}': {e}", archive_path))?;

    io::copy(&mut input, zip)
        .map_err(|e| format!("Failed to write zip entry '{}': {e}", archive_path))?;

    Ok(())
}

pub fn export_migration_data<R: Runtime>(
    app: &AppHandle<R>,
    output_path: Option<String>,
) -> Result<MigrationExportSummary, String> {
    let launcher_settings = settings::load_or_init_settings(app)?;
    let profile_root = PathBuf::from(launcher_settings.profile_path);

    let profile_patterns = compile_profile_patterns()?;
    let profile_files = collect_profile_files(&profile_root, &profile_patterns)?;

    let (locallow_root, locallow_snr_dir) = resolve_locallow_snr_dir()?;
    let locallow_files = collect_locallow_files(&locallow_root, &locallow_snr_dir)?;

    if profile_files.is_empty() && locallow_files.is_empty() {
        return Err(
            "No migration data was found to export (profile patterns and LocalLow target were empty)."
                .to_string(),
        );
    }

    let archive_path = resolve_archive_output_path(app, output_path)?;
    if let Some(parent) = archive_path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            format!(
                "Failed to create output directory for migration archive '{}': {e}",
                parent.display()
            )
        })?;
    }

    let output_file = File::create(&archive_path).map_err(|e| {
        format!(
            "Failed to create migration archive '{}': {e}",
            archive_path.display()
        )
    })?;
    let mut zip = ZipWriter::new(output_file);

    for (source, relative) in &profile_files {
        let archive_entry_path = format!("{PROFILE_ARCHIVE_PREFIX}/{relative}");
        write_file_to_zip(&mut zip, source, &archive_entry_path)?;
    }

    for (source, relative) in &locallow_files {
        let archive_entry_path = format!("{LOCALLOW_ARCHIVE_PREFIX}/{relative}");
        write_file_to_zip(&mut zip, source, &archive_entry_path)?;
    }

    zip.finish()
        .map_err(|e| format!("Failed to finalize migration archive: {e}"))?;

    Ok(MigrationExportSummary {
        archive_path,
        included_files: profile_files.len() + locallow_files.len(),
        profile_files: profile_files.len(),
        locallow_files: locallow_files.len(),
    })
}

fn is_locallow_entry_allowed(relative_normalized: &str) -> bool {
    relative_normalized == LOCALLOW_ALLOWED_PREFIX
        || relative_normalized.starts_with("Innersloth/SuperNewRoles/")
}

fn resolve_entry_target(
    archive_entry_path: &Path,
    profile_root: &Path,
    locallow_root: &Path,
    profile_patterns: &[Regex],
) -> Option<(PathBuf, bool)> {
    let mut components = archive_entry_path.components();
    let top = components.next()?;
    let Component::Normal(prefix) = top else {
        return None;
    };

    let relative = components.as_path();
    if relative.as_os_str().is_empty() {
        return None;
    }

    let prefix = prefix.to_string_lossy();
    let relative_normalized = normalize_path_for_archive(relative);

    if prefix == PROFILE_ARCHIVE_PREFIX {
        if !profile_patterns
            .iter()
            .any(|pattern| pattern.is_match(&relative_normalized))
        {
            return None;
        }

        return Some((profile_root.join(relative), true));
    }

    if prefix == LOCALLOW_ARCHIVE_PREFIX {
        if !is_locallow_entry_allowed(&relative_normalized) {
            return None;
        }

        return Some((locallow_root.join(relative), false));
    }

    None
}

pub fn import_migration_data<R: Runtime>(
    app: &AppHandle<R>,
    archive_path: &Path,
) -> Result<MigrationImportSummary, String> {
    if !archive_path.is_file() {
        return Err(format!(
            "Migration archive was not found: {}",
            archive_path.display()
        ));
    }

    if !archive_extension_is_supported(archive_path) {
        return Err(format!(
            "Unsupported migration archive extension: {}",
            archive_path.display()
        ));
    }

    let input_file = File::open(archive_path)
        .map_err(|e| format!("Failed to open migration archive '{}': {e}", archive_path.display()))?;
    let mut archive = ZipArchive::new(input_file)
        .map_err(|e| format!("Invalid migration archive format: {e}"))?;

    let launcher_settings = settings::load_or_init_settings(app)?;
    let profile_root = PathBuf::from(launcher_settings.profile_path);
    let locallow_root = resolve_locallow_root()?;
    let profile_patterns = compile_profile_patterns()?;

    let mut imported_files = 0usize;
    let mut imported_profile_files = 0usize;
    let mut imported_locallow_files = 0usize;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|e| format!("Failed to read migration archive entry {index}: {e}"))?;

        let enclosed = entry.enclosed_name().ok_or_else(|| {
            format!(
                "Refused unsafe migration archive entry path (zip-slip protection): {}",
                entry.name()
            )
        })?;

        let Some((target_path, is_profile_target)) = resolve_entry_target(
            &enclosed,
            &profile_root,
            &locallow_root,
            &profile_patterns,
        ) else {
            continue;
        };

        if entry.is_dir() {
            fs::create_dir_all(&target_path).map_err(|e| {
                format!(
                    "Failed to create directory during migration import '{}': {e}",
                    target_path.display()
                )
            })?;
            continue;
        }

        if let Some(parent) = target_path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "Failed to create parent directory during migration import '{}': {e}",
                    parent.display()
                )
            })?;
        }

        let mut output = File::create(&target_path).map_err(|e| {
            format!(
                "Failed to create imported migration file '{}': {e}",
                target_path.display()
            )
        })?;
        io::copy(&mut entry, &mut output).map_err(|e| {
            format!(
                "Failed to import migration file '{}': {e}",
                target_path.display()
            )
        })?;

        imported_files += 1;
        if is_profile_target {
            imported_profile_files += 1;
        } else {
            imported_locallow_files += 1;
        }
    }

    if imported_files == 0 {
        return Err(
            "No supported migration entries were found in the archive."
                .to_string(),
        );
    }

    Ok(MigrationImportSummary {
        imported_files,
        profile_files: imported_profile_files,
        locallow_files: imported_locallow_files,
    })
}
