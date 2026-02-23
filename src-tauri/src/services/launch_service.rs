//! ゲーム起動・実行監視・ショートカット生成を扱うサービス層。
//! OS依存処理を内包し、commands層は公開APIだけに集中させる。
// 起動前検証・プロセス追跡・補助ファイル管理を一箇所に集約する。

use crate::utils::{
    epic_api::{self, EpicApi},
    mod_profile, settings,
};
use std::ffi::OsStr;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::{Child, Command};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Runtime};

static GAME_PROCESS: LazyLock<Mutex<Option<Child>>> = LazyLock::new(|| Mutex::new(None));
static LAST_AUTOLAUNCH_ERROR: LazyLock<Mutex<Option<String>>> = LazyLock::new(|| Mutex::new(None));

pub const AUTOLAUNCH_MODDED_ARGUMENT: &str = "--autolaunch-modded";
pub const ELEVATED_LAUNCH_PAYLOAD_ARGUMENT: &str = "--elevated-launch-payload";
const RUNNING_GAME_PID_FILE_NAME: &str = "running-game.pid";
const STEAM_APP_ID_FILE_NAME: &str = "steam_appid.txt";
const STEAM_APP_ID_VALUE: &str = "945360";
const ELEVATED_LAUNCH_DIR_NAME: &str = "elevated-launch";
const ELEVATED_LAUNCH_FAILED_ERROR_PREFIX: &str = "ELEVATED_LAUNCH_FAILED:";

#[cfg(windows)]
const WINDOWS_ERROR_ELEVATION_REQUIRED: i32 = 740;
#[cfg(windows)]
const WINDOWS_ERROR_CANCELLED: i32 = 1223;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "lowercase")]
enum ElevatedLaunchKind {
    Modded,
    Vanilla,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ElevatedLaunchPayload {
    kind: ElevatedLaunchKind,
    game_exe: String,
    profile_path: Option<String>,
    platform: String,
    result_path: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ElevatedLaunchResult {
    success: bool,
    error: Option<String>,
}

fn among_us_exe_file_name() -> &'static str {
    // 実行ファイル名はmodプロファイル定義を単一の参照元にする。
    mod_profile::get().paths.among_us_exe.as_str()
}

fn among_us_data_dir_name() -> &'static str {
    // Dataフォルダ名も設定から取得してハードコードを避ける。
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

#[cfg(windows)]
fn resolve_available_shortcut_path(desktop_dir: &Path, file_name: &str) -> PathBuf {
    let default_path = desktop_dir.join(file_name);
    if !default_path.exists() {
        return default_path;
    }

    let base_file_name = Path::new(file_name);
    let stem = base_file_name
        .file_stem()
        .and_then(|name| name.to_str())
        .filter(|name| !name.is_empty())
        .unwrap_or(file_name);
    let extension = base_file_name
        .extension()
        .and_then(|ext| ext.to_str())
        .filter(|ext| !ext.is_empty());

    for suffix in 2.. {
        // 既存ショートカットがある場合は Windows と同様の連番サフィックスを付与する。
        let candidate_name = match extension {
            Some(ext) => format!("{stem} ({suffix}).{ext}"),
            None => format!("{stem} ({suffix})"),
        };
        let candidate_path = desktop_dir.join(candidate_name);
        if !candidate_path.exists() {
            return candidate_path;
        }
    }

    unreachable!("infinite suffix iterator exhausted unexpectedly")
}

#[derive(Clone, serde::Serialize)]
pub struct GameStatePayload {
    pub running: bool,
}

pub fn clear_autolaunch_error() {
    // 次回起動前に前回エラーを持ち越さないよう明示的にクリアする。
    if let Ok(mut guard) = LAST_AUTOLAUNCH_ERROR.lock() {
        *guard = None;
    }
}

pub fn set_autolaunch_error(message: String) {
    // UI側が後から取得できるよう、最新エラーのみ保持する。
    if let Ok(mut guard) = LAST_AUTOLAUNCH_ERROR.lock() {
        *guard = Some(message);
    }
}

pub fn take_autolaunch_error() -> Option<String> {
    // takeで読み出すことで同じエラーの重複表示を防ぐ。
    match LAST_AUTOLAUNCH_ERROR.lock() {
        Ok(mut guard) => guard.take(),
        Err(_) => Some("Failed to access auto launch error state".to_string()),
    }
}

pub fn parse_elevated_launch_payload_argument<I, S>(args: I) -> Result<Option<String>, String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<OsStr>,
{
    let mut iter = args.into_iter();
    while let Some(arg) = iter.next() {
        if arg.as_ref() != OsStr::new(ELEVATED_LAUNCH_PAYLOAD_ARGUMENT) {
            continue;
        }

        let Some(path_arg) = iter.next() else {
            return Err(format!(
                "{ELEVATED_LAUNCH_PAYLOAD_ARGUMENT} requires a file path argument"
            ));
        };

        let path = path_arg.as_ref().to_string_lossy().trim().to_string();
        if path.is_empty() {
            return Err(format!(
                "{ELEVATED_LAUNCH_PAYLOAD_ARGUMENT} requires a non-empty file path argument"
            ));
        }

        return Ok(Some(path));
    }

    Ok(None)
}

pub fn is_game_running<R: Runtime>(app: AppHandle<R>) -> Result<bool, String> {
    // まずメモリ上の子プロセスを確認し、なければPIDファイルの状態へフォールバックする。
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
    // PIDファイルはアプリ専用データ配下へ保存する。
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
        // 初回起動時にも書き込めるよう親ディレクトリを準備する。
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
            // 壊れたPIDファイルは削除して次回以降の誤判定を防ぐ。
            clear_persisted_running_game_pid(app);
            Ok(None)
        }
    }
}

