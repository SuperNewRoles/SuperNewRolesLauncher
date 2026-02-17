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
  modName: modConfig.mod.displayName,
  modShort: modConfig.mod.shortName,
  launcherName: modConfig.branding.launcherName,
  migrationExt: modConfig.migration.extension,
  presetExt: modConfig.presets.extension,
};

function isLocaleCode(value: string): value is LocaleCode {
  return value in LOCALES;
}

export function normalizeLocale(value: string | null | undefined): LocaleCode | null {
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
    return normalizeLocale(localStorage.getItem(LOCALE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function saveLocale(locale: LocaleCode): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // ignore storage failures
  }
}

export function resolveInitialLocale(): LocaleCode {
  return loadSavedLocale() ?? normalizeLocale(navigator.language) ?? (DEFAULT_LOCALE as LocaleCode);
}

export function createTranslator(locale: LocaleCode) {
  const fallback = LOCALES[DEFAULT_LOCALE];
  const dictionary = LOCALES[locale] ?? fallback;

  return (key: MessageKey, params?: TranslateParams): string => {
    const template = dictionary[key] ?? fallback[key] ?? key;
    const resolvedParams = {
      ...DEFAULT_TRANSLATE_PARAMS,
      ...(params ?? {}),
    };

    return template.replace(PARAM_PATTERN, (_, name: string) => {
      const value = resolvedParams[name];
      return value === undefined ? `{${name}}` : String(value);
    });
  };
}
