use serde_json::Value;
use std::env;
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};

#[cfg(windows)]
use std::io;

const PLAYER_DATA_RELATIVE_PATH: &[&str] = &[
    "AppData",
    "LocalLow",
    "Innersloth",
    "Among Us",
    "player.amogus",
];
const PLAYER_DATA_BACKUP_EXTENSION: &str = "amogus.snr-backup";
const VANILLA_COLOR_ID_MIN: i64 = 0;
const VANILLA_COLOR_ID_MAX: i64 = 17;
const DEFAULT_COLOR_ID: i64 = 0;
const MODDED_COSMETIC_PREFIX: &str = "Modded_";
static PLAYER_DATA_TEMP_FILE_SEQUENCE: AtomicU64 = AtomicU64::new(0);
const COSMETIC_DEFAULTS: &[(&str, &str)] = &[
    ("pet", "pet_EmptyPet"),
    ("hat", "hat_NoHat"),
    ("skin", "skin_None"),
    ("visor", "visor_EmptyVisor"),
    ("namePlate", "nameplate_NoPlate"),
];

fn default_player_data_path() -> Result<PathBuf, String> {
    let user_profile = env::var_os("USERPROFILE")
        .filter(|value| !value.is_empty())
        .ok_or_else(|| "USERPROFILE environment variable is not available".to_string())?;

    let mut path = PathBuf::from(user_profile);
    for segment in PLAYER_DATA_RELATIVE_PATH {
        path.push(segment);
    }
    Ok(path)
}

fn cleanup_customization(root: &mut Value) -> bool {
    let Some(customization) = root.get_mut("customization").and_then(Value::as_object_mut) else {
        return false;
    };

    let mut changed = false;
    for (field, default_value) in COSMETIC_DEFAULTS {
        let Some(value) = customization.get_mut(*field) else {
            continue;
        };
        if value
            .as_str()
            .is_some_and(|cosmetic| cosmetic.starts_with(MODDED_COSMETIC_PREFIX))
        {
            *value = Value::String((*default_value).to_string());
            changed = true;
        }
    }

    // 現行ファイルはcolorIDだが、表記違いのデータも安全に補正する。
    for field in ["colorID", "colorId"] {
        let Some(value) = customization.get_mut(field) else {
            continue;
        };
        let is_outside_vanilla_range = value.as_i64().is_some_and(|color_id| {
            !(VANILLA_COLOR_ID_MIN..=VANILLA_COLOR_ID_MAX).contains(&color_id)
        }) || value
            .as_u64()
            .is_some_and(|color_id| color_id > VANILLA_COLOR_ID_MAX as u64)
            || value.as_f64().is_some_and(|color_id| {
                !(VANILLA_COLOR_ID_MIN as f64..=VANILLA_COLOR_ID_MAX as f64).contains(&color_id)
            });
        if is_outside_vanilla_range {
            *value = Value::from(DEFAULT_COLOR_ID);
            changed = true;
        }
    }

    changed
}

fn create_player_data_temp_file(path: &Path) -> Result<(PathBuf, fs::File), String> {
    let parent = path
        .parent()
        .filter(|parent| !parent.as_os_str().is_empty())
        .unwrap_or_else(|| Path::new("."));
    let file_name = path
        .file_name()
        .map(|name| name.to_string_lossy())
        .unwrap_or_else(|| "player-data".into());

    for _ in 0..1000 {
        let sequence = PLAYER_DATA_TEMP_FILE_SEQUENCE.fetch_add(1, Ordering::Relaxed);
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
            Err(error) if error.kind() == std::io::ErrorKind::AlreadyExists => continue,
            Err(error) => {
                return Err(format!(
                    "Failed to create temporary player data file '{}' for '{}': {error}",
                    candidate.display(),
                    path.display()
                ));
            }
        }
    }

    Err(format!(
        "Failed to allocate a unique temporary player data file next to '{}' after 1000 attempts",
        path.display()
    ))
}

