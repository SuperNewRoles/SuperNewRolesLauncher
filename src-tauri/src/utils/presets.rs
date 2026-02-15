use std::collections::{BTreeMap, BTreeSet, HashMap, HashSet};
use std::fs::{self, File};
use std::io::{self, Read};
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Runtime};
use zip::{CompressionMethod, ZipArchive, ZipWriter};

use crate::utils::settings;

const PRESET_ARCHIVE_EXTENSION: &str = "snrpresets";
const PRESET_ARCHIVE_DIR_NAME: &str = "presets";
const SAVE_DATA_RELATIVE_PATH: &str = "SuperNewRolesNext/SaveData";
const OPTIONS_FILE_NAME: &str = "Options.data";
const PRESET_FILE_PREFIX: &str = "PresetOptions_";
const PRESET_FILE_SUFFIX: &str = ".data";
const OPTIONS_ARCHIVE_PATH: &str = "SuperNewRolesNext/SaveData/Options.data";
const PRESET_ARCHIVE_FILE_PREFIX_LOWER: &str = "supernewrolesnext/savedata/presetoptions_";

#[derive(Debug, Clone)]
pub struct PresetEntrySummary {
    pub id: i32,
    pub name: String,
    pub has_data_file: bool,
}

#[derive(Debug, Clone)]
pub struct PresetExportSummary {
    pub archive_path: PathBuf,
    pub exported_presets: usize,
}

#[derive(Debug, Clone)]
pub struct PresetImportSelection {
    pub source_id: i32,
    pub name: Option<String>,
}

#[derive(Debug, Clone)]
pub struct ImportedPresetSummary {
    pub source_id: i32,
    pub target_id: i32,
    pub name: String,
}

#[derive(Debug, Clone)]
pub struct PresetImportSummary {
    pub imported_presets: usize,
    pub imported: Vec<ImportedPresetSummary>,
}

#[derive(Debug, Clone)]
struct OptionsData {
    version: u8,
    current_preset: i32,
    preset_names: BTreeMap<i32, String>,
}

#[derive(Debug, Clone)]
struct ArchiveContents {
    options: OptionsData,
    preset_files: HashMap<i32, Vec<u8>>,
}

fn normalize_path_for_archive(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/")
}

fn make_default_preset_name(preset_id: i32) -> String {
    format!("Preset {}", preset_id.saturating_add(1))
}

fn preset_file_name(preset_id: i32) -> String {
    format!("{PRESET_FILE_PREFIX}{preset_id}{PRESET_FILE_SUFFIX}")
}

fn preset_file_path(save_data_dir: &Path, preset_id: i32) -> PathBuf {
    save_data_dir.join(preset_file_name(preset_id))
}

fn parse_preset_id_from_local_file_name(file_name: &str) -> Option<i32> {
    if !file_name.starts_with(PRESET_FILE_PREFIX) || !file_name.ends_with(PRESET_FILE_SUFFIX) {
        return None;
    }

    let numeric = &file_name[PRESET_FILE_PREFIX.len()..file_name.len() - PRESET_FILE_SUFFIX.len()];
    numeric.parse::<i32>().ok().filter(|id| *id >= 0)
}

fn parse_preset_id_from_archive_path(path: &str) -> Option<i32> {
    let normalized = path.replace('\\', "/");
    let lower = normalized.to_ascii_lowercase();

    if !lower.starts_with(PRESET_ARCHIVE_FILE_PREFIX_LOWER) || !lower.ends_with(PRESET_FILE_SUFFIX)
    {
        return None;
    }

    let start = PRESET_ARCHIVE_FILE_PREFIX_LOWER.len();
    let end = normalized.len().saturating_sub(PRESET_FILE_SUFFIX.len());
    if end <= start {
        return None;
    }

    normalized[start..end]
        .parse::<i32>()
        .ok()
        .filter(|id| *id >= 0)
}

