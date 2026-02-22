import { GAME_SERVER_CATALOG, type GameServerCatalogEntry } from "../app/modConfig";
import { intToIPv4BigEndian, intToIPv4LittleEndian } from "./join";
import type {
  GameServerRoom,
  GameServerRoomRaw,
  GameServerRoomsApiResponse,
  GameServerRoomsSnapshot,
} from "./types";

const ROOMS_API_PATH = "api/games/all_for_web";

function ensureCatalogNotEmpty(): readonly GameServerCatalogEntry[] {
  if (GAME_SERVER_CATALOG.length === 0) {
    throw new Error("Game server catalog is empty.");
  }
  return GAME_SERVER_CATALOG;
}

function normalizeDomain(domain: string): string {
  return domain.trim().replace(/\/+$/u, "");
}

function toSafeInteger(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function sanitizeString(value: unknown, fallback = "-"): string {
  if (typeof value !== "string") {
    return fallback;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function pickMatchmakerIp(raw: GameServerRoomRaw): string | null {
  const value = raw.MatchmakerIP ?? raw.MatchmakerIp ?? raw.MatchmakerHost;
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function pickMatchmakerPort(raw: GameServerRoomRaw): string | null {
  const value =
    raw.MatchmakerPort ??
    raw.MatchmakerPortNumber ??
    raw.MatchmakerPortString ??
    raw.MatchmakerPortValue;
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = String(value).trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeRoom(raw: GameServerRoomRaw): GameServerRoom | null {
  const ip = toSafeInteger(raw.IP);
  const port = toSafeInteger(raw.Port);
  const gameId = toSafeInteger(raw.GameId);
  if (ip === null || port === null || gameId === null) {
    return null;
  }

  const ipNumber = ip >>> 0;
  const hostName = sanitizeString(raw.HostName);
  const trueHostName = sanitizeString(raw.TrueHostName, hostName);

  const matchmakerIp = pickMatchmakerIp(raw);
  const matchmakerPort = pickMatchmakerPort(raw);

  return {
    key: `${gameId}|${ipNumber}|${port}`,
    ipNumber,
    ipBigEndian: intToIPv4BigEndian(ipNumber),
    ipLittleEndian: intToIPv4LittleEndian(ipNumber),
    port,
    gameId,
    hostName,
    trueHostName,
    hostPlatformName: sanitizeString(raw.HostPlatformName),
    platform: sanitizeString(raw.Platform),
    quickChat: toSafeInteger(raw.QuickChat),
    ageSeconds: toSafeInteger(raw.Age),
    maxPlayers: toSafeInteger(raw.MaxPlayers) ?? 0,
    playerCount: toSafeInteger(raw.PlayerCount) ?? 0,
    numImpostors: toSafeInteger(raw.NumImpostors),
    mapId: sanitizeString(raw.MapId),
    language: sanitizeString(raw.Language),
    gameState: toSafeInteger(raw.GameState),
    matchmakerIp: matchmakerIp && matchmakerPort ? matchmakerIp : null,
    matchmakerPort: matchmakerIp && matchmakerPort ? matchmakerPort : null,
  };
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as {
      message?: string;
      error?: { message?: string };
    };
    const message = body.error?.message?.trim() || body.message?.trim();
    if (message) {
      return message;
    }
  } catch {
    // ignore parse failures
  }
  return `Request failed with status ${response.status}`;
}

async function requestRooms(url: URL): Promise<GameServerRoomsApiResponse> {
  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(`${message} (${response.status})`);
  }

  return (await response.json()) as GameServerRoomsApiResponse;
}

export function resolveGameServerById(
  serverId: string | null | undefined,
): GameServerCatalogEntry {
  const catalog = ensureCatalogNotEmpty();
  const fallback = catalog[0];
  const normalizedId = serverId?.trim();
  if (!normalizedId) {
    return fallback;
  }

  const matched = catalog.find((item) => item.id === normalizedId);
  return matched ?? fallback;
}

export function buildRoomsApiUrl(domain: string): URL {
  const normalizedDomain = normalizeDomain(domain);
  return new URL(ROOMS_API_PATH, `${normalizedDomain}/`);
}

export async function fetchGameServerRooms(
  serverId: string | null | undefined,
): Promise<GameServerRoomsSnapshot> {
  const server = resolveGameServerById(serverId);
  const url = buildRoomsApiUrl(server.roomsApiDomain);
  const data = await requestRooms(url);

  const rooms = (Array.isArray(data.games) ? data.games : [])
    .map((item) => normalizeRoom(item))
    .filter((item): item is GameServerRoom => item !== null);

  const totalRoomsRaw = data.metadata?.allGamesCount;
  const publicRoomsRaw = data.metadata?.matchingGamesCount;
  const totalRooms =
    typeof totalRoomsRaw === "number" && Number.isFinite(totalRoomsRaw)
      ? Math.trunc(totalRoomsRaw)
      : rooms.length;
  const publicRooms =
    typeof publicRoomsRaw === "number" && Number.isFinite(publicRoomsRaw)
      ? Math.trunc(publicRoomsRaw)
      : rooms.length;

  return {
    serverId: server.id,
    rooms,
    totalRooms,
    publicRooms,
    fetchedAt: Date.now(),
  };
}
