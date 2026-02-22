import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GAME_SERVER_CATALOG } from "../app/modConfig";
import { buildRoomsApiUrl, fetchGameServerRooms, resolveGameServerById } from "./roomsApi";

describe("game-servers/roomsApi", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("builds rooms API URL from domain", () => {
    const url = buildRoomsApiUrl("https://example.com/");
    expect(url.toString()).toBe("https://example.com/api/games/all_for_web");
  });

  it("throws formatted error for non-ok response", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: "server unavailable",
          },
        }),
        { status: 503 },
      ),
    );

    await expect(fetchGameServerRooms(GAME_SERVER_CATALOG[0]?.id)).rejects.toThrow(
      "server unavailable (503)",
    );
  });

  it("parses response into normalized room snapshot", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          games: [
            {
              IP: 16909060,
              Port: 22023,
              GameId: -1819931171,
              PlayerCount: 5,
              HostName: "host",
              TrueHostName: "true host",
              Platform: "StandaloneSteamPC",
              QuickChat: 1,
              Age: 12,
              MaxPlayers: 15,
              NumImpostors: 2,
              MapId: "Polus",
              Language: "Japanese",
              GameState: 0,
            },
          ],
          metadata: {
            allGamesCount: 10,
            matchingGamesCount: 7,
          },
        }),
        { status: 200 },
      ),
    );

    const server = resolveGameServerById(GAME_SERVER_CATALOG[0]?.id);
    const snapshot = await fetchGameServerRooms(server.id);

    expect(snapshot.serverId).toBe(server.id);
    expect(snapshot.totalRooms).toBe(10);
    expect(snapshot.publicRooms).toBe(7);
    expect(snapshot.rooms).toHaveLength(1);
    expect(snapshot.rooms[0]?.ipBigEndian).toBe("1.2.3.4");
    expect(snapshot.rooms[0]?.ipLittleEndian).toBe("4.3.2.1");
    expect(snapshot.rooms[0]?.port).toBe(22023);
    expect(snapshot.rooms[0]?.playerCount).toBe(5);
    expect(snapshot.rooms[0]?.gameState).toBe(0);
  });
});