fn read_i32_le(bytes: &[u8], cursor: &mut usize, field: &str) -> Result<i32, String> {
    if *cursor + 4 > bytes.len() {
        return Err(format!(
            "Unexpected end of Options.data while reading {field}."
        ));
    }

    let mut buffer = [0u8; 4];
    buffer.copy_from_slice(&bytes[*cursor..*cursor + 4]);
    *cursor += 4;
    Ok(i32::from_le_bytes(buffer))
}

fn read_7bit_encoded_int(bytes: &[u8], cursor: &mut usize) -> Result<usize, String> {
    let mut value = 0usize;
    let mut shift = 0usize;

    for _ in 0..5 {
        if *cursor >= bytes.len() {
            return Err(
                "Unexpected end of Options.data while reading a string length.".to_string(),
            );
        }

        let byte = bytes[*cursor];
        *cursor += 1;

        value |= ((byte & 0x7f) as usize) << shift;

        if (byte & 0x80) == 0 {
            return Ok(value);
        }

        shift += 7;
    }

    Err("Invalid 7-bit encoded string length in Options.data.".to_string())
}

fn read_dotnet_string(bytes: &[u8], cursor: &mut usize) -> Result<String, String> {
    let length = read_7bit_encoded_int(bytes, cursor)?;
    if *cursor + length > bytes.len() {
        return Err(
            "Unexpected end of Options.data while reading a preset name string.".to_string(),
        );
    }

    let raw = &bytes[*cursor..*cursor + length];
    *cursor += length;

    String::from_utf8(raw.to_vec())
        .map_err(|e| format!("Failed to decode preset name from Options.data as UTF-8: {e}"))
}

fn write_7bit_encoded_int(mut value: usize, out: &mut Vec<u8>) {
    loop {
        let mut byte = (value & 0x7f) as u8;
        value >>= 7;
        if value != 0 {
            byte |= 0x80;
        }
        out.push(byte);
        if value == 0 {
            break;
        }
    }
}

fn write_dotnet_string(value: &str, out: &mut Vec<u8>) {
    let raw = value.as_bytes();
    write_7bit_encoded_int(raw.len(), out);
    out.extend_from_slice(raw);
}

fn parse_options_data(bytes: &[u8]) -> Result<OptionsData, String> {
    if bytes.len() < 11 {
        return Err("Options.data is too short to parse.".to_string());
    }

    let version = bytes[0];
    let checksum_seed = bytes[1] as u16;
    let checksum = bytes[2] as u16;

    if checksum_seed.saturating_mul(checksum_seed) != checksum {
        return Err(
            "Options.data checksum validation failed (random^2 check mismatch).".to_string(),
        );
    }

    let mut cursor = 3usize;
    let current_preset = read_i32_le(bytes, &mut cursor, "current preset")?;
    let name_count = read_i32_le(bytes, &mut cursor, "preset name count")?;
    if name_count < 0 {
        return Err("Options.data contains a negative preset name count.".to_string());
    }

    let mut preset_names = BTreeMap::new();
    for _ in 0..name_count {
        let preset_id = read_i32_le(bytes, &mut cursor, "preset id")?;
        let name = read_dotnet_string(bytes, &mut cursor)?;
        if preset_id >= 0 {
            preset_names.insert(preset_id, name);
        }
    }

    Ok(OptionsData {
        version,
        current_preset,
        preset_names,
    })
}

fn checksum_seed() -> u8 {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .subsec_nanos();
    (nanos % 15) as u8
}

fn build_options_data(options: &OptionsData) -> Result<Vec<u8>, String> {
    let mut output = Vec::new();
    let version = if options.version == 0 {
        1
    } else {
        options.version
    };

    output.push(version);

    let seed = checksum_seed();
    output.push(seed);
    output.push(seed.saturating_mul(seed));

    output.extend_from_slice(&options.current_preset.to_le_bytes());

    let name_count = i32::try_from(options.preset_names.len())
        .map_err(|_| "Too many preset names to serialize into Options.data".to_string())?;
    output.extend_from_slice(&name_count.to_le_bytes());

    for (preset_id, name) in &options.preset_names {
        output.extend_from_slice(&preset_id.to_le_bytes());
        write_dotnet_string(name, &mut output);
    }

    Ok(output)
}

