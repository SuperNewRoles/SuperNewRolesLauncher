import modConfig from "../shared/mod.config.json";
import en from "./locales/en";
import ja from "./locales/ja";

type LocaleMessages = Record<string, string>;

const LOCALE_STORAGE_KEY = "ui.locale";
const DEFAULT_LOCALE = "en";
const PARAM_PATTERN = /\{([a-zA-Z0-9_]+)\}/g;

const LOCALES = {
  ja,
  en,
} satisfies Record<string, LocaleMessages>;

export type LocaleCode = keyof typeof LOCALES;
export type MessageKey = keyof typeof ja;

export const SUPPORTED_LOCALES = Object.freeze(Object.keys(LOCALES) as LocaleCode[]);

type TranslateParams = Record<string, string | number>;
const DEFAULT_TRANSLATE_PARAMS: TranslateParams = {
  // 頻出パラメータはデフォルト値として常に展開可能にする。
  modName: modConfig.mod.displayName,
  modShort: modConfig.mod.shortName,
  launcherName: modConfig.branding.launcherName,
  migrationExt: modConfig.migration.extension,
  presetExt: modConfig.presets.extension,
};

function isLocaleCode(value: string): value is LocaleCode {
  // Object のキー存在判定で対応ロケールのみ許可する。
  return value in LOCALES;
}

export function normalizeLocale(value: string | null | undefined): LocaleCode | null {
  // 大文字小文字や余分な空白を吸収して判定する。
  const normalized = value?.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (isLocaleCode(normalized)) {
    return normalized;
  }

  const language = normalized.split("-")[0];
  return isLocaleCode(language) ? language : null;
}

function loadSavedLocale(): LocaleCode | null {
  try {
    // 保存値は normalize を通して壊れた値を除外する。
    return normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveLocale(locale: LocaleCode): void {
  try {
    // 保存失敗時は無視し、画面側で現在値を保持して継続する。
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore storage failures
  }
}

export function resolveInitialLocale(): LocaleCode {
  // 優先順: 保存値 > ブラウザ言語 > デフォルト。
  return loadSavedLocale() ?? normalizeLocale(navigator.language) ?? (DEFAULT_LOCALE as LocaleCode);
}

export function createTranslator(locale: LocaleCode) {
  const fallback = LOCALES[DEFAULT_LOCALE];
  const dictionary = LOCALES[locale] ?? fallback;

  return (key: MessageKey, params?: TranslateParams): string => {
    // 未翻訳キーは英語辞書、さらに無ければキー文字列をそのまま返す。
    const template = dictionary[key] ?? fallback[key] ?? key;
    const resolvedParams = {
      ...DEFAULT_TRANSLATE_PARAMS,
      // 呼び出し側引数を後勝ちでマージし、既定値を必要に応じて上書きできるようにする。
      ...(params ?? {}),
    };

    return template.replace(PARAM_PATTERN, (_, name: string) => {
      const value = resolvedParams[name];
      return value === undefined ? `{${name}}` : String(value);
    });
  };
}