#[cfg(windows)]
fn is_pid_running(pid: u32) -> bool {
    use std::os::windows::process::CommandExt;

    // GUIプロセスからの tasklist 実行でコンソールが点滅しないよう抑止する。
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let filter = format!("PID eq {pid}");
    let mut command = Command::new("tasklist");
    command
        .creation_flags(CREATE_NO_WINDOW)
        .args(["/FI", &filter, "/FO", "CSV", "/NH"]);
    let output = match command.output() {
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

        let shortcut_path =
            resolve_available_shortcut_path(&desktop_dir, modded_shortcut_file_name());
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
        // 起動直後に running=true を通知してUI表示を同期する。
        let _ = app.emit("game-state-changed", GameStatePayload { running: true });

        loop {
            std::thread::sleep(Duration::from_millis(500));

            let Ok(mut guard) = GAME_PROCESS.lock() else {
                break;
            };

            match guard.as_mut().and_then(|process| process.try_wait().ok()) {
                Some(Some(_)) | None => {
                    // 終了検知または追跡不能時は監視対象を解除する。
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

#[cfg(windows)]
fn reset_dll_directory() -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::System::LibraryLoader::SetDllDirectoryW;

    // SAFETY: null を渡すと DLL 検索パスを既定状態に戻す API 契約に従う。
    unsafe { SetDllDirectoryW(PCWSTR::null()) }
        .map_err(|e| format!("Failed to reset DLL directory: {e}"))
}

fn map_launch_spawn_error(error: std::io::Error) -> String {
    #[cfg(windows)]
    {
        if error.raw_os_error() == Some(WINDOWS_ERROR_ELEVATION_REQUIRED) {
            return "ELEVATION_REQUIRED: The requested operation requires elevation.".to_string();
        }
    }

    format!("Failed to launch game process: {error}")
}

fn elevated_launch_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    Ok(settings::app_data_dir(app)?.join(ELEVATED_LAUNCH_DIR_NAME))
}

fn new_elevated_launch_file_stem() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!(
        "{}-{timestamp}-{}",
        std::process::id(),
        rand::random::<u64>()
    )
}

fn create_elevated_launch_paths<R: Runtime>(
    app: &AppHandle<R>,
) -> Result<(PathBuf, PathBuf), String> {
    let dir = elevated_launch_dir(app)?;
    fs::create_dir_all(&dir).map_err(|error| {
        format!(
            "{ELEVATED_LAUNCH_FAILED_ERROR_PREFIX} Failed to prepare elevated launch directory: {error}"
        )
    })?;

    let stem = new_elevated_launch_file_stem();
    let payload_path = dir.join(format!("{stem}.payload.json"));
    let result_path = dir.join(format!("{stem}.result.json"));
    Ok((payload_path, result_path))
}

fn write_elevated_launch_payload(
    path: &Path,
    payload: &ElevatedLaunchPayload,
) -> Result<(), String> {
    let json = serde_json::to_string(payload).map_err(|error| {
        format!("{ELEVATED_LAUNCH_FAILED_ERROR_PREFIX} Failed to serialize elevated launch payload: {error}")
    })?;
    fs::write(path, json).map_err(|error| {
        format!(
            "{ELEVATED_LAUNCH_FAILED_ERROR_PREFIX} Failed to write elevated launch payload file: {error}"
        )
    })
}

fn read_elevated_launch_payload(path: &Path) -> Result<ElevatedLaunchPayload, String> {
    let content = fs::read_to_string(path).map_err(|error| {
        format!(
            "{ELEVATED_LAUNCH_FAILED_ERROR_PREFIX} Failed to read elevated launch payload file: {error}"
        )
    })?;
    serde_json::from_str(&content).map_err(|error| {
        format!("{ELEVATED_LAUNCH_FAILED_ERROR_PREFIX} Failed to parse elevated launch payload: {error}")
    })
}

fn write_elevated_launch_result(path: &Path, result: &ElevatedLaunchResult) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| {
            format!(
                "{ELEVATED_LAUNCH_FAILED_ERROR_PREFIX} Failed to create elevated launch result directory: {error}"
            )
        })?;
    }

    let json = serde_json::to_string(result).map_err(|error| {
        format!("{ELEVATED_LAUNCH_FAILED_ERROR_PREFIX} Failed to serialize elevated launch result: {error}")
    })?;
    fs::write(path, json).map_err(|error| {
        format!("{ELEVATED_LAUNCH_FAILED_ERROR_PREFIX} Failed to write elevated launch result file: {error}")
    })
}