fn profile_save_data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let launcher_settings = settings::load_or_init_settings(app)?;
    let profile_path = launcher_settings.profile_path.trim();
    if profile_path.is_empty() {
        return Err("Profile path is not configured.".to_string());
    }

    Ok(PathBuf::from(profile_path)
        .join("SuperNewRolesNext")
        .join("SaveData"))
}

fn load_options_data(path: &Path) -> Result<Option<OptionsData>, String> {
    if !path.is_file() {
        return Ok(None);
    }

    let bytes = fs::read(path)
        .map_err(|e| format!("Failed to read Options.data '{}': {e}", path.display()))?;
    let options = parse_options_data(&bytes)?;
    Ok(Some(options))
}

fn collect_existing_preset_ids(save_data_dir: &Path) -> Result<BTreeSet<i32>, String> {
    let mut ids = BTreeSet::new();

    if !save_data_dir.is_dir() {
        return Ok(ids);
    }

    for entry in fs::read_dir(save_data_dir).map_err(|e| {
        format!(
            "Failed to read SaveData directory '{}': {e}",
            save_data_dir.display()
        )
    })? {
        let entry = entry.map_err(|e| {
            format!(
                "Failed to read an entry in SaveData directory '{}': {e}",
                save_data_dir.display()
            )
        })?;

        if !entry.path().is_file() {
            continue;
        }

        let Some(file_name) = entry.file_name().to_str().map(|v| v.to_string()) else {
            continue;
        };

        if let Some(id) = parse_preset_id_from_local_file_name(&file_name) {
            ids.insert(id);
        }
    }

    Ok(ids)
}

fn make_default_archive_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    let base_dir = settings::app_data_dir(app)?;
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    Ok(base_dir.join(PRESET_ARCHIVE_DIR_NAME).join(format!(
        "snr-presets-{timestamp}.{PRESET_ARCHIVE_EXTENSION}"
    )))
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
        Some(ext) if ext.eq_ignore_ascii_case(PRESET_ARCHIVE_EXTENSION) => {}
        Some(_) => {
            return Err(format!(
                "Export path must end with .{PRESET_ARCHIVE_EXTENSION}: {}",
                output.display()
            ));
        }
        None => {
            output.set_extension(PRESET_ARCHIVE_EXTENSION);
        }
    }

    Ok(output)
}

fn archive_extension_is_supported(path: &Path) -> bool {
    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            let ext_lower = ext.to_ascii_lowercase();
            ext_lower == PRESET_ARCHIVE_EXTENSION || ext_lower == "zip"
        })
        .unwrap_or(false)
}

fn write_bytes_to_zip(
    zip: &mut ZipWriter<File>,
    archive_path: &str,
    data: &[u8],
) -> Result<(), String> {
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);

    zip.start_file(archive_path, options)
        .map_err(|e| format!("Failed to start zip entry '{archive_path}': {e}"))?;

    let mut reader = io::Cursor::new(data);
    io::copy(&mut reader, zip)
        .map_err(|e| format!("Failed to write zip entry '{archive_path}': {e}"))?;

    Ok(())
}

fn write_file_to_zip(
    zip: &mut ZipWriter<File>,
    source: &Path,
    archive_path: &str,
) -> Result<(), String> {
    let mut input = File::open(source).map_err(|e| {
        format!(
            "Failed to open preset source file '{}': {e}",
            source.display()
        )
    })?;

    let options = zip::write::SimpleFileOptions::default()
        .compression_method(CompressionMethod::Deflated)
        .unix_permissions(0o644);

    zip.start_file(archive_path, options)
        .map_err(|e| format!("Failed to start zip entry '{archive_path}': {e}"))?;

    io::copy(&mut input, zip)
        .map_err(|e| format!("Failed to write zip entry '{archive_path}': {e}"))?;

    Ok(())
}

