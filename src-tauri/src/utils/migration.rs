use argon2::{Algorithm, Argon2, Params, Version};
use chacha20poly1305::aead::Aead;
use chacha20poly1305::{KeyInit, XChaCha20Poly1305, XNonce};
use rand::rngs::OsRng;
use rand::RngCore;
use regex::Regex;
use std::fs::{self, File};
use std::io::{self, Cursor, Seek, Write};
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Runtime};
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::utils::{mod_profile, settings};

const PROFILE_ARCHIVE_PREFIX: &str = "profile";
const LOCALLOW_ARCHIVE_PREFIX: &str = "locallow";
const DEFAULT_ARCHIVE_DIR_NAME: &str = "migrations";

const PROFILE_BACKUP_DIR_NAME: &str = "profile_backup";
const LOCALLOW_BACKUP_DIR_NAME: &str = "locallow_backup";

const LEGACY_MIGRATION_EXTENSION: &str = "snrdata";
const LEGACY_ARCHIVE_MAGIC: &[u8] = b"SNRDATA1";
const ARCHIVE_VERSION: u8 = 1;
const CONTAINER_FLAG_ENCRYPTED: u8 = 0b0000_0001;
const ENCRYPTION_SALT_LEN: usize = 16;
const ENCRYPTION_NONCE_LEN: usize = 24;

#[derive(Debug, Clone)]
pub struct MigrationExportSummary {
    pub archive_path: PathBuf,
    pub included_files: usize,
    pub profile_files: usize,
    pub locallow_files: usize,
    pub encrypted: bool,
}

#[derive(Debug, Clone)]
pub struct MigrationImportSummary {
    pub imported_files: usize,
    pub profile_files: usize,
    pub locallow_files: usize,
    pub encrypted: bool,
}

#[derive(Debug, Clone)]
pub struct MigrationPasswordValidationSummary {
    pub encrypted: bool,
}

#[derive(Debug, Clone)]
struct PlannedImportFile {
    archive_index: usize,
    target_path: PathBuf,
    is_profile_target: bool,
}

fn migration_extension() -> &'static str {
    mod_profile::get().migration.extension.as_str()
}

fn archive_magic_bytes() -> &'static [u8] {
    mod_profile::get().migration.magic.as_bytes()
}

fn locallow_relative_root_path() -> PathBuf {
    mod_profile::local_low_root_path()
}

fn locallow_allowed_prefix() -> String {
    normalize_path_for_archive(&locallow_relative_root_path())
}

fn compile_profile_patterns() -> Result<Vec<Regex>, String> {
    mod_profile::get()
        .migration
        .profile_include_patterns
        .iter()
        .map(|pattern| {
            Regex::new(pattern).map_err(|e| format!("Invalid profile regex '{pattern}': {e}"))
        })
        .collect()
}

fn normalize_path_for_archive(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn collect_files_recursive(current: &Path, out: &mut Vec<PathBuf>) -> Result<(), String> {
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
            collect_files_recursive(&path, out)?;
            continue;
        }

        if path.is_file() {
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
    collect_files_recursive(profile_root, &mut all_files)?;

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

pub fn collect_supported_profile_save_files(
    profile_root: &Path,
) -> Result<Vec<(PathBuf, String)>, String> {
    let patterns = compile_profile_patterns()?;
    collect_profile_files(profile_root, &patterns)
}

fn resolve_locallow_root() -> Result<PathBuf, String> {
    #[cfg(target_os = "windows")]
    {
        let user_profile = std::env::var_os("USERPROFILE").ok_or_else(|| {
            "Failed to resolve Windows home directory for LocalLow path".to_string()
        })?;

        return Ok(PathBuf::from(user_profile).join("AppData").join("LocalLow"));
    }

    #[allow(unreachable_code)]
    Err("Data migration is currently supported on Windows only".to_string())
}

fn resolve_locallow_snr_dir() -> Result<(PathBuf, PathBuf), String> {
    let locallow_root = resolve_locallow_root()?;
    let snr_dir = locallow_root.join(locallow_relative_root_path());
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
    collect_files_recursive(locallow_snr_dir, &mut all_files)?;

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
        let allowed_prefix = locallow_allowed_prefix();
        if relative_normalized == allowed_prefix
            || relative_normalized
                .strip_prefix(&allowed_prefix)
                .is_some_and(|suffix| suffix.starts_with('/'))
        {
            matched.push((file_path, relative_normalized));
        }
    }

    Ok(matched)
}

fn archive_extension_is_supported(path: &Path) -> bool {
    let configured_extension = migration_extension();
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            let ext_lower = ext.to_ascii_lowercase();
            ext_lower == configured_extension.to_ascii_lowercase()
                || ext_lower == LEGACY_MIGRATION_EXTENSION
        })
        .unwrap_or(false)
}

