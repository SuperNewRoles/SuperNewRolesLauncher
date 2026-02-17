//! ゲーム起動・実行監視・ショートカット生成を扱うサービス層。
//! OS依存処理を内包し、commands層は公開APIだけに集中させる。

use crate::utils::{
    epic_api::{self, EpicApi},
    mod_profile, settings,
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
const RUNNING_GAME_PID_FILE_NAME: &str = "running-game.pid";
const STEAM_APP_ID_FILE_NAME: &str = "steam_appid.txt";
const STEAM_APP_ID_VALUE: &str = "945360";

fn among_us_exe_file_name() -> &'static str {
    mod_profile::get().paths.among_us_exe.as_str()
}

fn among_us_data_dir_name() -> &'static str {
    mod_profile::get().paths.among_us_data_dir.as_str()
}

#[cfg(windows)]
fn modded_shortcut_file_name() -> &'static str {
    mod_profile::get().branding.modded_shortcut_name.as_str()
}

#[cfg(windows)]
fn modded_shortcut_description() -> String {
    format!("Launch {} modded", mod_profile::get().mod_info.display_name)
}

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

pub fn take_autolaunch_error() -> Option<String> {
    match LAST_AUTOLAUNCH_ERROR.lock() {
        Ok(mut guard) => guard.take(),
        Err(_) => Some("Failed to access auto launch error state".to_string()),
    }
}

pub fn is_game_running<R: Runtime>(app: AppHandle<R>) -> Result<bool, String> {
    let mut guard = GAME_PROCESS
        .lock()
        .map_err(|_| "Failed to acquire game process lock".to_string())?;

    match guard.as_mut() {
        Some(process) => match process.try_wait() {
            Ok(Some(_)) => {
                *guard = None;
                clear_persisted_running_game_pid(&app);
                Ok(false)
            }
            Ok(None) => {
                persist_running_game_pid(&app, process.id());
                Ok(true)
            }
            Err(error) => Err(format!("Failed to inspect game process state: {error}")),
        },
        None => {
            drop(guard);

            let Some(pid) = load_persisted_running_game_pid(&app)? else {
                return Ok(false);
            };

            if is_pid_running(pid) {
                return Ok(true);
            }

            clear_persisted_running_game_pid(&app);
            Ok(false)
        }
    }
}

fn running_game_pid_path<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(settings::app_data_dir(app)?.join(RUNNING_GAME_PID_FILE_NAME))
}

fn persist_running_game_pid<R: Runtime>(app: &AppHandle<R>, pid: u32) {
    let path = match running_game_pid_path(app) {
        Ok(path) => path,
        Err(error) => {
            eprintln!("Failed to resolve running game PID path: {error}");
            return;
        }
    };

    if let Some(parent) = path.parent() {
        if let Err(error) = fs::create_dir_all(parent) {
            eprintln!("Failed to create running game PID directory: {error}");
            return;
        }
    }

    if let Err(error) = fs::write(&path, pid.to_string()) {
        eprintln!("Failed to persist running game PID: {error}");
    }
}

fn clear_persisted_running_game_pid<R: Runtime>(app: &AppHandle<R>) {
    let path = match running_game_pid_path(app) {
        Ok(path) => path,
        Err(error) => {
            eprintln!("Failed to resolve running game PID path: {error}");
            return;
        }
    };

    if let Err(error) = fs::remove_file(path) {
        if error.kind() != std::io::ErrorKind::NotFound {
            eprintln!("Failed to clear running game PID: {error}");
        }
    }
}

fn load_persisted_running_game_pid<R: Runtime>(app: &AppHandle<R>) -> Result<Option<u32>, String> {
    let path = running_game_pid_path(app)?;
    let content = match fs::read_to_string(&path) {
        Ok(content) => content,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => {
            return Err(format!(
                "Failed to read running game PID file ({}): {error}",
                path.to_string_lossy()
            ))
        }
    };

    match content.trim().parse::<u32>() {
        Ok(pid) => Ok(Some(pid)),
        Err(_) => {
            clear_persisted_running_game_pid(app);
            Ok(None)
        }
    }
}

#[cfg(windows)]
fn is_pid_running(pid: u32) -> bool {
    let filter = format!("PID eq {pid}");
    let output = match Command::new("tasklist")
        .args(["/FI", &filter, "/FO", "CSV", "/NH"])
        .output()
    {
        Ok(output) => output,
        Err(_) => return false,
    };

    if !output.status.success() {
        return false;
    }

    let among_us_exe = among_us_exe_file_name().to_ascii_lowercase();
    let executable_prefix = format!("\"{among_us_exe}\"");
    let pid_fragment = format!(",\"{pid}\",");
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .any(|line| {
            line.to_ascii_lowercase().starts_with(&executable_prefix)
                && line.contains(&pid_fragment)
        })
}

