use crate::utils::{
    epic_api::{self, EpicApi},
    settings,
};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};

static GAME_PROCESS: LazyLock<Mutex<Option<Child>>> = LazyLock::new(|| Mutex::new(None));
static LAST_AUTOLAUNCH_ERROR: LazyLock<Mutex<Option<String>>> = LazyLock::new(|| Mutex::new(None));

pub const AUTOLAUNCH_MODDED_ARGUMENT: &str = "--autolaunch-modded";
const MODDED_SHORTCUT_FILE_NAME: &str = "SuperNewRoles Mod Launch.lnk";

#[derive(Clone, serde::Serialize)]
pub struct GameStatePayload {
    pub running: bool,
}

pub fn clear_autolaunch_error() {
    if let Ok(mut guard) = LAST_AUTOLAUNCH_ERROR.lock() {
        *guard = None;
    }
}

pub fn set_autolaunch_error(message: String) {
    if let Ok(mut guard) = LAST_AUTOLAUNCH_ERROR.lock() {
        *guard = Some(message);
    }
}

#[tauri::command]
pub fn take_autolaunch_error() -> Option<String> {
    match LAST_AUTOLAUNCH_ERROR.lock() {
        Ok(mut guard) => guard.take(),
        Err(_) => Some("Failed to access auto launch error state".to_string()),
    }
}

#[cfg(windows)]
fn escape_powershell_single_quoted(value: &str) -> String {
    value.replace('\'', "''")
}

#[cfg(windows)]
fn create_shortcut_with_powershell(
    shortcut_path: &Path,
    target_path: &Path,
    arguments: &str,
    working_directory: &Path,
    description: &str,
) -> Result<(), String> {
    let shortcut_path = escape_powershell_single_quoted(&shortcut_path.to_string_lossy());
    let target_path = escape_powershell_single_quoted(&target_path.to_string_lossy());
    let arguments = escape_powershell_single_quoted(arguments);
    let working_directory = escape_powershell_single_quoted(&working_directory.to_string_lossy());
    let icon_location = target_path.clone();
    let description = escape_powershell_single_quoted(description);

    let script = format!(
        "$ErrorActionPreference = 'Stop'; \
         $wsh = New-Object -ComObject WScript.Shell; \
         $shortcut = $wsh.CreateShortcut('{shortcut_path}'); \
         $shortcut.TargetPath = '{target_path}'; \
         $shortcut.Arguments = '{arguments}'; \
         $shortcut.WorkingDirectory = '{working_directory}'; \
         $shortcut.IconLocation = '{icon_location}'; \
         $shortcut.Description = '{description}'; \
         $shortcut.Save();"
    );

    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-NonInteractive",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &script,
        ])
        .output()
        .map_err(|e| format!("Failed to execute PowerShell for shortcut creation: {e}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let detail = if !stderr.is_empty() {
        stderr
    } else if !stdout.is_empty() {
        stdout
    } else {
        "No detail".to_string()
    };

    Err(format!("PowerShell shortcut creation failed: {detail}"))
}

#[tauri::command]
pub fn create_modded_launch_shortcut() -> Result<String, String> {
    #[cfg(windows)]
    {
        let launcher_exe = std::env::current_exe()
            .map_err(|e| format!("Failed to resolve launcher executable path: {e}"))?;
        let working_directory = launcher_exe
            .parent()
            .ok_or_else(|| "Launcher executable directory is invalid".to_string())?;

        let desktop_dir = std::env::var_os("USERPROFILE")
            .map(PathBuf::from)
            .map(|path| path.join("Desktop"))
            .ok_or_else(|| "Failed to resolve desktop directory: USERPROFILE is not set".to_string())?;
        fs::create_dir_all(&desktop_dir)
            .map_err(|e| format!("Failed to create desktop directory: {e}"))?;

        let shortcut_path = desktop_dir.join(MODDED_SHORTCUT_FILE_NAME);
        create_shortcut_with_powershell(
            &shortcut_path,
            &launcher_exe,
            AUTOLAUNCH_MODDED_ARGUMENT,
            working_directory,
            "Launch SuperNewRoles modded",
        )?;

        return Ok(shortcut_path.to_string_lossy().to_string());
    }

    #[cfg(not(windows))]
    {
        Err("Shortcut creation is only supported on Windows".to_string())
    }
}

fn monitor_game_process<R: Runtime>(app: AppHandle<R>) {
    std::thread::spawn(move || {
        let _ = app.emit("game-state-changed", GameStatePayload { running: true });

        loop {
            std::thread::sleep(Duration::from_millis(500));

            let Ok(mut guard) = GAME_PROCESS.lock() else {
                break;
            };

            match guard.as_mut().and_then(|process| process.try_wait().ok()) {
                Some(Some(_)) | None => {
                    *guard = None;
                    break;
                }
                Some(None) => {}
            }
        }

        let _ = app.emit("game-state-changed", GameStatePayload { running: false });
    });
}

