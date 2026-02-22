import { GAME_SERVER_JOIN_DIRECT_CONFIG, type GameServerJoinDirectConfig } from "../app/modConfig";
import type { GameServerRoom } from "./types";

const GAME_NAME_ALPHABET_V2 = "QWXRTYLPESDFGHUJKZOCVBINMA";
const AES_CBC_NAME = "AES-CBC";

const importedJoinKeyCache = new Map<string, Promise<CryptoKey>>();

function ensureSubtleCrypto(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("WebCrypto API is unavailable for join encryption.");
  }
  return subtle;
}

function encodeUtf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function asBufferSource(bytes: Uint8Array): BufferSource {
  // TypeScript の BufferSource 制約を満たすため、Uint8Array を明示的に扱う。
  return bytes as unknown as BufferSource;
}

function toUint32(value: number): number {
  return value >>> 0;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function importJoinAesKey(config: GameServerJoinDirectConfig): Promise<CryptoKey> {
  const subtle = ensureSubtleCrypto();
  const cacheKey = config.aesKey;
  let promise = importedJoinKeyCache.get(cacheKey);
  if (!promise) {
    promise = subtle.importKey(
      "raw",
      asBufferSource(encodeUtf8(config.aesKey)),
      { name: AES_CBC_NAME },
      false,
      ["encrypt"],
    );
    importedJoinKeyCache.set(cacheKey, promise);
  }
  return promise;
}

export function intToIPv4BigEndian(value: number): string {
  const ip = toUint32(value);
  const a = (ip >>> 24) & 255;
  const b = (ip >>> 16) & 255;
  const c = (ip >>> 8) & 255;
  const d = ip & 255;
  return `${a}.${b}.${c}.${d}`;
}

export function intToIPv4LittleEndian(value: number): string {
  const ip = toUint32(value);
  const a = ip & 255;
  const b = (ip >>> 8) & 255;
  const c = (ip >>> 16) & 255;
  const d = (ip >>> 24) & 255;
  return `${a}.${b}.${c}.${d}`;
}

function intToGameNameV2(value: number): string {
  const masked = value | 0;
  const a = masked & 0x3ff;
  const b = (masked >> 10) & 0xfffff;

  return [
    GAME_NAME_ALPHABET_V2[a % 26],
    GAME_NAME_ALPHABET_V2[Math.floor(a / 26) % 26],
    GAME_NAME_ALPHABET_V2[b % 26],
    GAME_NAME_ALPHABET_V2[Math.floor(b / 26) % 26],
    GAME_NAME_ALPHABET_V2[Math.floor(b / (26 * 26)) % 26],
    GAME_NAME_ALPHABET_V2[Math.floor(b / (26 * 26 * 26)) % 26],
  ].join("");
}

function decodeGameIdBytes(value: number): string {
  const bytes = new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
  const decoded = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  let end = decoded.length;
  while (end > 0 && decoded.charCodeAt(end - 1) === 0) {
    end--;
  }
  const trimmed = decoded.slice(0, end);
  return trimmed.length > 0 ? trimmed : String(value);
}

export function formatGameId(value: number): string {
  if (!Number.isFinite(value)) {
    return "-";
  }
  if (value < -1) {
    return intToGameNameV2(value);
  }
  return decodeGameIdBytes(value);
}

export interface JoinGamePayload {
  ip: number;
  port: number;
  gameId: number;
  serverType: number;
  matchmakerIp?: string | null;
  matchmakerPort?: string | number | null;
}

export function joinPayloadFromRoom(room: GameServerRoom, serverType: number): JoinGamePayload {
  return {
    ip: room.ipNumber,
    port: room.port,
    gameId: room.gameId,
    serverType,
    matchmakerIp: room.matchmakerIp,
    matchmakerPort: room.matchmakerPort,
  };
}

export async function encryptJoinValue(
  value: string,
  config: GameServerJoinDirectConfig = GAME_SERVER_JOIN_DIRECT_CONFIG,
): Promise<string> {
  const subtle = ensureSubtleCrypto();
  const key = await importJoinAesKey(config);
  const encrypted = await subtle.encrypt(
    { name: AES_CBC_NAME, iv: asBufferSource(encodeUtf8(config.aesIv)) },
    key,
    asBufferSource(encodeUtf8(value)),
  );
  return toBase64(new Uint8Array(encrypted));
}

export async function buildJoinQuery(
  payload: JoinGamePayload,
  config: GameServerJoinDirectConfig = GAME_SERVER_JOIN_DIRECT_CONFIG,
): Promise<string> {
  const params = new URLSearchParams();

  const appendEncrypted = async (key: string, value: string | number): Promise<void> => {
    params.append(key, await encryptJoinValue(String(value), config));
  };

  await appendEncrypted("serverIP", intToIPv4LittleEndian(payload.ip));
  await appendEncrypted("serverPort", payload.port);
  await appendEncrypted("serverType", payload.serverType);
  await appendEncrypted("gameID", payload.gameId);

  const matchmakerIp = payload.matchmakerIp?.trim() ?? "";
  const matchmakerPortRaw = payload.matchmakerPort;
  const matchmakerPort = matchmakerPortRaw === null ? "" : String(matchmakerPortRaw ?? "").trim();
  if (matchmakerIp.length > 0 && matchmakerPort.length > 0) {
    await appendEncrypted("matchmakerIP", matchmakerIp);
    await appendEncrypted("matchmakerPort", matchmakerPort);
  }

  return `?${params.toString()}`;
}