#[cfg(not(windows))]
fn is_pid_running(_pid: u32) -> bool {
    false
}

#[cfg(windows)]
fn path_to_utf16(value: &Path) -> Vec<u16> {
    use std::os::windows::ffi::OsStrExt;

    value
        .as_os_str()
        .encode_wide()
        .chain(std::iter::once(0))
        .collect()
}

#[cfg(windows)]
fn str_to_utf16(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
fn create_shortcut_with_shell_link(
    shortcut_path: &Path,
    target_path: &Path,
    arguments: &str,
    working_directory: &Path,
    description: &str,
) -> Result<(), String> {
    use windows::core::{Interface, PCWSTR};
    use windows::Win32::Foundation::RPC_E_CHANGED_MODE;
    use windows::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoUninitialize, IPersistFile, CLSCTX_INPROC_SERVER,
        COINIT_MULTITHREADED,
    };
    use windows::Win32::UI::Shell::{IShellLinkW, ShellLink};

    let target_utf16 = path_to_utf16(target_path);
    let arguments_utf16 = str_to_utf16(arguments);
    let working_directory_utf16 = path_to_utf16(working_directory);
    let icon_location_utf16 = target_utf16.clone();
    let description_utf16 = str_to_utf16(description);
    let shortcut_utf16 = path_to_utf16(shortcut_path);

    let com_init_result = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
    let needs_uninitialize = if com_init_result.is_ok() {
        true
    } else if com_init_result == RPC_E_CHANGED_MODE {
        // COM is already initialized on this thread in a different apartment model.
        // In this case we can continue and must not call CoUninitialize here.
        false
    } else {
        return Err(format!("Failed to initialize COM: {com_init_result}"));
    };

    let result = (|| -> Result<(), String> {
        let shell_link: IShellLinkW =
            unsafe { CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER) }
                .map_err(|e| format!("Failed to create shell link: {e}"))?;

        unsafe {
            shell_link
                .SetPath(PCWSTR(target_utf16.as_ptr()))
                .map_err(|e| format!("Failed to set shortcut target path: {e}"))?;
            shell_link
                .SetArguments(PCWSTR(arguments_utf16.as_ptr()))
                .map_err(|e| format!("Failed to set shortcut arguments: {e}"))?;
            shell_link
                .SetWorkingDirectory(PCWSTR(working_directory_utf16.as_ptr()))
                .map_err(|e| format!("Failed to set shortcut working directory: {e}"))?;
            shell_link
                .SetIconLocation(PCWSTR(icon_location_utf16.as_ptr()), 0)
                .map_err(|e| format!("Failed to set shortcut icon: {e}"))?;
            shell_link
                .SetDescription(PCWSTR(description_utf16.as_ptr()))
                .map_err(|e| format!("Failed to set shortcut description: {e}"))?;
        }

        let persist_file: IPersistFile = shell_link
            .cast()
            .map_err(|e| format!("Failed to access persist file interface: {e}"))?;
        unsafe {
            persist_file
                .Save(PCWSTR(shortcut_utf16.as_ptr()), true)
                .map_err(|e| format!("Failed to save shortcut file: {e}"))?;
        }
        Ok(())
    })();

    if needs_uninitialize {
        unsafe { CoUninitialize() };
    }

    result
}

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
            .ok_or_else(|| {
                "Failed to resolve desktop directory: USERPROFILE is not set".to_string()
            })?;
        fs::create_dir_all(&desktop_dir)
            .map_err(|e| format!("Failed to create desktop directory: {e}"))?;

        let shortcut_path = desktop_dir.join(modded_shortcut_file_name());
        let description = modded_shortcut_description();
        create_shortcut_with_shell_link(
            &shortcut_path,
            &launcher_exe,
            AUTOLAUNCH_MODDED_ARGUMENT,
            working_directory,
            &description,
        )?;

        Ok(shortcut_path.to_string_lossy().to_string())
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

        clear_persisted_running_game_pid(&app);
        let _ = app.emit("game-state-changed", GameStatePayload { running: false });
    });
}

#[cfg(windows)]
fn set_dll_directory(path: &str) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::System::LibraryLoader::SetDllDirectoryW;

    let wide: Vec<u16> = path.encode_utf16().chain(std::iter::once(0)).collect();
    // SAFETY: `wide` は末尾NUL付きUTF-16バッファで、呼び出し中は解放されない。
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
        persist_running_game_pid(&app, child.id());
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