#[cfg(windows)]
fn set_dll_directory(path: &str) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::System::LibraryLoader::SetDllDirectoryW;

    let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
    // SAFETY: `wide` is null-terminated and alive for the duration of the call.
    unsafe { SetDllDirectoryW(PCWSTR(wide.as_ptr())) }
        .map_err(|e| format!("SetDllDirectory failed: {e}"))
}

fn launch_process<R: Runtime>(app: AppHandle<R>, mut command: Command) -> Result<(), String> {
    {
        let mut guard = GAME_PROCESS
            .lock()
            .map_err(|_| "Failed to acquire game process lock".to_string())?;

        if guard
            .as_mut()
            .is_some_and(|child| child.try_wait().ok().flatten().is_none())
        {
            return Err("Game is already running".to_string());
        }

        let child = command
            .spawn()
            .map_err(|e| format!("Failed to launch game process: {e}"))?;
        *guard = Some(child);
    }

    monitor_game_process(app);
    Ok(())
}

fn ensure_file_exists(path: &Path, label: &str) -> Result<(), String> {
    if path.is_file() {
        Ok(())
    } else {
        Err(format!("{label} not found: {}", path.to_string_lossy()))
    }
}

pub async fn launch_modded_from_saved_settings<R: Runtime>(
    app: AppHandle<R>,
) -> Result<(), String> {
    let launcher_settings = settings::load_or_init_settings(&app)?;
    let among_us_path = launcher_settings.among_us_path.trim();
    if among_us_path.is_empty() {
        return Err("Among Us path is not configured".to_string());
    }

    let profile_path = launcher_settings.profile_path.trim();
    if profile_path.is_empty() {
        return Err("Profile path is not configured".to_string());
    }

    let game_exe_path = PathBuf::from(among_us_path).join("Among Us.exe");
    launch_modded(
        app,
        game_exe_path.to_string_lossy().to_string(),
        profile_path.to_string(),
        launcher_settings.game_platform.as_str().to_string(),
    )
    .await
}

#[tauri::command]
pub async fn launch_modded<R: Runtime>(
    app: AppHandle<R>,
    game_exe: String,
    profile_path: String,
    platform: String,
) -> Result<(), String> {
    let game_exe_path = PathBuf::from(&game_exe);
    ensure_file_exists(&game_exe_path, "Game executable")?;

    let profile_path = PathBuf::from(&profile_path);
    let bepinex_dll = profile_path
        .join("BepInEx")
        .join("core")
        .join("BepInEx.Unity.IL2CPP.dll");
    let dotnet_dir = profile_path.join("dotnet");
    let coreclr_path = dotnet_dir.join("coreclr.dll");

    ensure_file_exists(&bepinex_dll, "BepInEx IL2CPP DLL")?;
    ensure_file_exists(&coreclr_path, "dotnet coreclr")?;

    let game_dir = game_exe_path
        .parent()
        .ok_or_else(|| "Invalid game executable path".to_string())?;

    #[cfg(windows)]
    set_dll_directory(&profile_path.to_string_lossy())?;

    let bepinex_dll_str = bepinex_dll.to_string_lossy().to_string();
    let dotnet_dir_str = dotnet_dir.to_string_lossy().to_string();
    let coreclr_path_str = coreclr_path.to_string_lossy().to_string();

    let mut command = Command::new(&game_exe_path);
    command
        .current_dir(game_dir)
        .args(["--doorstop-enabled", "true"])
        .args(["--doorstop-target-assembly", &bepinex_dll_str])
        .args(["--doorstop-clr-corlib-dir", &dotnet_dir_str])
        .args(["--doorstop-clr-runtime-coreclr-path", &coreclr_path_str]);

    if platform.trim().eq_ignore_ascii_case("epic") {
        if let Some(session) = epic_api::load_session() {
            if let Ok(api) = EpicApi::new() {
                match api.get_game_token(&session).await {
                    Ok(token) => {
                        command.arg(format!("-AUTH_PASSWORD={token}"));
                    }
                    Err(error) => {
                        eprintln!("Epic token request failed, launching anyway: {error}");
                    }
                }
            }
        }
    }

    launch_process(app, command)
}

#[tauri::command]
pub async fn launch_vanilla<R: Runtime>(
    app: AppHandle<R>,
    game_exe: String,
    platform: String,
) -> Result<(), String> {
    let game_exe_path = PathBuf::from(&game_exe);
    ensure_file_exists(&game_exe_path, "Game executable")?;
    let game_dir = game_exe_path
        .parent()
        .ok_or_else(|| "Invalid game executable path".to_string())?;

    let mut command = Command::new(&game_exe_path);
    command.current_dir(game_dir);

    if platform.trim().eq_ignore_ascii_case("epic") {
        if let Some(session) = epic_api::load_session() {
            if let Ok(api) = EpicApi::new() {
                match api.get_game_token(&session).await {
                    Ok(token) => {
                        command.arg(format!("-AUTH_PASSWORD={token}"));
                    }
                    Err(error) => {
                        eprintln!("Epic token request failed, launching anyway: {error}");
                    }
                }
            }
        }
    }

    launch_process(app, command)
}