fn read_elevated_launch_result(path: &Path) -> Result<ElevatedLaunchResult, String> {
    let content = fs::read_to_string(path).map_err(|error| {
        format!(
            "{ELEVATED_LAUNCH_FAILED_ERROR_PREFIX} Failed to read elevated launch result file: {error}"
        )
    })?;
    serde_json::from_str(&content).map_err(|error| {
        format!(
            "{ELEVATED_LAUNCH_FAILED_ERROR_PREFIX} Failed to parse elevated launch result: {error}"
        )
    })
}

fn cleanup_elevated_launch_files(paths: &[&Path]) {
    for path in paths {
        if let Err(error) = fs::remove_file(path) {
            if error.kind() != std::io::ErrorKind::NotFound {
                eprintln!("Failed to remove elevated launch temporary file: {error}");
            }
        }
    }
}

#[cfg(windows)]
fn quote_windows_argument(value: &str) -> String {
    let escaped = value.replace('"', "\\\"");
    format!("\"{escaped}\"")
}

#[cfg(windows)]
fn start_elevated_launcher_and_wait(payload_path: &Path) -> Result<(), String> {
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{CloseHandle, WAIT_OBJECT_0};
    use windows::Win32::System::Threading::{WaitForSingleObject, INFINITE};
    use windows::Win32::UI::Shell::{ShellExecuteExW, SEE_MASK_NOCLOSEPROCESS, SHELLEXECUTEINFOW};

    let launcher_exe = std::env::current_exe().map_err(|error| {
        format!(
            "{ELEVATED_LAUNCH_FAILED_ERROR_PREFIX} Failed to resolve launcher executable path: {error}"
        )
    })?;
    let working_dir = launcher_exe.parent().ok_or_else(|| {
        format!("{ELEVATED_LAUNCH_FAILED_ERROR_PREFIX} Launcher executable directory is invalid")
    })?;

    let payload_arg = quote_windows_argument(&payload_path.to_string_lossy());
    let parameters = format!("{ELEVATED_LAUNCH_PAYLOAD_ARGUMENT} {payload_arg}");

    let verb_utf16 = str_to_utf16("runas");
    let file_utf16 = path_to_utf16(&launcher_exe);
    let params_utf16 = str_to_utf16(&parameters);
    let working_dir_utf16 = path_to_utf16(working_dir);

    let mut execute_info = SHELLEXECUTEINFOW {
        cbSize: std::mem::size_of::<SHELLEXECUTEINFOW>() as u32,
        fMask: SEE_MASK_NOCLOSEPROCESS,
        lpVerb: PCWSTR(verb_utf16.as_ptr()),
        lpFile: PCWSTR(file_utf16.as_ptr()),
        lpParameters: PCWSTR(params_utf16.as_ptr()),
        lpDirectory: PCWSTR(working_dir_utf16.as_ptr()),
        nShow: 0,
        ..Default::default()
    };

    // SAFETY: SHELLEXECUTEINFOW は初期化済みで、UTF-16バッファは呼び出し中に生存している。
    let launched = unsafe { ShellExecuteExW(&mut execute_info) };
    if let Err(shell_error) = launched {
        let error = std::io::Error::last_os_error();
        if error.raw_os_error() == Some(WINDOWS_ERROR_CANCELLED) {
            return Err("ELEVATION_CANCELLED: The elevation request was cancelled.".to_string());
        }
        return Err(format!(
            "{ELEVATED_LAUNCH_FAILED_ERROR_PREFIX} Failed to start elevated launcher process: {shell_error}; os error: {error}"
        ));
    }

    let process_handle = execute_info.hProcess;
    if process_handle.is_invalid() {
        return Err(format!(
            "{ELEVATED_LAUNCH_FAILED_ERROR_PREFIX} Elevated launcher process handle is invalid"
        ));
    }

    // SAFETY: 有効なプロセスハンドルに対する待機。
    let wait_result = unsafe { WaitForSingleObject(process_handle, INFINITE) };
    // SAFETY: ShellExecuteExW で取得したハンドルを閉じる。
    let _ = unsafe { CloseHandle(process_handle) };

    if wait_result == WAIT_OBJECT_0 {
        return Ok(());
    }

    Err(format!(
        "{ELEVATED_LAUNCH_FAILED_ERROR_PREFIX} Failed while waiting for elevated launcher process."
    ))
}