fn make_default_archive_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let base_dir = settings::app_data_dir(app)?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    Ok(base_dir.join(DEFAULT_ARCHIVE_DIR_NAME).join(format!(
        "{}-migration-{timestamp}.{}",
        mod_profile::get().mod_info.id,
        migration_extension()
    )))
}

fn resolve_archive_output_path<R: Runtime>(
    app: &AppHandle<R>,
    output_path: Option<String>,
) -> Result<PathBuf, String> {
    let extension = migration_extension();
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
        Some(ext) if ext.eq_ignore_ascii_case(extension) => {}
        Some(_) => {
            return Err(format!(
                "Export path must end with .{extension}: {}",
                output.display()
            ));
        }
        None => {
            output.set_extension(extension);
        }
    }

    Ok(output)
}

fn write_file_to_zip<W: Write + Seek>(
    zip: &mut ZipWriter<W>,
    source: &Path,
    archive_path: &str,
) -> Result<(), String> {
    let mut input = File::open(source).map_err(|e| {
        format!(
            "Failed to open migration source file '{}': {e}",
            source.display()
        )
    })?;

    let options = zip::write::SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);

    zip.start_file(archive_path, options)
        .map_err(|e| format!("Failed to start zip entry '{}': {e}", archive_path))?;

    io::copy(&mut input, zip)
        .map_err(|e| format!("Failed to write zip entry '{}': {e}", archive_path))?;

    Ok(())
}

fn build_zip_bytes(
    profile_files: &[(PathBuf, String)],
    locallow_files: &[(PathBuf, String)],
) -> Result<Vec<u8>, String> {
    let cursor = Cursor::new(Vec::<u8>::new());
    let mut zip = ZipWriter::new(cursor);

    for (source, relative) in profile_files {
        let archive_entry_path = format!("{PROFILE_ARCHIVE_PREFIX}/{relative}");
        write_file_to_zip(&mut zip, source, &archive_entry_path)?;
    }

    for (source, relative) in locallow_files {
        let archive_entry_path = format!("{LOCALLOW_ARCHIVE_PREFIX}/{relative}");
        write_file_to_zip(&mut zip, source, &archive_entry_path)?;
    }

    let cursor = zip
        .finish()
        .map_err(|e| format!("Failed to finalize migration archive: {e}"))?;

    Ok(cursor.into_inner())
}

fn derive_encryption_key(
    password: &str,
    salt: &[u8; ENCRYPTION_SALT_LEN],
) -> Result<[u8; 32], String> {
    if password.is_empty() {
        return Err("Password is required when encryption is enabled".to_string());
    }

    let params = Params::new(19_456, 2, 1, Some(32))
        .map_err(|e| format!("Failed to prepare encryption parameters: {e}"))?;
    let argon2 = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);

    let mut key = [0u8; 32];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|e| format!("Failed to derive encryption key: {e}"))?;

    Ok(key)
}