fn read_archive_contents(archive_path: &Path) -> Result<ArchiveContents, String> {
    if !archive_path.is_file() {
        return Err(format!(
            "Preset archive was not found: {}",
            archive_path.display()
        ));
    }

    if !archive_extension_is_supported(archive_path) {
        return Err(format!(
            "Unsupported preset archive extension: {}",
            archive_path.display()
        ));
    }

    let input_file = File::open(archive_path).map_err(|e| {
        format!(
            "Failed to open preset archive '{}': {e}",
            archive_path.display()
        )
    })?;
    let mut archive =
        ZipArchive::new(input_file).map_err(|e| format!("Invalid preset archive format: {e}"))?;

    let mut options_bytes: Option<Vec<u8>> = None;
    let mut preset_files = HashMap::new();

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|e| format!("Failed to read preset archive entry {index}: {e}"))?;

        let enclosed = entry.enclosed_name().ok_or_else(|| {
            format!(
                "Refused unsafe preset archive entry path (zip-slip protection): {}",
                entry.name()
            )
        })?;

        if entry.is_dir() {
            continue;
        }

        let normalized = normalize_path_for_archive(&enclosed);
        let mut data = Vec::new();
        entry.read_to_end(&mut data).map_err(|e| {
            format!(
                "Failed to read preset archive entry '{}': {e}",
                entry.name()
            )
        })?;

        if normalized.eq_ignore_ascii_case(OPTIONS_ARCHIVE_PATH) {
            options_bytes = Some(data);
            continue;
        }

        if let Some(preset_id) = parse_preset_id_from_archive_path(&normalized) {
            preset_files.insert(preset_id, data);
        }
    }

    let options_bytes = options_bytes.ok_or_else(|| {
        format!(
            "Preset archive does not contain '{}'.",
            OPTIONS_ARCHIVE_PATH
        )
    })?;
    let options = parse_options_data(&options_bytes)?;

    Ok(ArchiveContents {
        options,
        preset_files,
    })
}

fn normalize_name_key(name: &str) -> String {
    name.trim().to_lowercase()
}

fn make_unique_name(base_name: &str, used_names: &HashSet<String>) -> String {
    let normalized_base = base_name.trim();
    let base = if normalized_base.is_empty() {
        "Preset"
    } else {
        normalized_base
    };

    let base_key = normalize_name_key(base);
    if !used_names.contains(&base_key) {
        return base.to_string();
    }

    let mut index = 2usize;
    loop {
        let candidate = format!("{base} ({index})");
        if !used_names.contains(&normalize_name_key(&candidate)) {
            return candidate;
        }
        index += 1;
    }
}

pub fn list_local_presets<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<Vec<PresetEntrySummary>, String> {
    let save_data_dir = profile_save_data_dir(app)?;
    list_presets_from_save_data_dir(&save_data_dir)
}

pub fn list_presets_from_save_data_dir(
    save_data_dir: &Path,
) -> Result<Vec<PresetEntrySummary>, String> {
    let options_path = save_data_dir.join(OPTIONS_FILE_NAME);

    let Some(options) = load_options_data(&options_path)? else {
        return Ok(Vec::new());
    };

    let mut presets = Vec::new();
    for (id, name) in options.preset_names {
        let display_name = if name.trim().is_empty() {
            make_default_preset_name(id)
        } else {
            name
        };

        presets.push(PresetEntrySummary {
            id,
            name: display_name,
            has_data_file: preset_file_path(&save_data_dir, id).is_file(),
        });
    }

    Ok(presets)
}