#[cfg(not(windows))]
fn start_elevated_launcher_and_wait(_payload_path: &Path) -> Result<(), String> {
    Err(format!(
        "{ELEVATED_LAUNCH_FAILED_ERROR_PREFIX} Elevation retry is only supported on Windows."
    ))
}

async fn launch_with_elevated_helper<R: Runtime>(
    app: AppHandle<R>,
    mut payload: ElevatedLaunchPayload,
) -> Result<(), String> {
    let (payload_path, result_path) = create_elevated_launch_paths(&app)?;
    payload.result_path = result_path.to_string_lossy().to_string();
    write_elevated_launch_payload(&payload_path, &payload)?;

    let launch_result = start_elevated_launcher_and_wait(&payload_path);
    if let Err(error) = launch_result {
        cleanup_elevated_launch_files(&[&payload_path, &result_path]);
        return Err(error);
    }

    let result = read_elevated_launch_result(&result_path);
    cleanup_elevated_launch_files(&[&payload_path, &result_path]);
    let result = result?;

    if result.success {
        Ok(())
    } else {
        Err(result.error.unwrap_or_else(|| {
            format!("{ELEVATED_LAUNCH_FAILED_ERROR_PREFIX} Elevated launcher exited without error details.")
        }))
    }
}

pub async fn launch_modded_elevated<R: Runtime>(
    app: AppHandle<R>,
    game_exe: String,
    profile_path: String,
    platform: String,
) -> Result<(), String> {
    launch_with_elevated_helper(
        app,
        ElevatedLaunchPayload {
            kind: ElevatedLaunchKind::Modded,
            game_exe,
            profile_path: Some(profile_path),
            platform,
            result_path: String::new(),
        },
    )
    .await
}