fn build_snrdata_container(
    zip_bytes: &[u8],
    encryption_enabled: bool,
    password: Option<&str>,
) -> Result<(Vec<u8>, bool), String> {
    let archive_magic = archive_magic_bytes();
    let extension = migration_extension();
    if !encryption_enabled {
        let mut container = Vec::with_capacity(archive_magic.len() + 2 + zip_bytes.len());
        container.extend_from_slice(archive_magic);
        container.push(ARCHIVE_VERSION);
        container.push(0);
        container.extend_from_slice(zip_bytes);
        return Ok((container, false));
    }

    let password = password
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "Password is required when encryption is enabled".to_string())?;

    let mut salt = [0u8; ENCRYPTION_SALT_LEN];
    let mut nonce = [0u8; ENCRYPTION_NONCE_LEN];
    OsRng.fill_bytes(&mut salt);
    OsRng.fill_bytes(&mut nonce);

    let mut key = derive_encryption_key(password, &salt)?;
    let cipher = XChaCha20Poly1305::new((&key).into());
    let ciphertext = cipher
        .encrypt(XNonce::from_slice(&nonce), zip_bytes)
        .map_err(|_| format!("Failed to encrypt .{extension} payload"))?;
    key.fill(0);

    let mut container = Vec::with_capacity(
        archive_magic.len() + 2 + ENCRYPTION_SALT_LEN + ENCRYPTION_NONCE_LEN + ciphertext.len(),
    );
    container.extend_from_slice(archive_magic);
    container.push(ARCHIVE_VERSION);
    container.push(CONTAINER_FLAG_ENCRYPTED);
    container.extend_from_slice(&salt);
    container.extend_from_slice(&nonce);
    container.extend_from_slice(&ciphertext);

    Ok((container, true))
}

fn extract_zip_bytes_from_archive_bytes(
    archive_bytes: &[u8],
    password: Option<&str>,
) -> Result<(Vec<u8>, bool), String> {
    let extension = migration_extension();
    let configured_magic = archive_magic_bytes();
    let active_magic = if archive_bytes.starts_with(configured_magic) {
        configured_magic
    } else if archive_bytes.starts_with(LEGACY_ARCHIVE_MAGIC) {
        LEGACY_ARCHIVE_MAGIC
    } else {
        return Ok((archive_bytes.to_vec(), false));
    };

    if archive_bytes.len() < active_magic.len() + 2 {
        return Err(format!("Invalid .{extension} header"));
    }

    let version = archive_bytes[active_magic.len()];
    if version != ARCHIVE_VERSION {
        return Err(format!("Unsupported .{extension} version: {version}"));
    }

    let flags = archive_bytes[active_magic.len() + 1];
    if flags & !CONTAINER_FLAG_ENCRYPTED != 0 {
        return Err(format!("Unsupported .{extension} flags"));
    }

    let payload = &archive_bytes[(active_magic.len() + 2)..];
    let encrypted = (flags & CONTAINER_FLAG_ENCRYPTED) != 0;
    if !encrypted {
        return Ok((payload.to_vec(), false));
    }

    if payload.len() < ENCRYPTION_SALT_LEN + ENCRYPTION_NONCE_LEN + 1 {
        return Err(format!("Encrypted .{extension} payload is too short"));
    }

    let salt: [u8; ENCRYPTION_SALT_LEN] = payload[..ENCRYPTION_SALT_LEN]
        .try_into()
        .map_err(|_| format!("Invalid .{extension} salt"))?;
    let nonce_start = ENCRYPTION_SALT_LEN;
    let nonce_end = nonce_start + ENCRYPTION_NONCE_LEN;
    let nonce: [u8; ENCRYPTION_NONCE_LEN] = payload[nonce_start..nonce_end]
        .try_into()
        .map_err(|_| format!("Invalid .{extension} nonce"))?;
    let ciphertext = &payload[nonce_end..];

    let password = password.filter(|value| !value.is_empty()).ok_or_else(|| {
        format!("This .{extension} file is encrypted. Please provide a password.")
    })?;

    let mut key = derive_encryption_key(password, &salt)?;
    let cipher = XChaCha20Poly1305::new((&key).into());
    let plaintext = cipher
        .decrypt(XNonce::from_slice(&nonce), ciphertext)
        .map_err(|_| {
            format!("Failed to decrypt .{extension}. The password may be incorrect or the file is corrupted.")
        })?;
    key.fill(0);

    Ok((plaintext, true))
}

