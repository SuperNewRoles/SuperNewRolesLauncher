import { describe, expect, it } from "vitest";
import { GAME_SERVER_CATALOG, GAME_SERVER_JOIN_DIRECT_CONFIG } from "../app/modConfig";
import { buildJoinQuery, intToIPv4BigEndian, intToIPv4LittleEndian } from "./join";

const hasSubtleCrypto = typeof globalThis.crypto?.subtle !== "undefined";
const cryptoIt = hasSubtleCrypto ? it : it.skip;
const defaultServerType = GAME_SERVER_CATALOG[0]?.serverType ?? 0;

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function asBufferSource(bytes: Uint8Array): BufferSource {
  return bytes as unknown as BufferSource;
}

async function decryptJoinValue(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("WebCrypto API unavailable");
  }

  const key = await subtle.importKey(
    "raw",
    asBufferSource(new TextEncoder().encode(GAME_SERVER_JOIN_DIRECT_CONFIG.aesKey)),
    { name: "AES-CBC" },
    false,
    ["decrypt"],
  );

  const decrypted = await subtle.decrypt(
    {
      name: "AES-CBC",
      iv: asBufferSource(new TextEncoder().encode(GAME_SERVER_JOIN_DIRECT_CONFIG.aesIv)),
    },
    key,
    asBufferSource(fromBase64(value)),
  );
  return new TextDecoder().decode(new Uint8Array(decrypted));
}

describe("game-servers/join", () => {
  it("converts integer IP to big and little endian forms", () => {
    expect(intToIPv4BigEndian(0x01020304)).toBe("1.2.3.4");
    expect(intToIPv4LittleEndian(0x01020304)).toBe("4.3.2.1");
  });

  cryptoIt("builds join query with required encrypted parameters", async () => {
    const query = await buildJoinQuery({
      ip: 0x01020304,
      port: 22023,
      gameId: -1819931171,
      serverType: defaultServerType,
    });
    const params = new URLSearchParams(query.slice(1));

    expect(params.get("serverIP")).toBeTruthy();
    expect(params.get("serverPort")).toBeTruthy();
    expect(params.get("serverType")).toBeTruthy();
    expect(params.get("gameID")).toBeTruthy();

    expect(await decryptJoinValue(params.get("serverIP") ?? "")).toBe("4.3.2.1");
    expect(await decryptJoinValue(params.get("serverPort") ?? "")).toBe("22023");
    expect(await decryptJoinValue(params.get("serverType") ?? "")).toBe(
      String(defaultServerType),
    );
    expect(await decryptJoinValue(params.get("gameID") ?? "")).toBe("-1819931171");
  });

  cryptoIt("includes optional matchmaker parameters only when both values exist", async () => {
    const withMatchmaker = new URLSearchParams(
      (
        await buildJoinQuery({
          ip: 0x01020304,
          port: 22023,
          gameId: -100,
          serverType: defaultServerType,
          matchmakerIp: "127.0.0.1",
          matchmakerPort: "22000",
        })
      ).slice(1),
    );

    expect(withMatchmaker.get("matchmakerIP")).toBeTruthy();
    expect(withMatchmaker.get("matchmakerPort")).toBeTruthy();
    expect(await decryptJoinValue(withMatchmaker.get("matchmakerIP") ?? "")).toBe("127.0.0.1");
    expect(await decryptJoinValue(withMatchmaker.get("matchmakerPort") ?? "")).toBe("22000");

    const withoutMatchmaker = new URLSearchParams(
      (
        await buildJoinQuery({
          ip: 0x01020304,
          port: 22023,
          gameId: -100,
          serverType: defaultServerType,
          matchmakerIp: "127.0.0.1",
          matchmakerPort: "",
        })
      ).slice(1),
    );

    expect(withoutMatchmaker.has("matchmakerIP")).toBe(false);
    expect(withoutMatchmaker.has("matchmakerPort")).toBe(false);
  });
});
