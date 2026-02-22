import rawConfig from "../shared/mod.config.json";
import { SOCIAL_ICON_SPECS } from "./socialBrandIcons";
import type { OfficialLink, SocialBrandId } from "./types";

export interface GameServerCatalogEntry {
  id: string;
  label: string;
  roomsApiDomain: string;
  serverType: number;
}

export interface GameServerJoinDirectConfig {
  localhostBaseUrl: string;
  joinPath: string;
  aesKey: string;
  aesIv: string;
  timeoutMs: number;
}

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
    gameServers: boolean;
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
    gameServers: GameServerCatalogEntry[];
    joinDirect: GameServerJoinDirectConfig;
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
      colorLeft: string;
      colorCenter: string;
      colorRight: string;
    };
  };
  events: {
    installProgress: string;
    legacyInstallProgress: string;
  };
}

const config = rawConfig as ModConfig;

function ensureNonEmpty(value: string, name: string): string {
  // 空白だけの値も無効として扱う。
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new Error(`Invalid mod config: '${name}' must not be empty.`);
  }
  return trimmed;
}

function normalizeBaseUrl(url: string, name: string): string {
  // API ベースURLは末尾スラッシュありに正規化する。
  const normalized = ensureNonEmpty(url, name);
  return normalized.endsWith("/") ? normalized : `${normalized}/`;
}

function normalizeUrlWithoutTrailingSlash(url: string, name: string): string {
  // ドメイン用途のURLは末尾スラッシュなしへ寄せる。
  const normalized = ensureNonEmpty(url, name);
  return normalized.replace(/\/+$/u, "");
}

function normalizeJoinPath(value: string, name: string): string {
  // joinPath は先頭スラッシュありに正規化する。
  const normalized = ensureNonEmpty(value, name);
  return normalized.startsWith("/") ? normalized : `/${normalized}`;
}

function ensureInteger(value: number, name: string): number {
  if (!Number.isInteger(value)) {
    throw new Error(`Invalid mod config: '${name}' must be an integer.`);
  }
  return value;
}

function ensurePositiveInteger(value: number, name: string): number {
  const normalized = ensureInteger(value, name);
  if (normalized <= 0) {
    throw new Error(`Invalid mod config: '${name}' must be greater than 0.`);
  }
  return normalized;
}

function ensureFixedUtf8Length(value: string, name: string, expectedLength: number): string {
  // Join暗号の鍵/IVは UTF-8 16byte 固定で扱う。
  const normalized = ensureNonEmpty(value, name);
  const utf8Length = new TextEncoder().encode(normalized).byteLength;
  if (utf8Length !== expectedLength) {
    throw new Error(
      `Invalid mod config: '${name}' must be exactly ${expectedLength} bytes in UTF-8.`,
    );
  }
  return normalized;
}

function ensureHexColor(value: string, name: string): string {
  // テーマ色は #RRGGBB のみ許可する。
  const normalized = ensureNonEmpty(value, name);
  if (!/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
    throw new Error(`Invalid mod config: '${name}' must be a 6-digit hex color (#RRGGBB).`);
  }
  return normalized.toUpperCase();
}