pub async fn launch_vanilla_elevated<R: Runtime>(
    app: AppHandle<R>,
    game_exe: String,
    platform: String,
) -> Result<(), String> {
    launch_with_elevated_helper(
        app,
        ElevatedLaunchPayload {
            kind: ElevatedLaunchKind::Vanilla,
            game_exe,
            profile_path: None,
            platform,
            result_path: String::new(),
        },
    )
    .await
}

pub async fn execute_elevated_launch_payload<R: Runtime>(
    app: AppHandle<R>,
    payload_path: String,
) -> Result<(), String> {
    let payload_path = PathBuf::from(payload_path);
    let payload = read_elevated_launch_payload(&payload_path)?;
    let result_path = PathBuf::from(&payload.result_path);

    let launch_result = match is_game_running(app.clone()) {
        Ok(true) => Err("Game is already running".to_string()),
        Ok(false) => match payload.kind {
            ElevatedLaunchKind::Modded => {
                let profile_path = payload.profile_path.ok_or_else(|| {
                    format!("{ELEVATED_LAUNCH_FAILED_ERROR_PREFIX} Missing profile path for modded elevated launch.")
                })?;
                launch_modded(app, payload.game_exe, profile_path, payload.platform).await
            }
            ElevatedLaunchKind::Vanilla => {
                launch_vanilla(app, payload.game_exe, payload.platform).await
            }
        },
        Err(error) => Err(error),
    };

    let result_record = match &launch_result {
        Ok(()) => ElevatedLaunchResult {
            success: true,
            error: None,
        },
        Err(error) => ElevatedLaunchResult {
            success: false,
            error: Some(error.clone()),
        },
    };

    write_elevated_launch_result(&result_path, &result_record)?;
    launch_result
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
            // 既存プロセス稼働中は二重起動を拒否する。
            return Err("Game is already running".to_string());
        }

        let child = command.spawn().map_err(map_launch_spawn_error)?;
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
        // exeとDataフォルダの両方が揃っているかを最終確認する。
        return Err(format!(
            "The selected folder is not an Among Us installation directory: {}",
            game_dir.to_string_lossy()
        ));
    }

    Ok(game_dir)
}