fn ensure_valid_among_us_launch_target(game_exe_path: &Path) -> Result<&Path, String> {
    let game_dir = game_exe_path
        .parent()
        .ok_or_else(|| "Invalid game executable path".to_string())?;

    if !game_dir.is_dir() {
        return Err(format!(
            "The selected folder is not an Among Us installation directory: {}",
            game_dir.to_string_lossy()
        ));
    }

    let is_among_us_exe = game_exe_path
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case(among_us_exe_file_name()));
    if !is_among_us_exe {
        return Err(format!(
            "Launch target is not {}: {}",
            among_us_exe_file_name(),
            game_exe_path.to_string_lossy()
        ));
    }

    if !game_dir.join(among_us_exe_file_name()).is_file()
        || !game_dir.join(among_us_data_dir_name()).is_dir()
    {
        return Err(format!(
            "The selected folder is not an Among Us installation directory: {}",
            game_dir.to_string_lossy()
        ));
    }

    Ok(game_dir)
}

fn ensure_steam_appid_file_if_needed(game_dir: &Path, platform: &str) -> Result<(), String> {
    if !platform.trim().eq_ignore_ascii_case("steam") {
        return Ok(());
    }

    let steam_appid_path = game_dir.join(STEAM_APP_ID_FILE_NAME);
    if steam_appid_path.exists() {
        if steam_appid_path.is_file() {
            return Ok(());
        }
        return Err(format!(
            "steam_appid path is not a file: {}",
            steam_appid_path.to_string_lossy()
        ));
    }

    fs::write(&steam_appid_path, STEAM_APP_ID_VALUE)
        .map_err(|error| format!("Failed to create steam_appid.txt: {error}"))?;
    Ok(())
}

pub fn modded_first_setup_pending(game_exe: String) -> Result<bool, String> {
    let game_exe_path = PathBuf::from(game_exe);
    let game_dir = ensure_valid_among_us_launch_target(&game_exe_path)?;
    let bepinex_config = game_dir.join("BepInEx").join("config").join("BepInEx.cfg");

    Ok(!bepinex_config.is_file())
}

async fn add_epic_auth_argument_if_needed(
    command: &mut Command,
    platform: &str,
) -> Result<(), String> {
    if !platform.trim().eq_ignore_ascii_case("epic") {
        return Ok(());
    }
    if !mod_profile::feature_enabled(mod_profile::Feature::EpicLogin) {
        return Err("Epic launch is disabled by mod.config.json.".to_string());
    }

    let session = epic_api::load_session().ok_or_else(|| {
        "Epic launch requires Epic authentication. Please log in from the Epic settings tab."
            .to_string()
    })?;

    let api = EpicApi::new()
        .map_err(|error| format!("Failed to initialize Epic authentication: {error}"))?;
    let token = api.get_game_token(&session).await.map_err(|error| {
        format!("Epic authentication check failed. Please log in to Epic and try again: {error}")
    })?;

    command.arg(format!("-AUTH_PASSWORD={token}"));
    Ok(())
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

    let game_exe_path = PathBuf::from(among_us_path).join(among_us_exe_file_name());
    launch_modded(
        app,
        game_exe_path.to_string_lossy().to_string(),
        profile_path.to_string(),
        launcher_settings.game_platform.as_str().to_string(),
    )
    .await
}

pub async fn launch_modded<R: Runtime>(
    app: AppHandle<R>,
    game_exe: String,
    profile_path: String,
    platform: String,
) -> Result<(), String> {
    let game_exe_path = PathBuf::from(&game_exe);
    let game_dir = ensure_valid_among_us_launch_target(&game_exe_path)?;

    let profile_path = PathBuf::from(&profile_path);
    let bepinex_dll = profile_path
        .join("BepInEx")
        .join("core")
        .join("BepInEx.Unity.IL2CPP.dll");
    let dotnet_dir = profile_path.join("dotnet");
    let coreclr_path = dotnet_dir.join("coreclr.dll");

    ensure_file_exists(&bepinex_dll, "BepInEx IL2CPP DLL")?;
    ensure_file_exists(&coreclr_path, "dotnet coreclr")?;

    ensure_steam_appid_file_if_needed(game_dir, &platform)?;

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

    add_epic_auth_argument_if_needed(&mut command, &platform).await?;

    launch_process(app, command)
}

pub async fn launch_vanilla<R: Runtime>(
    app: AppHandle<R>,
    game_exe: String,
    platform: String,
) -> Result<(), String> {
    let game_exe_path = PathBuf::from(&game_exe);
    let game_dir = ensure_valid_among_us_launch_target(&game_exe_path)?;
    ensure_steam_appid_file_if_needed(game_dir, &platform)?;

    let mut command = Command::new(&game_exe_path);
    command.current_dir(game_dir);

    add_epic_auth_argument_if_needed(&mut command, &platform).await?;

    launch_process(app, command)
}