function hexToRgbTuple(hexColor: string): string {
  // CSS 変数に流し込むため "r, g, b" 形式へ変換する。
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

  // 必須文字列項目は起動時にまとめて検証しておく。
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
  input.theme.bodyAuraColors.colorLeft = ensureHexColor(
    input.theme.bodyAuraColors.colorLeft,
    "theme.bodyAuraColors.colorLeft",
  );
  input.theme.bodyAuraColors.colorCenter = ensureHexColor(
    input.theme.bodyAuraColors.colorCenter,
    "theme.bodyAuraColors.colorCenter",
  );
  input.theme.bodyAuraColors.colorRight = ensureHexColor(
    input.theme.bodyAuraColors.colorRight,
    "theme.bodyAuraColors.colorRight",
  );
  ensureNonEmpty(input.events.installProgress, "events.installProgress");
  ensureNonEmpty(input.events.legacyInstallProgress, "events.legacyInstallProgress");
  input.apis.announceBaseUrl = normalizeBaseUrl(input.apis.announceBaseUrl, "apis.announceBaseUrl");
  input.apis.reportingBaseUrl = ensureNonEmpty(
    input.apis.reportingBaseUrl,
    "apis.reportingBaseUrl",
  );
  input.apis.reportingTermsUrl = ensureNonEmpty(
    input.apis.reportingTermsUrl,
    "apis.reportingTermsUrl",
  );
  if (!Array.isArray(input.apis.gameServers) || input.apis.gameServers.length === 0) {
    throw new Error("Invalid mod config: 'apis.gameServers' must contain at least one server.");
  }
  const seenServerIds = new Set<string>();
  for (const [index, server] of input.apis.gameServers.entries()) {
    const id = ensureNonEmpty(server.id, `apis.gameServers[${index}].id`);
    if (seenServerIds.has(id)) {
      throw new Error(`Invalid mod config: duplicate game server id '${id}'.`);
    }
    seenServerIds.add(id);
    server.id = id;
    server.label = ensureNonEmpty(server.label, `apis.gameServers[${index}].label`);
    server.roomsApiDomain = normalizeUrlWithoutTrailingSlash(
      server.roomsApiDomain,
      `apis.gameServers[${index}].roomsApiDomain`,
    );
    server.serverType = ensureInteger(server.serverType, `apis.gameServers[${index}].serverType`);
    if (server.serverType < 0) {
      throw new Error(`Invalid mod config: 'apis.gameServers[${index}].serverType' must be >= 0.`);
    }
  }
  input.apis.joinDirect.localhostBaseUrl = normalizeUrlWithoutTrailingSlash(
    input.apis.joinDirect.localhostBaseUrl,
    "apis.joinDirect.localhostBaseUrl",
  );
  input.apis.joinDirect.joinPath = normalizeJoinPath(
    input.apis.joinDirect.joinPath,
    "apis.joinDirect.joinPath",
  );
  input.apis.joinDirect.aesKey = ensureFixedUtf8Length(
    input.apis.joinDirect.aesKey,
    "apis.joinDirect.aesKey",
    16,
  );
  input.apis.joinDirect.aesIv = ensureFixedUtf8Length(
    input.apis.joinDirect.aesIv,
    "apis.joinDirect.aesIv",
    16,
  );
  input.apis.joinDirect.timeoutMs = ensurePositiveInteger(
    input.apis.joinDirect.timeoutMs,
    "apis.joinDirect.timeoutMs",
  );

  if (
    !Array.isArray(input.paths.profileRequiredFiles) ||
    input.paths.profileRequiredFiles.length === 0
  ) {
    throw new Error(
      "Invalid mod config: 'paths.profileRequiredFiles' must contain at least one entry.",
    );
  }
  if (
    !Array.isArray(input.migration.profileIncludePatterns) ||
    input.migration.profileIncludePatterns.length === 0
  ) {
    throw new Error(
      "Invalid mod config: 'migration.profileIncludePatterns' must contain at least one entry.",
    );
  }
  if (!Array.isArray(input.links.official)) {
    throw new Error("Invalid mod config: 'links.official' must be an array.");
  }
  for (const [index, item] of input.links.official.entries()) {
    // 公式リンクは表示名・URL・色・アイコンIDをすべて必須にする。
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

  // この時点で input は正規化済みのため、そのまま実行時設定として扱える。
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
export const GAME_SERVERS_ENABLED = modConfig.features.gameServers;

export const ANNOUNCE_API_BASE_URL = modConfig.apis.announceBaseUrl;
export const REPORTING_TERMS_URL = modConfig.apis.reportingTermsUrl;
export const GAME_SERVER_CATALOG = modConfig.apis.gameServers;
export const GAME_SERVER_JOIN_DIRECT_CONFIG = modConfig.apis.joinDirect;
export const BODY_AURA_COLORS = modConfig.theme.bodyAuraColors;
export const BODY_AURA_RGB = {
  colorLeft: hexToRgbTuple(BODY_AURA_COLORS.colorLeft),
  colorCenter: hexToRgbTuple(BODY_AURA_COLORS.colorCenter),
  colorRight: hexToRgbTuple(BODY_AURA_COLORS.colorRight),
} as const;

export const OFFICIAL_LINKS: OfficialLink[] = modConfig.links.official.map((item) => ({
  label: item.label,
  url: item.url,
  backgroundColor: item.backgroundColor,
  icon: SOCIAL_ICON_SPECS[item.iconId],
}));
