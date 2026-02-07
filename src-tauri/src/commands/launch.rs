use crate::utils::epic_api::{self, EpicApi};
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::{LazyLock, Mutex};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Runtime};

static GAME_PROCESS: LazyLock<Mutex<Option<Child>>> = LazyLock::new(|| Mutex::new(None));

#[derive(Clone, serde::Serialize)]
pub struct GameStatePayload {
    pub running: bool,
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
