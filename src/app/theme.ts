import { getCurrentWindow } from "@tauri-apps/api/window";

export type ThemePreference = "system" | "light" | "dark";

const THEME_STORAGE_KEY = "snr-launcher.theme";

/**
 * 保存されているテーマ設定を取得
 */
export function getStoredTheme(): ThemePreference {
  if (typeof localStorage === "undefined") return "system";
  return (localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference) || "system";
}

/**
 * テーマ設定を保存
 */
export function setStoredTheme(theme: ThemePreference): void {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}

/**
 * テーマを適用（systemの場合はOS設定に従う）
 */
export function applyTheme(theme: ThemePreference): void {
  if (theme === "dark") {
    document.documentElement.setAttribute("data-theme", "dark");
  } else if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    // system: OS設定に従う
    document.documentElement.removeAttribute("data-theme");
  }
}

/**
 * 初期化：保存された設定を読み込んで適用
 */
export async function initTheme(): Promise<() => void> {
  const storedTheme = getStoredTheme();
  applyTheme(storedTheme);

  // systemモード時はOSの変更を監視
  if (storedTheme === "system") {
    const appWindow = getCurrentWindow();
    const unlisten = await appWindow.onThemeChanged((event) => {
      // systemモードの場合、OS設定に従う（data-themeを削除）
      if (getStoredTheme() === "system") {
        document.documentElement.removeAttribute("data-theme");
      }
    });

    return () => {
      unlisten();
    };
  }

  return () => {};
}
