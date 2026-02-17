import rawConfig from "../shared/mod.config.json";
import { SOCIAL_ICON_SPECS } from "./socialBrandIcons";
import type { OfficialLink, SocialBrandId } from "./types";

export interface ModConfig {
  schemaVersion: number;
  mod: {
    id: string;
    displayName: string;
    shortName: string;
  };
  branding: {
    launcherName: string;
    windowTitle: string;
    trayTooltip: string;
    identifier: string;
    moddedShortcutName: string;
  };
  features: {
    announce: boolean;
    reporting: boolean;
    presets: boolean;
    migration: boolean;
    epicLogin: boolean;
    connectLinks: boolean;
  };
  distribution: {
    source: "github";
    githubRepo: string;
    assetRegex: {
      steam: string;
      epic: string;
    };
    patchers: {
      enabled: boolean;
      manifestUrl: string;
      baseUrl: string;
    };
    updaterLatestJsonUrl: string;
  };
  paths: {
    amongUsExe: string;
    amongUsDataDir: string;
    saveDataRoot: string;
    localLowRoot: string;
    reportTokenRelativePath: string;
    profileRequiredFiles: string[];
  };
  migration: {
    extension: string;
    magic: string;
    profileIncludePatterns: string[];
  };
  presets: {
    extension: string;
    optionsArchivePath: string;
    saveDataRoot: string;
  };
  apis: {
    announceBaseUrl: string;
    reportingBaseUrl: string;
    reportingTermsUrl: string;
  };
  links: {
    wikiUrl: string;
    supportDiscordUrl: string;
    official: Array<{
      label: string;
      url: string;
      backgroundColor: string;
      iconId: SocialBrandId;
    }>;
  };
  theme: {
    bodyAuraColors: {
      orange: string;
      green: string;
      red: string;
    };
  };
  events: {
    installProgress: string;
    legacyInstallProgress: string;
  };
}

const config = rawConfig as ModConfig;

function ensureNonEmpty(value: string, name: string): string {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`Invalid mod config: '${name}' must not be empty.`);
  }
  return trimmed;
}