fn read_zip_bytes_from_archive_file(
    archive_path: &Path,
    password: Option<&str>,
) -> Result<(Vec<u8>, bool), String> {
    let archive_bytes = fs::read(archive_path).map_err(|e| {
        format!(
            "Failed to read migration archive '{}': {e}",
            archive_path.display()
        )
    })?;
    extract_zip_bytes_from_archive_bytes(&archive_bytes, password)
}

fn is_locallow_entry_allowed(relative_normalized: &str) -> bool {
    let allowed_prefix = locallow_allowed_prefix();
    relative_normalized == allowed_prefix
        || relative_normalized
            .strip_prefix(&allowed_prefix)
            .is_some_and(|suffix| suffix.starts_with('/'))
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

fn plan_import_files(
    archive: &mut ZipArchive<Cursor<Vec<u8>>>,
    profile_root: &Path,
    locallow_root: &Path,
    profile_patterns: &[Regex],
) -> Result<Vec<PlannedImportFile>, String> {
    let mut planned_files = Vec::new();

    for index in 0..archive.len() {
        let entry = archive
            .by_index(index)
            .map_err(|e| format!("Failed to read migration archive entry {index}: {e}"))?;

        let enclosed = entry.enclosed_name().ok_or_else(|| {
            format!(
                "Refused unsafe migration archive entry path (zip-slip protection): {}",
                entry.name()
            )
        })?;

        if entry.is_dir() {
            continue;
        }

        let Some((target_path, is_profile_target)) =
            resolve_entry_target(&enclosed, profile_root, locallow_root, profile_patterns)
        else {
            continue;
        };

        planned_files.push(PlannedImportFile {
            archive_index: index,
            target_path,
            is_profile_target,
        });
    }

    Ok(planned_files)
}

fn copy_directory_recursive(source: &Path, destination: &Path) -> Result<(), String> {
    if !source.exists() {
        return Ok(());
    }
    if !source.is_dir() {
        return Err(format!(
            "Source for recursive copy is not a directory: {}",
            source.display()
        ));
    }

    fs::create_dir_all(destination).map_err(|e| {
        format!(
            "Failed to create destination directory for recursive copy '{}': {e}",
            destination.display()
        )
    })?;

    let mut files = Vec::new();
    collect_files_recursive(source, &mut files)?;

    for source_file in files {
        let relative = source_file.strip_prefix(source).map_err(|_| {
            format!(
                "Failed to create relative path during recursive copy: '{}' (base '{}')",
                source_file.display(),
                source.display()
            )
        })?;

        let destination_file = destination.join(relative);
        if let Some(parent) = destination_file.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "Failed to create directory during recursive copy '{}': {e}",
                    parent.display()
                )
            })?;
        }

        fs::copy(&source_file, &destination_file).map_err(|e| {
            format!(
                "Failed to copy '{}' to '{}': {e}",
                source_file.display(),
                destination_file.display()
            )
        })?;
    }

    Ok(())
}

fn create_backup_root<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let base = settings::app_data_dir(app)?.join("migration-import-backups");
    fs::create_dir_all(&base).map_err(|e| {
        format!(
            "Failed to create migration backup base directory '{}': {e}",
            base.display()
        )
    })?;

    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let pid = std::process::id();

    for attempt in 0..100u32 {
        let suffix = if attempt == 0 {
            String::new()
        } else {
            format!("-{attempt}")
        };
        let candidate = base.join(format!("import-{timestamp}-{pid}{suffix}"));
        if candidate.exists() {
            continue;
        }

        fs::create_dir_all(&candidate).map_err(|e| {
            format!(
                "Failed to create migration backup directory '{}': {e}",
                candidate.display()
            )
        })?;
        return Ok(candidate);
    }

    Err("Failed to allocate a unique migration backup directory".to_string())
}

fn clean_managed_profile_files(
    profile_root: &Path,
    profile_patterns: &[Regex],
) -> Result<(), String> {
    let existing_files = collect_profile_files(profile_root, profile_patterns)?;
    for (path, _) in existing_files {
        fs::remove_file(&path).map_err(|e| {
            format!(
                "Failed to remove existing profile migration file '{}': {e}",
                path.display()
            )
        })?;
    }
    Ok(())
}