pub fn export_selected_presets<R: Runtime>(
    app: &AppHandle<R>,
    preset_ids: Vec<i32>,
    output_path: Option<String>,
) -> Result<PresetExportSummary, String> {
    let selected_ids: BTreeSet<i32> = preset_ids.into_iter().filter(|id| *id >= 0).collect();
    if selected_ids.is_empty() {
        return Err("At least one preset must be selected for export.".to_string());
    }

    let save_data_dir = profile_save_data_dir(app)?;
    let options_path = save_data_dir.join(OPTIONS_FILE_NAME);
    let local_options = load_options_data(&options_path)?.ok_or_else(|| {
        format!(
            "Options.data was not found for preset export: {}",
            options_path.display()
        )
    })?;

    let mut exported_names = BTreeMap::new();
    let mut selected_files = Vec::new();

    for preset_id in selected_ids {
        let preset_name = local_options.preset_names.get(&preset_id).ok_or_else(|| {
            format!("Selected preset id {preset_id} does not exist in local Options.data.")
        })?;

        let source_path = preset_file_path(&save_data_dir, preset_id);
        if !source_path.is_file() {
            return Err(format!(
                "Preset data file was not found for id {preset_id}: {}",
                source_path.display()
            ));
        }

        let name = if preset_name.trim().is_empty() {
            make_default_preset_name(preset_id)
        } else {
            preset_name.trim().to_string()
        };

        exported_names.insert(preset_id, name);
        selected_files.push((preset_id, source_path));
    }

    let current_preset = if exported_names.contains_key(&local_options.current_preset) {
        local_options.current_preset
    } else {
        *exported_names
            .keys()
            .next()
            .ok_or_else(|| "No presets selected for export.".to_string())?
    };

    let export_options = OptionsData {
        version: if local_options.version == 0 {
            1
        } else {
            local_options.version
        },
        current_preset,
        preset_names: exported_names,
    };

    let options_bytes = build_options_data(&export_options)?;
    let archive_path = resolve_archive_output_path(app, output_path)?;

    if let Some(parent) = archive_path.parent() {
        fs::create_dir_all(parent).map_err(|e| {
            format!(
                "Failed to create output directory for preset archive '{}': {e}",
                parent.display()
            )
        })?;
    }

    let output_file = File::create(&archive_path).map_err(|e| {
        format!(
            "Failed to create preset archive '{}': {e}",
            archive_path.display()
        )
    })?;
    let mut zip = ZipWriter::new(output_file);

    write_bytes_to_zip(&mut zip, OPTIONS_ARCHIVE_PATH, &options_bytes)?;

    for (preset_id, source_path) in &selected_files {
        let archive_entry = format!("{SAVE_DATA_RELATIVE_PATH}/{}", preset_file_name(*preset_id));
        write_file_to_zip(&mut zip, source_path, &archive_entry)?;
    }

    zip.finish()
        .map_err(|e| format!("Failed to finalize preset archive: {e}"))?;

    Ok(PresetExportSummary {
        archive_path,
        exported_presets: selected_files.len(),
    })
}

pub fn inspect_preset_archive(archive_path: &Path) -> Result<Vec<PresetEntrySummary>, String> {
    let contents = read_archive_contents(archive_path)?;

    let mut presets = Vec::new();
    for (id, name) in contents.options.preset_names {
        let display_name = if name.trim().is_empty() {
            make_default_preset_name(id)
        } else {
            name
        };

        presets.push(PresetEntrySummary {
            id,
            name: display_name,
            has_data_file: contents.preset_files.contains_key(&id),
        });
    }

    Ok(presets)
}