#[cfg(windows)]
fn atomic_replace_player_data(source: &Path, destination: &Path) -> io::Result<()> {
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

    // SAFETY: Both paths remain valid NUL-terminated UTF-16 buffers for the duration of the call.
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
fn atomic_replace_player_data(source: &Path, destination: &Path) -> std::io::Result<()> {
    fs::rename(source, destination)
}

fn write_player_data_atomically(path: &Path, serialized: &[u8]) -> Result<(), String> {
    let (temp_path, mut temp_file) = create_player_data_temp_file(path)?;
    let result = (|| -> Result<(), String> {
        temp_file.write_all(serialized).map_err(|error| {
            format!(
                "Failed to write temporary player data file '{}' for '{}': {error}",
                temp_path.display(),
                path.display()
            )
        })?;
        temp_file.sync_all().map_err(|error| {
            format!(
                "Failed to synchronize temporary player data file '{}' for '{}': {error}",
                temp_path.display(),
                path.display()
            )
        })?;
        drop(temp_file);

        atomic_replace_player_data(&temp_path, path).map_err(|error| {
            format!(
                "Failed to atomically replace player data file '{}' using '{}': {error}",
                path.display(),
                temp_path.display()
            )
        })
    })();

    if result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    result
}

fn cleanup_player_data_at(path: &Path) -> Result<(), String> {
    if !path.exists() {
        // Among Usをまだ起動していない環境ではデータがないため、そのまま起動を許可する。
        return Ok(());
    }

    let content =
        fs::read(path).map_err(|error| format!("Failed to read '{}': {error}", path.display()))?;
    let mut root: Value = serde_json::from_slice(&content)
        .map_err(|error| format!("Failed to parse '{}': {error}", path.display()))?;

    if !cleanup_customization(&mut root) {
        return Ok(());
    }

    let serialized = serde_json::to_vec_pretty(&root)
        .map_err(|error| format!("Failed to serialize '{}': {error}", path.display()))?;
    let backup_path = path.with_extension(PLAYER_DATA_BACKUP_EXTENSION);
    fs::copy(path, &backup_path).map_err(|error| {
        format!(
            "Failed to back up '{}' to '{}': {error}",
            path.display(),
            backup_path.display()
        )
    })?;

    write_player_data_atomically(path, &serialized)
}

fn player_data_requires_cleanup_at(path: &Path) -> Result<bool, String> {
    if !path.exists() {
        return Ok(false);
    }

    let content =
        fs::read(path).map_err(|error| format!("Failed to read '{}': {error}", path.display()))?;
    let mut root: Value = serde_json::from_slice(&content)
        .map_err(|error| format!("Failed to parse '{}': {error}", path.display()))?;
    Ok(cleanup_customization(&mut root))
}

pub fn cleanup_default_player_data() -> Result<(), String> {
    cleanup_player_data_at(&default_player_data_path()?)
}

pub fn default_player_data_requires_cleanup() -> Result<bool, String> {
    player_data_requires_cleanup_at(&default_player_data_path()?)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn removes_only_modded_cosmetics_and_resets_out_of_range_color() {
        let mut data = json!({
            "customization": {
                "name": "Modded_PlayerNameMustRemain",
                "colorID": 18,
                "colorId": 18.0,
                "pet": "Modded_CustomPet",
                "hat": "Modded_CustomHat",
                "skin": "skin_None",
                "visor": "Modded_CustomVisor",
                "namePlate": "Modded_CustomPlate"
            },
            "unrelated": { "keep": true }
        });

        assert!(cleanup_customization(&mut data));
        assert_eq!(data["customization"]["name"], "Modded_PlayerNameMustRemain");
        assert_eq!(data["customization"]["colorID"], 0);
        assert_eq!(data["customization"]["colorId"], 0);
        assert_eq!(data["customization"]["pet"], "pet_EmptyPet");
        assert_eq!(data["customization"]["hat"], "hat_NoHat");
        assert_eq!(data["customization"]["skin"], "skin_None");
        assert_eq!(data["customization"]["visor"], "visor_EmptyVisor");
        assert_eq!(data["customization"]["namePlate"], "nameplate_NoPlate");
        assert_eq!(data["unrelated"]["keep"], true);
    }

    #[test]
    fn leaves_vanilla_customization_unchanged() {
        let mut data = json!({
            "customization": {
                "colorID": 17,
                "pet": "pet_EmptyPet",
                "hat": "hat_NoHat",
                "skin": "skin_None",
                "visor": "visor_EmptyVisor",
                "namePlate": "nameplate_NoPlate"
            }
        });
        let original = data.clone();

        assert!(!cleanup_customization(&mut data));
        assert_eq!(data, original);
    }

    #[test]
    fn resets_negative_color_id() {
        let mut data = json!({ "customization": { "colorId": -1 } });

        assert!(cleanup_customization(&mut data));
        assert_eq!(data["customization"]["colorId"], 0);
    }

    #[test]
    fn writes_cleaned_data_and_preserves_original_backup() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time must be after Unix epoch")
            .as_nanos();
        let test_dir = env::temp_dir().join(format!(
            "snr-player-data-cleanup-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&test_dir).expect("test directory must be created");
        let player_path = test_dir.join("player.amogus");
        let original = br#"{"customization":{"colorID":99,"hat":"Modded_Hat"}}"#;
        fs::write(&player_path, original).expect("test player data must be written");

        assert!(player_data_requires_cleanup_at(&player_path)
            .expect("cleanup requirement check must succeed"));
        cleanup_player_data_at(&player_path).expect("cleanup must succeed");

        let cleaned: Value = serde_json::from_slice(
            &fs::read(&player_path).expect("cleaned player data must be readable"),
        )
        .expect("cleaned player data must remain valid JSON");
        assert_eq!(cleaned["customization"]["colorID"], 0);
        assert_eq!(cleaned["customization"]["hat"], "hat_NoHat");
        assert!(!player_data_requires_cleanup_at(&player_path)
            .expect("post-cleanup requirement check must succeed"));
        assert_eq!(
            fs::read(player_path.with_extension(PLAYER_DATA_BACKUP_EXTENSION))
                .expect("backup must be readable"),
            original
        );

        fs::remove_dir_all(test_dir).expect("test directory must be removed");
    }
}