fn ensure_steam_appid_file_if_needed(game_dir: &Path, platform: &str) -> Result<(), String> {
    if !platform.trim().eq_ignore_ascii_case("steam") {
        // Steam以外のプラットフォームでは不要。
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

pub fn modded_first_setup_pending<R: Runtime>(
    app: &AppHandle<R>,
    game_exe: String,
) -> Result<bool, String> {
    let has_non_empty_interop = |root: &Path| -> bool {
        let interop_dir = root.join("BepInEx").join("interop");
        if !interop_dir.is_dir() {
            return false;
        }

        match fs::read_dir(&interop_dir) {
            Ok(entries) => entries.filter_map(Result::ok).next().is_some(),
            Err(_) => false,
        }
    };

    let game_exe_path = PathBuf::from(game_exe);
    let game_dir = ensure_valid_among_us_launch_target(&game_exe_path)?;
    // ゲーム側にinterop生成済みなら、BepInEx初回展開は完了済みとみなす。
    if has_non_empty_interop(game_dir) {
        return Ok(false);
    }

    let launcher_settings = settings::load_or_init_settings(app)?;
    let profile_path = launcher_settings.profile_path.trim();
    if profile_path.is_empty() {
        return Ok(true);
    }

    Ok(!has_non_empty_interop(Path::new(profile_path)))
}

async fn add_epic_auth_argument_if_needed(
    command: &mut Command,
    platform: &str,
) -> Result<(), String> {
    if !platform.trim().eq_ignore_ascii_case("epic") {
        // Epic以外では認証引数を追加しない。
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

    // Epic起動に必要な一時トークンをコマンドライン引数として注入する。
    command.arg(format!("-AUTH_PASSWORD={token}"));
    Ok(())
}

pub async fn launch_modded_from_saved_settings<R: Runtime>(
    app: AppHandle<R>,
) -> Result<(), String> {
    // 設定保存済みのパス情報を使って再入力なしで起動する。
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
    // Doorstop関連引数を付与してBepInEx経由で起動する。
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

    #[cfg(windows)]
    reset_dll_directory()?;

    let mut command = Command::new(&game_exe_path);
    // 既存導入済みの Doorstop を明示的に無効化して素のゲームを起動する。
    command
        .current_dir(game_dir)
        .args(["--doorstop-enabled", "false"])
        .env("DOORSTOP_ENABLED", "FALSE");

    add_epic_auth_argument_if_needed(&mut command, &platform).await?;

    launch_process(app, command)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::ffi::OsString;
    use std::fs;

    fn temp_test_file_path(file_name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "snr-launch-test-{}-{}",
            std::process::id(),
            rand::random::<u64>()
        ));
        fs::create_dir_all(&dir).expect("failed to create temp test directory");
        dir.join(file_name)
    }

    #[test]
    fn parse_elevated_launch_payload_argument_returns_path() {
        let args = vec![
            OsString::from("launcher.exe"),
            OsString::from(ELEVATED_LAUNCH_PAYLOAD_ARGUMENT),
            OsString::from("C:\\temp\\payload.json"),
        ];
        let parsed =
            parse_elevated_launch_payload_argument(args).expect("failed to parse argument");
        assert_eq!(parsed.as_deref(), Some("C:\\temp\\payload.json"));
    }

    #[test]
    fn parse_elevated_launch_payload_argument_reports_missing_path() {
        let args = vec![
            OsString::from("launcher.exe"),
            OsString::from(ELEVATED_LAUNCH_PAYLOAD_ARGUMENT),
        ];
        let error =
            parse_elevated_launch_payload_argument(args).expect_err("missing path should fail");
        assert!(error.contains("requires a file path argument"));
    }

    #[cfg(windows)]
    #[test]
    fn map_launch_spawn_error_marks_elevation_required() {
        let message = map_launch_spawn_error(std::io::Error::from_raw_os_error(
            WINDOWS_ERROR_ELEVATION_REQUIRED,
        ));
        assert!(message.starts_with(ELEVATION_REQUIRED_ERROR_PREFIX));
    }

    #[test]
    fn elevated_launch_payload_round_trip() {
        let payload_path = temp_test_file_path("payload.json");
        let payload = ElevatedLaunchPayload {
            kind: ElevatedLaunchKind::Modded,
            game_exe: "C:\\Games\\Among Us.exe".to_string(),
            profile_path: Some("C:\\Profile".to_string()),
            platform: "steam".to_string(),
            result_path: "C:\\Temp\\result.json".to_string(),
        };

        write_elevated_launch_payload(&payload_path, &payload).expect("failed to write payload");
        let restored = read_elevated_launch_payload(&payload_path).expect("failed to read payload");
        assert!(matches!(restored.kind, ElevatedLaunchKind::Modded));
        assert_eq!(restored.game_exe, payload.game_exe);
        assert_eq!(restored.profile_path, payload.profile_path);
        assert_eq!(restored.platform, payload.platform);
        assert_eq!(restored.result_path, payload.result_path);

        cleanup_elevated_launch_files(&[&payload_path]);
        if let Some(parent) = payload_path.parent() {
            let _ = fs::remove_dir(parent);
        }
    }

    #[test]
    fn elevated_launch_result_round_trip() {
        let result_path = temp_test_file_path("result.json");
        let result = ElevatedLaunchResult {
            success: false,
            error: Some("sample error".to_string()),
        };

        write_elevated_launch_result(&result_path, &result).expect("failed to write result");
        let restored = read_elevated_launch_result(&result_path).expect("failed to read result");
        assert!(!restored.success);
        assert_eq!(restored.error.as_deref(), Some("sample error"));

        cleanup_elevated_launch_files(&[&result_path]);
        if let Some(parent) = result_path.parent() {
            let _ = fs::remove_dir(parent);
        }
    }
}