pub fn import_presets_from_save_data_dir<R: Runtime>(
    app: &AppHandle<R>,
    source_save_data_dir: &Path,
) -> Result<PresetImportSummary, String> {
    if !source_save_data_dir.is_dir() {
        return Err(format!(
            "Source SaveData directory was not found: {}",
            source_save_data_dir.display()
        ));
    }

    let source_options_path = source_save_data_dir.join(OPTIONS_FILE_NAME);
    let source_options = load_options_data(&source_options_path)?.ok_or_else(|| {
        format!(
            "Options.data was not found in source SaveData: {}",
            source_options_path.display()
        )
    })?;
    let source_version = if source_options.version == 0 {
        1
    } else {
        source_options.version
    };

    let mut source_entries = Vec::new();
    for (source_id, source_name) in source_options.preset_names {
        if source_id < 0 {
            continue;
        }

        let source_data_path = preset_file_path(source_save_data_dir, source_id);
        if !source_data_path.is_file() {
            continue;
        }

        let source_data = fs::read(&source_data_path).map_err(|e| {
            format!(
                "Failed to read source preset data file '{}': {e}",
                source_data_path.display()
            )
        })?;

        let normalized_name = if source_name.trim().is_empty() {
            make_default_preset_name(source_id)
        } else {
            source_name.trim().to_string()
        };

        source_entries.push((source_id, normalized_name, source_data));
    }

    if source_entries.is_empty() {
        return Err(
            "No importable presets were found in the source SaveData directory.".to_string(),
        );
    }

    let save_data_dir = profile_save_data_dir(app)?;
    fs::create_dir_all(&save_data_dir).map_err(|e| {
        format!(
            "Failed to create profile SaveData directory '{}': {e}",
            save_data_dir.display()
        )
    })?;

    let options_path = save_data_dir.join(OPTIONS_FILE_NAME);
    let mut local_options = match load_options_data(&options_path)? {
        Some(existing) => existing,
        None => OptionsData {
            version: source_version,
            current_preset: 0,
            preset_names: BTreeMap::new(),
        },
    };
    if local_options.version == 0 {
        local_options.version = source_version;
    }

    let mut used_ids = collect_existing_preset_ids(&save_data_dir)?;
    used_ids.extend(
        local_options
            .preset_names
            .keys()
            .copied()
            .filter(|id| *id >= 0),
    );

    let mut used_names: HashSet<String> = local_options
        .preset_names
        .values()
        .map(|name| normalize_name_key(name))
        .collect();

    let mut imported = Vec::new();
    for (source_id, source_name, source_data) in source_entries {
        let final_name = make_unique_name(&source_name, &used_names);
        used_names.insert(normalize_name_key(&final_name));

        let target_id = used_ids
            .iter()
            .next_back()
            .copied()
            .unwrap_or(-1)
            .checked_add(1)
            .ok_or_else(|| "No free preset id remains for import.".to_string())?;
        used_ids.insert(target_id);

        let target_path = preset_file_path(&save_data_dir, target_id);
        fs::write(&target_path, &source_data).map_err(|e| {
            format!(
                "Failed to write imported preset file '{}': {e}",
                target_path.display()
            )
        })?;

        local_options
            .preset_names
            .insert(target_id, final_name.clone());

        imported.push(ImportedPresetSummary {
            source_id,
            target_id,
            name: final_name,
        });
    }

    if imported.is_empty() {
        return Err("No presets were imported from the source SaveData directory.".to_string());
    }

    if !local_options
        .preset_names
        .contains_key(&local_options.current_preset)
    {
        local_options.current_preset = imported[0].target_id;
    }

    let updated_options = build_options_data(&local_options)?;
    fs::write(&options_path, updated_options).map_err(|e| {
        format!(
            "Failed to write updated Options.data '{}': {e}",
            options_path.display()
        )
    })?;

    Ok(PresetImportSummary {
        imported_presets: imported.len(),
        imported,
    })
}

