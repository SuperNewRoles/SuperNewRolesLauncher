import { getCurrentWindow } from "@tauri-apps/api/window";

export type ThemePreference = "system" | "light" | "dark";

const THEME_STORAGE_KEY = "snr-launcher.theme";

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
    const unlisten = await appWindow.onThemeChanged((event) => {
      // systemモードの場合、OS設定に従う（data-themeを削除）
      if (getStoredTheme() === "system") {
        document.documentElement.removeAttribute("data-theme");
      }
    });

    return () => {
      // アプリ終了時や再初期化時に購読を確実に解除する。
      unlisten();
    };
  }

  return () => {};
}
