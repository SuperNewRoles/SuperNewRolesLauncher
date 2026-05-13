import { getCurrentWindow } from "@tauri-apps/api/window";

export type ThemePreference = "system" | "light" | "dark";

const THEME_STORAGE_KEY = "snr-launcher.theme";
const LIGHT_WINDOW_BACKGROUND = "#f3f7fb";
const DARK_WINDOW_BACKGROUND = "#0b1020";

function isTrayMenuWindow(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return new URLSearchParams(window.location.search).get("tray-menu") === "1";
}

function resolveEffectiveTheme(theme: ThemePreference): "light" | "dark" {
  if (theme === "light" || theme === "dark") {
    return theme;
  }
  if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return "light";
}

function resolveWindowBackgroundColor(theme: ThemePreference): string {
  return resolveEffectiveTheme(theme) === "dark" ? DARK_WINDOW_BACKGROUND : LIGHT_WINDOW_BACKGROUND;
}

function syncDocumentThemeMetadata(theme: ThemePreference): void {
  if (typeof document === "undefined") {
    return;
  }

  const effectiveTheme = resolveEffectiveTheme(theme);
  const backgroundColor = isTrayMenuWindow() ? "transparent" : resolveWindowBackgroundColor(theme);
  document.documentElement.style.colorScheme = effectiveTheme;
  document.documentElement.style.backgroundColor = backgroundColor;
  document.documentElement.style.setProperty("--startup-window-bg", backgroundColor);
}

async function syncCurrentWindowBackground(theme: ThemePreference): Promise<void> {
  syncDocumentThemeMetadata(theme);
  if (isTrayMenuWindow()) {
    return;
  }

  try {
    await getCurrentWindow().setBackgroundColor(resolveWindowBackgroundColor(theme));
  } catch {
    // ウィンドウ背景色の同期に失敗してもテーマ適用は継続する。
  }
}

/**
 * 保存されているテーマ設定を取得
 */
export function getStoredTheme(): ThemePreference {
  // テスト環境など localStorage 非対応時は system を既定値にする。
  if (typeof localStorage === "undefined") return "system";
  return (localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference) || "system";
}

/**
 * テーマ設定を保存
 */
export function setStoredTheme(theme: ThemePreference): void {
  // 保存失敗よりも UI 継続を優先し、未対応環境では何もしない。
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

/**
 * テーマを適用（systemの場合はOS設定に従う）
 */
export function applyTheme(theme: ThemePreference): void {
  // 明示テーマ時は data-theme を設定して CSS 側の分岐を有効化する。
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    // system: OS設定に従う
    document.documentElement.removeAttribute("data-theme");
  }

  void syncCurrentWindowBackground(theme);
}

/**
 * 初期化：保存された設定を読み込んで適用
 */
export async function initTheme(): Promise<() => void> {
  const storedTheme = getStoredTheme();
  // 保存済み設定を最初に反映して、初期描画時のテーマずれを防ぐ。
  applyTheme(storedTheme);

  // systemモード時はOSの変更を監視
  if (storedTheme === "system") {
    const appWindow = getCurrentWindow();
    const unlisten = await appWindow.onThemeChanged(() => {
      // systemモードの場合、OS設定に従う（data-themeを削除）
      if (getStoredTheme() === "system") {
        document.documentElement.removeAttribute("data-theme");
        void syncCurrentWindowBackground("system");
      }
    });

    return () => {
      // アプリ終了時や再初期化時に購読を確実に解除する。
      unlisten();
    };
  }

  return () => {};
}