pub fn import_presets_from_archive<R: Runtime>(
    app: &AppHandle<R>,
    archive_path: &Path,
    selections: Vec<PresetImportSelection>,
) -> Result<PresetImportSummary, String> {
    if selections.is_empty() {
        return Err("At least one preset must be selected for import.".to_string());
    }

    let contents = read_archive_contents(archive_path)?;
    let archive_version = if contents.options.version == 0 {
        1
    } else {
        contents.options.version
    };

    let save_data_dir = profile_save_data_dir(app)?;
    fs::create_dir_all(&save_data_dir).map_err(|e| {
        format!(
            "Failed to create profile SaveData directory '{}': {e}",
            save_data_dir.display()
        )
    })?;

    let options_path = save_data_dir.join(OPTIONS_FILE_NAME);
    let mut local_options = match load_options_data(&options_path)? {
        Some(existing) => existing,
        None => OptionsData {
            version: archive_version,
            current_preset: 0,
            preset_names: BTreeMap::new(),
        },
    };
    if local_options.version == 0 {
        local_options.version = archive_version;
    }

    let mut used_ids = collect_existing_preset_ids(&save_data_dir)?;
    used_ids.extend(
        local_options
            .preset_names
            .keys()
            .copied()
            .filter(|id| *id >= 0),
    );

    let mut used_names: HashSet<String> = local_options
        .preset_names
        .values()
        .map(|name| normalize_name_key(name))
        .collect();

    let mut imported = Vec::new();
    let mut seen_source_ids = HashSet::new();

    for selection in selections {
        let source_id = selection.source_id;
        if source_id < 0 {
            return Err(format!("Invalid source preset id: {source_id}"));
        }

        if !seen_source_ids.insert(source_id) {
            continue;
        }

        let source_name = contents
            .options
            .preset_names
            .get(&source_id)
            .ok_or_else(|| {
                format!(
                "Selected source preset id {source_id} was not found in the archive Options.data."
            )
            })?;

        let source_data = contents.preset_files.get(&source_id).ok_or_else(|| {
            format!(
                "Selected source preset id {source_id} has no matching preset data file in the archive."
            )
        })?;

        let fallback_name = if source_name.trim().is_empty() {
            make_default_preset_name(source_id)
        } else {
            source_name.trim().to_string()
        };

        let requested_name = selection.name.unwrap_or_default();
        let base_name = if requested_name.trim().is_empty() {
            fallback_name
        } else {
            requested_name.trim().to_string()
        };

        let final_name = make_unique_name(&base_name, &used_names);
        used_names.insert(normalize_name_key(&final_name));

        let target_id = used_ids
            .iter()
            .next_back()
            .copied()
            .unwrap_or(-1)
            .checked_add(1)
            .ok_or_else(|| "No free preset id remains for import.".to_string())?;
        used_ids.insert(target_id);

        let target_path = preset_file_path(&save_data_dir, target_id);
        fs::write(&target_path, source_data).map_err(|e| {
            format!(
                "Failed to write imported preset file '{}': {e}",
                target_path.display()
            )
        })?;

        local_options
            .preset_names
            .insert(target_id, final_name.clone());

        imported.push(ImportedPresetSummary {
            source_id,
            target_id,
            name: final_name,
        });
    }

    if imported.is_empty() {
        return Err("No presets were imported from the selected archive entries.".to_string());
    }

    if !local_options
        .preset_names
        .contains_key(&local_options.current_preset)
    {
        local_options.current_preset = imported[0].target_id;
    }

    let updated_options = build_options_data(&local_options)?;
    fs::write(&options_path, updated_options).map_err(|e| {
        format!(
            "Failed to write updated Options.data '{}': {e}",
            options_path.display()
        )
    })?;

    Ok(PresetImportSummary {
        imported_presets: imported.len(),
        imported,
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
            "snr-presets-{label}-{}-{millis}",
            std::process::id()
        ))
    }

    #[test]
    fn list_presets_from_save_data_dir_marks_missing_data_files() {
        let save_data_dir = make_temp_dir("list-presets");
        let _ = fs::remove_dir_all(&save_data_dir);
        fs::create_dir_all(&save_data_dir).expect("failed to create temp dir");

        let mut names = BTreeMap::new();
        names.insert(0, "Alpha".to_string());
        names.insert(1, "Beta".to_string());
        let options = OptionsData {
            version: 1,
            current_preset: 0,
            preset_names: names,
        };
        let options_bytes = build_options_data(&options).expect("failed to build options");
        fs::write(save_data_dir.join(OPTIONS_FILE_NAME), options_bytes)
            .expect("failed to write options");
        fs::write(save_data_dir.join(preset_file_name(0)), [1u8, 2, 3])
            .expect("failed to write preset data");

        let presets = list_presets_from_save_data_dir(&save_data_dir).expect("list failed");
        assert_eq!(presets.len(), 2);
        assert_eq!(presets[0].id, 0);
        assert_eq!(presets[0].name, "Alpha");
        assert!(presets[0].has_data_file);
        assert_eq!(presets[1].id, 1);
        assert_eq!(presets[1].name, "Beta");
        assert!(!presets[1].has_data_file);

        let _ = fs::remove_dir_all(&save_data_dir);
    }
}
