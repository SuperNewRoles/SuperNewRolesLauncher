use std::path::{Path, PathBuf};

#[cfg(target_os = "windows")]
use winreg::{enums::*, RegKey};

const AMONG_US_EXE: &str = "Among Us.exe";
const EPIC_FOLDER: &str = "Among Us_Data/StreamingAssets/aa/EGS";

fn verify_among_us_directory(path: &Path) -> bool {
    path.is_dir() && path.join(AMONG_US_EXE).is_file()
}

fn is_epic_installation(path: &Path) -> bool {
    path.join(EPIC_FOLDER).is_dir()
}

#[cfg(target_os = "windows")]
fn parse_registry_icon_value(raw_value: &str) -> Option<PathBuf> {
    let normalized = raw_value
        .split(',')
        .next()?
        .trim()
        .trim_matches(|c| c == '"' || c == '\'')
        .replace(';', "\\");

    if normalized.is_empty() {
        return None;
    }

    PathBuf::from(normalized).parent().map(|p| p.to_path_buf())
}

#[cfg(target_os = "windows")]
fn detect_from_registry() -> Option<PathBuf> {
    let hkcr = RegKey::predef(HKEY_CLASSES_ROOT);

    for key_name in ["AmongUs", "amongus"] {
        let path = hkcr
            .open_subkey(key_name)
            .ok()
            .and_then(|key| key.open_subkey("DefaultIcon").ok())
            .and_then(|icon_key| icon_key.get_value::<String, _>("").ok())
            .and_then(|raw| parse_registry_icon_value(&raw))
            .filter(|candidate| verify_among_us_directory(candidate));

        if path.is_some() {
            return path;
        }
    }

    None
}

#[cfg(target_os = "windows")]
fn detect_common_paths() -> Vec<PathBuf> {
    let mut candidates = Vec::new();

    if let Some(program_files_x86) = std::env::var_os("ProgramFiles(x86)") {
        let steam_path = PathBuf::from(&program_files_x86)
            .join("Steam")
            .join("steamapps")
            .join("common")
            .join("Among Us");
        candidates.push(steam_path);
    }

    if let Some(program_files) = std::env::var_os("ProgramFiles") {
        let epic_path = PathBuf::from(program_files)
            .join("Epic Games")
            .join("AmongUs");
        candidates.push(epic_path);
    }

    candidates
        .into_iter()
        .filter(|path| verify_among_us_directory(path))
        .collect()
}

pub fn get_among_us_paths() -> Vec<PathBuf> {
    #[cfg(target_os = "windows")]
    {
        let mut paths = Vec::new();
        if let Some(path) = detect_from_registry() {
            paths.push(path);
        }

        for path in detect_common_paths() {
            if !paths.contains(&path) {
                paths.push(path);
            }
        }

        return paths;
    }

    #[allow(unreachable_code)]
    Vec::new()
}

pub fn detect_platform(path: &str) -> Result<String, String> {
    let path = PathBuf::from(path);

    if !verify_among_us_directory(&path) {
        return Err("Invalid Among Us installation directory".to_string());
    }

    if is_epic_installation(&path) {
        Ok("epic".to_string())
    } else {
        Ok("steam".to_string())
    }
}