fn backup_and_clean_profile(
    profile_root: &Path,
    profile_patterns: &[Regex],
    backup_root: &Path,
) -> Result<(), String> {
    let existing_files = collect_profile_files(profile_root, profile_patterns)?;
    if existing_files.is_empty() {
        return Ok(());
    }

    let backup_profile_root = backup_root.join(PROFILE_BACKUP_DIR_NAME);
    for (source, relative) in existing_files {
        let backup_path = backup_profile_root.join(Path::new(&relative));
        if let Some(parent) = backup_path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "Failed to create profile backup directory '{}': {e}",
                    parent.display()
                )
            })?;
        }

        fs::copy(&source, &backup_path).map_err(|e| {
            format!(
                "Failed to backup profile migration file '{}' to '{}': {e}",
                source.display(),
                backup_path.display()
            )
        })?;

        fs::remove_file(&source).map_err(|e| {
            format!(
                "Failed to remove profile migration file '{}' before import: {e}",
                source.display()
            )
        })?;
    }

    Ok(())
}

fn backup_and_clean_locallow(locallow_snr_dir: &Path, backup_root: &Path) -> Result<(), String> {
    if !locallow_snr_dir.exists() {
        return Ok(());
    }

    let backup_locallow_dir = backup_root
        .join(LOCALLOW_BACKUP_DIR_NAME)
        .join(locallow_relative_root_path());
    copy_directory_recursive(locallow_snr_dir, &backup_locallow_dir)?;

    fs::remove_dir_all(locallow_snr_dir).map_err(|e| {
        format!(
            "Failed to clear LocalLow migration target '{}' before import: {e}",
            locallow_snr_dir.display()
        )
    })?;

    Ok(())
}

fn restore_profile_from_backup(profile_root: &Path, backup_root: &Path) -> Result<(), String> {
    let backup_profile_root = backup_root.join(PROFILE_BACKUP_DIR_NAME);
    copy_directory_recursive(&backup_profile_root, profile_root)
}

fn restore_locallow_from_backup(locallow_snr_dir: &Path, backup_root: &Path) -> Result<(), String> {
    if locallow_snr_dir.exists() {
        fs::remove_dir_all(locallow_snr_dir).map_err(|e| {
            format!(
                "Failed to remove partially imported LocalLow data '{}': {e}",
                locallow_snr_dir.display()
            )
        })?;
    }

    let backup_locallow_dir = backup_root
        .join(LOCALLOW_BACKUP_DIR_NAME)
        .join(locallow_relative_root_path());
    copy_directory_recursive(&backup_locallow_dir, locallow_snr_dir)
}

fn rollback_after_failed_import(
    profile_root: &Path,
    profile_patterns: &[Regex],
    locallow_snr_dir: &Path,
    backup_root: &Path,
) -> Result<(), String> {
    clean_managed_profile_files(profile_root, profile_patterns)?;
    restore_profile_from_backup(profile_root, backup_root)?;
    restore_locallow_from_backup(locallow_snr_dir, backup_root)?;
    Ok(())
}

fn apply_import_files(
    archive: &mut ZipArchive<Cursor<Vec<u8>>>,
    planned_files: &[PlannedImportFile],
) -> Result<(usize, usize, usize), String> {
    let mut imported_files = 0usize;
    let mut imported_profile_files = 0usize;
    let mut imported_locallow_files = 0usize;

    for planned in planned_files {
        let mut entry = archive.by_index(planned.archive_index).map_err(|e| {
            format!(
                "Failed to read migration archive entry {} during import: {e}",
                planned.archive_index
            )
        })?;

        if let Some(parent) = planned.target_path.parent() {
            fs::create_dir_all(parent).map_err(|e| {
                format!(
                    "Failed to create directory during migration import '{}': {e}",
                    parent.display()
                )
            })?;
        }

        let mut output = File::create(&planned.target_path).map_err(|e| {
            format!(
                "Failed to create imported migration file '{}': {e}",
                planned.target_path.display()
            )
        })?;

        io::copy(&mut entry, &mut output).map_err(|e| {
            format!(
                "Failed to import migration file '{}': {e}",
                planned.target_path.display()
            )
        })?;

        imported_files += 1;
        if planned.is_profile_target {
            imported_profile_files += 1;
        } else {
            imported_locallow_files += 1;
        }
    }

    Ok((
        imported_files,
        imported_profile_files,
        imported_locallow_files,
    ))
}