function normalizeBaseUrl(url: string, name: string): string {
  const normalized = ensureNonEmpty(url, name);
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function ensureHexColor(value: string, name: string): string {
  const normalized = ensureNonEmpty(value, name);
  if (!/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
    throw new Error(`Invalid mod config: '${name}' must be a 6-digit hex color (#RRGGBB).`);
  }
  return normalized.toUpperCase();
}

function hexToRgbTuple(hexColor: string): string {
  const normalized = hexColor.slice(1);
  const red = Number.parseInt(normalized.slice(0, 2), 16);
  const green = Number.parseInt(normalized.slice(2, 4), 16);
  const blue = Number.parseInt(normalized.slice(4, 6), 16);
  return `${red}, ${green}, ${blue}`;
}

function assertModConfig(input: ModConfig): ModConfig {
  if (input.schemaVersion !== 1) {
    throw new Error(`Unsupported mod config schemaVersion: ${input.schemaVersion}`);
  }

  ensureNonEmpty(input.mod.id, "mod.id");
  ensureNonEmpty(input.mod.displayName, "mod.displayName");
  ensureNonEmpty(input.mod.shortName, "mod.shortName");
  ensureNonEmpty(input.branding.launcherName, "branding.launcherName");
  ensureNonEmpty(input.branding.windowTitle, "branding.windowTitle");
  ensureNonEmpty(input.branding.trayTooltip, "branding.trayTooltip");
  ensureNonEmpty(input.branding.identifier, "branding.identifier");
  ensureNonEmpty(input.branding.moddedShortcutName, "branding.moddedShortcutName");
  ensureNonEmpty(input.distribution.githubRepo, "distribution.githubRepo");
  ensureNonEmpty(input.distribution.assetRegex.steam, "distribution.assetRegex.steam");
  ensureNonEmpty(input.distribution.assetRegex.epic, "distribution.assetRegex.epic");
  ensureNonEmpty(input.distribution.updaterLatestJsonUrl, "distribution.updaterLatestJsonUrl");
  ensureNonEmpty(input.paths.amongUsExe, "paths.amongUsExe");
  ensureNonEmpty(input.paths.amongUsDataDir, "paths.amongUsDataDir");
  ensureNonEmpty(input.paths.saveDataRoot, "paths.saveDataRoot");
  ensureNonEmpty(input.paths.localLowRoot, "paths.localLowRoot");
  ensureNonEmpty(input.paths.reportTokenRelativePath, "paths.reportTokenRelativePath");
  ensureNonEmpty(input.migration.extension, "migration.extension");
  ensureNonEmpty(input.migration.magic, "migration.magic");
  ensureNonEmpty(input.presets.extension, "presets.extension");
  ensureNonEmpty(input.presets.optionsArchivePath, "presets.optionsArchivePath");
  ensureNonEmpty(input.presets.saveDataRoot, "presets.saveDataRoot");
  input.theme.bodyAuraColors.orange = ensureHexColor(
    input.theme.bodyAuraColors.orange,
    "theme.bodyAuraColors.orange",
  );
  input.theme.bodyAuraColors.green = ensureHexColor(
    input.theme.bodyAuraColors.green,
    "theme.bodyAuraColors.green",
  );
  input.theme.bodyAuraColors.red = ensureHexColor(
    input.theme.bodyAuraColors.red,
    "theme.bodyAuraColors.red",
  );
  ensureNonEmpty(input.events.installProgress, "events.installProgress");
  ensureNonEmpty(input.events.legacyInstallProgress, "events.legacyInstallProgress");
  input.apis.announceBaseUrl = normalizeBaseUrl(input.apis.announceBaseUrl, "apis.announceBaseUrl");
  input.apis.reportingBaseUrl = ensureNonEmpty(input.apis.reportingBaseUrl, "apis.reportingBaseUrl");
  input.apis.reportingTermsUrl = ensureNonEmpty(input.apis.reportingTermsUrl, "apis.reportingTermsUrl");

  if (!Array.isArray(input.paths.profileRequiredFiles) || input.paths.profileRequiredFiles.length === 0) {
    throw new Error("Invalid mod config: 'paths.profileRequiredFiles' must contain at least one entry.");
  }
  if (!Array.isArray(input.migration.profileIncludePatterns) || input.migration.profileIncludePatterns.length === 0) {
    throw new Error("Invalid mod config: 'migration.profileIncludePatterns' must contain at least one entry.");
  }
  if (!Array.isArray(input.links.official)) {
    throw new Error("Invalid mod config: 'links.official' must be an array.");
  }
  for (const [index, item] of input.links.official.entries()) {
    ensureNonEmpty(item.label, `links.official[${index}].label`);
    ensureNonEmpty(item.url, `links.official[${index}].url`);
    ensureNonEmpty(item.backgroundColor, `links.official[${index}].backgroundColor`);
    const iconId = ensureNonEmpty(String(item.iconId ?? ""), `links.official[${index}].iconId`);
    if (!(iconId in SOCIAL_ICON_SPECS)) {
      throw new Error(
        `Invalid mod config: 'links.official[${index}].iconId' must be one of ${Object.keys(SOCIAL_ICON_SPECS).join(", ")}.`,
      );
    }
  }

  return input;
}

export const modConfig = assertModConfig(config);

export const MOD_DISPLAY_NAME = modConfig.mod.displayName;
export const MOD_SHORT_NAME = modConfig.mod.shortName;
export const LAUNCHER_NAME = modConfig.branding.launcherName;

export const ANNOUNCE_ENABLED = modConfig.features.announce;
export const REPORTING_ENABLED = modConfig.features.reporting;
export const PRESETS_ENABLED = modConfig.features.presets;
export const MIGRATION_ENABLED = modConfig.features.migration;
export const EPIC_LOGIN_ENABLED = modConfig.features.epicLogin;
export const CONNECT_LINKS_ENABLED = modConfig.features.connectLinks;

export const ANNOUNCE_API_BASE_URL = modConfig.apis.announceBaseUrl;
export const REPORTING_TERMS_URL = modConfig.apis.reportingTermsUrl;
export const BODY_AURA_COLORS = modConfig.theme.bodyAuraColors;
export const BODY_AURA_RGB = {
  orange: hexToRgbTuple(BODY_AURA_COLORS.orange),
  green: hexToRgbTuple(BODY_AURA_COLORS.green),
  red: hexToRgbTuple(BODY_AURA_COLORS.red),
} as const;

export const OFFICIAL_LINKS: OfficialLink[] = modConfig.links.official.map((item) => ({
  label: item.label,
  url: item.url,
  backgroundColor: item.backgroundColor,
  icon: SOCIAL_ICON_SPECS[item.iconId],
}));