pub fn export_migration_data<R: Runtime>(
    app: &AppHandle<R>,
    output_path: Option<String>,
    encryption_enabled: bool,
    password: Option<String>,
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

    let zip_bytes = build_zip_bytes(&profile_files, &locallow_files)?;
    let (archive_bytes, encrypted) =
        build_snrdata_container(&zip_bytes, encryption_enabled, password.as_deref())?;

    let archive_path = resolve_archive_output_path(app, output_path)?;
    if let Some(parent) = archive_path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            format!(
                "Failed to create output directory for migration archive '{}': {e}",
                parent.display()
            )
        })?;
    }

    fs::write(&archive_path, archive_bytes).map_err(|e| {
        format!(
            "Failed to write migration archive '{}': {e}",
            archive_path.display()
        )
    })?;

    Ok(MigrationExportSummary {
        archive_path,
        included_files: profile_files.len() + locallow_files.len(),
        profile_files: profile_files.len(),
        locallow_files: locallow_files.len(),
        encrypted,
    })
}

pub fn import_migration_data<R: Runtime>(
    app: &AppHandle<R>,
    archive_path: &Path,
    password: Option<String>,
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

    let (zip_bytes, encrypted) =
        read_zip_bytes_from_archive_file(archive_path, password.as_deref())?;
    let mut archive = ZipArchive::new(Cursor::new(zip_bytes))
        .map_err(|e| format!("Invalid migration archive format: {e}"))?;

    let launcher_settings = settings::load_or_init_settings(app)?;
    let profile_root = PathBuf::from(launcher_settings.profile_path);
    let (locallow_root, locallow_snr_dir) = resolve_locallow_snr_dir()?;
    let profile_patterns = compile_profile_patterns()?;

    let planned_files = plan_import_files(
        &mut archive,
        &profile_root,
        &locallow_root,
        &profile_patterns,
    )?;
    if planned_files.is_empty() {
        return Err("No supported migration entries were found in the archive.".to_string());
    }

    let backup_root = create_backup_root(app)?;
    let apply_result = (|| -> Result<MigrationImportSummary, String> {
        backup_and_clean_profile(&profile_root, &profile_patterns, &backup_root)?;
        backup_and_clean_locallow(&locallow_snr_dir, &backup_root)?;

        let (imported_files, imported_profile_files, imported_locallow_files) =
            apply_import_files(&mut archive, &planned_files)?;

        Ok(MigrationImportSummary {
            imported_files,
            profile_files: imported_profile_files,
            locallow_files: imported_locallow_files,
            encrypted,
        })
    })();

    match apply_result {
        Ok(summary) => {
            let _ = fs::remove_dir_all(&backup_root);
            Ok(summary)
        }
        Err(import_error) => {
            let rollback_result = rollback_after_failed_import(
                &profile_root,
                &profile_patterns,
                &locallow_snr_dir,
                &backup_root,
            );
            let _ = fs::remove_dir_all(&backup_root);

            if let Err(rollback_error) = rollback_result {
                Err(format!(
                    "{import_error} Rollback failed and manual recovery may be required: {rollback_error}"
                ))
            } else {
                Err(import_error)
            }
        }
    }
}

pub fn validate_migration_archive_password(
    archive_path: &Path,
    password: Option<String>,
) -> Result<MigrationPasswordValidationSummary, String> {
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

    let (zip_bytes, encrypted) =
        read_zip_bytes_from_archive_file(archive_path, password.as_deref())?;
    let mut archive = ZipArchive::new(Cursor::new(zip_bytes))
        .map_err(|e| format!("Invalid migration archive format: {e}"))?;

    for index in 0..archive.len() {
        archive
            .by_index(index)
            .map_err(|e| format!("Failed to read migration archive entry {index}: {e}"))?;
    }

    Ok(MigrationPasswordValidationSummary { encrypted })
}
