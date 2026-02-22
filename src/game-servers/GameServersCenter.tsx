import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GAME_SERVER_CATALOG } from "../app/modConfig";
import { gameServersJoinDirect } from "../app/services/tauriClient";
import type { LocaleCode, createTranslator } from "../i18n";
import { buildJoinQuery, formatGameId, joinPayloadFromRoom } from "./join";
import { fetchGameServerRooms, resolveGameServerById } from "./roomsApi";
import type { GameServerRoom } from "./types";

type Translator = ReturnType<typeof createTranslator>;

const ROOMS_REFRESH_INTERVAL_MS = 15_000;

interface GameServersCenterProps {
  locale: LocaleCode;
  t: Translator;
  initialSelectedServerId?: string | null;
  onSelectedServerIdChange?: (serverId: string) => Promise<void> | void;
}

function formatActionError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking '[^']+':\s*/u, "").trim() || raw;
}

function compareRoomsForDisplay(a: GameServerRoom, b: GameServerRoom): number {
  const aIsRecruiting = a.gameState === 0;
  const bIsRecruiting = b.gameState === 0;
  if (aIsRecruiting !== bIsRecruiting) {
    return bIsRecruiting ? 1 : -1;
  }
  return b.playerCount - a.playerCount;
}

function formatQuickChat(value: number | null, t: Translator): string {
  if (value === 1) {
    return t("gameServers.quickChat.free");
  }
  if (value === 2) {
    return t("gameServers.quickChat.quick");
  }
  if (value === null) {
    return t("common.unset");
  }
  return t("gameServers.quickChat.unknown", { value });
}

function formatGameState(value: number | null, t: Translator): string {
  if (value === 0) {
    return t("gameServers.gameState.recruiting");
  }
  if (value === 1) {
    return t("gameServers.gameState.starting");
  }
  if (value === 2) {
    return t("gameServers.gameState.started");
  }
  if (value === 3) {
    return t("gameServers.gameState.ended");
  }
  if (value === 4) {
    return t("gameServers.gameState.destroyed");
  }
  if (value === null) {
    return t("common.unset");
  }
  return t("gameServers.gameState.unknown", { value });
}

export function GameServersCenter({
  locale,
  t,
  initialSelectedServerId,
  onSelectedServerIdChange,
}: GameServersCenterProps) {
  const [selectedServerId, setSelectedServerId] = useState(() =>
    resolveGameServerById(initialSelectedServerId).id,
  );
  const [roomsServerId, setRoomsServerId] = useState(() =>
    resolveGameServerById(initialSelectedServerId).id,
  );
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [rooms, setRooms] = useState<GameServerRoom[]>([]);
  const [totalRooms, setTotalRooms] = useState(0);
  const [publicRooms, setPublicRooms] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [joinMessage, setJoinMessage] = useState("");
  const [joinMessageTone, setJoinMessageTone] = useState<"info" | "success" | "error">("info");
  const [joiningRoomKey, setJoiningRoomKey] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const hasFetchedRef = useRef(false);
  const latestRefreshRequestIdRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const nextServerId = resolveGameServerById(initialSelectedServerId).id;
    setSelectedServerId((current) => (current === nextServerId ? current : nextServerId));
  }, [initialSelectedServerId]);

  const refreshRooms = useCallback(
    async (manual = false) => {
      const requestId = latestRefreshRequestIdRef.current + 1;
      latestRefreshRequestIdRef.current = requestId;
      if (manual) {
        setStatusMessage(t("gameServers.statusRefreshing"));
      } else if (!hasFetchedRef.current) {
        setStatusMessage(t("gameServers.statusLoading"));
      }
      setErrorMessage("");
      setIsLoading(true);

      try {
        const snapshot = await fetchGameServerRooms(selectedServerId);
        if (!isMountedRef.current || requestId !== latestRefreshRequestIdRef.current) {
          return;
        }
        hasFetchedRef.current = true;
        setRooms(snapshot.rooms);
        setRoomsServerId(snapshot.serverId);
        setTotalRooms(snapshot.totalRooms);
        setPublicRooms(snapshot.publicRooms);
        setLastUpdatedAt(snapshot.fetchedAt);
        setStatusMessage(manual ? t("gameServers.statusUpdated") : "");
      } catch (error) {
        if (!isMountedRef.current || requestId !== latestRefreshRequestIdRef.current) {
          return;
        }
        setErrorMessage(t("gameServers.statusLoadFailed", { error: formatActionError(error) }));
      } finally {
        if (isMountedRef.current && requestId === latestRefreshRequestIdRef.current) {
          setIsLoading(false);
        }
      }
    },
    [selectedServerId, t],
  );

  useEffect(() => {
    void refreshRooms(false);
  }, [refreshRooms]);

  useEffect(() => {
    if (!autoRefreshEnabled) {
      return;
    }
    const timer = window.setInterval(() => {
      void refreshRooms(false);
    }, ROOMS_REFRESH_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [autoRefreshEnabled, refreshRooms]);

  const visibleRooms = useMemo(() => [...rooms].sort(compareRoomsForDisplay), [rooms]);

  const lastUpdatedLabel = lastUpdatedAt
    ? new Date(lastUpdatedAt).toLocaleString(locale)
    : t("common.unset");

  const handleServerSelect = useCallback(
    async (nextServerId: string) => {
      const resolvedServerId = resolveGameServerById(nextServerId).id;
      setSelectedServerId(resolvedServerId);
      setJoinMessage("");
      if (!onSelectedServerIdChange) {
        return;
      }
      try {
        await onSelectedServerIdChange(resolvedServerId);
      } catch (error) {
        setJoinMessageTone("error");
        setJoinMessage(t("gameServers.serverSaveFailed", { error: formatActionError(error) }));
      }
    },
    [onSelectedServerIdChange, t],
  );

  const handleJoin = useCallback(
    async (room: GameServerRoom) => {
      setJoiningRoomKey(room.key);
      setJoinMessageTone("info");
      setJoinMessage(t("gameServers.joinJoining"));
      try {
        const roomSourceServer = resolveGameServerById(roomsServerId);
        const query = await buildJoinQuery(joinPayloadFromRoom(room, roomSourceServer.serverType));
        const result = await gameServersJoinDirect(query);
        if (result.ok) {
          setJoinMessageTone("success");
          setJoinMessage(t("gameServers.joinSuccess"));
        } else {
          const responseMessage = result.message.trim() || `HTTP ${result.status}`;
          const shortMessage =
            responseMessage.length > 120 ? `${responseMessage.slice(0, 117)}...` : responseMessage;
          setJoinMessageTone("error");
          setJoinMessage(t("gameServers.joinFailed", { message: shortMessage }));
        }
      } catch (error) {
        const errorCode = formatActionError(error);
        setJoinMessageTone("error");
        if (errorCode === "JOIN_LOCALHOST_UNREACHABLE") {
          setJoinMessage(t("gameServers.joinTransportUnreachable"));
        } else {
          setJoinMessage(t("gameServers.joinTransportError"));
        }
      } finally {
        setJoiningRoomKey(null);
      }
    },
    [roomsServerId, t],
  );

  const joinMessageClassName =
    joinMessageTone === "success"
      ? "status-line success"
      : joinMessageTone === "error"
        ? "status-line error"
        : "status-line";
  const lastUpdatedMessage = errorMessage
    ? { text: errorMessage, className: "status-line error" }
    : statusMessage
      ? { text: statusMessage, className: "status-line" }
      : joinMessage
      ? { text: joinMessage, className: joinMessageClassName }
      : null;

  return (
    <div className="game-servers-center">
      <header className="game-servers-toolbar">
        <div className="game-servers-controls">
          <label className="game-servers-control-field" htmlFor="game-servers-select">
            <span className="game-servers-control-label">{t("gameServers.serverLabel")}</span>
            <select
              id="game-servers-select"
              className="game-servers-control-input"
              value={selectedServerId}
              onChange={(event) => {
                void handleServerSelect(event.target.value);
              }}
            >
              {GAME_SERVER_CATALOG.map((server) => (
                <option key={server.id} value={server.id}>
                  {server.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="game-servers-actions">
          <label className="game-servers-auto-refresh">
            <input
              type="checkbox"
              checked={autoRefreshEnabled}
              onChange={(event) => {
                setAutoRefreshEnabled(event.target.checked);
              }}
            />
            <span>{t("gameServers.autoRefresh")}</span>
          </label>
          <button
            type="button"
            className="game-servers-refresh-button"
            onClick={() => {
              void refreshRooms(true);
            }}
            disabled={isLoading}
          >
            {isLoading ? t("gameServers.refreshing") : t("gameServers.refresh")}
          </button>
        </div>
      </header>

      <section className="game-servers-stats">
        <article className="game-servers-stat-card">
          <span className="game-servers-stat-label">{t("gameServers.stats.total")}</span>
          <strong className="game-servers-stat-value">{totalRooms}</strong>
        </article>
        <article className="game-servers-stat-card">
          <span className="game-servers-stat-label">{t("gameServers.stats.public")}</span>
          <strong className="game-servers-stat-value">{publicRooms}</strong>
        </article>
      </section>

      <section className="game-servers-status" aria-live="polite">
        <span className="game-servers-status-line">
          <span className="muted">{t("gameServers.lastUpdated", { time: lastUpdatedLabel })}</span>
          {lastUpdatedMessage ? <span className="game-servers-status-separator">|</span> : null}
          {lastUpdatedMessage ? (
            <span className={lastUpdatedMessage.className}>{lastUpdatedMessage.text}</span>
          ) : null}
        </span>
      </section>

      <section className="game-servers-room-list" aria-live="polite">
        {visibleRooms.length === 0 ? (
          <p className="game-servers-empty muted">
            {isLoading ? t("gameServers.statusLoading") : t("gameServers.empty")}
          </p>
        ) : (
          visibleRooms.map((room) => {
            const isStartedRoom = room.gameState === 2;
            const isFullRoom = room.maxPlayers > 0 && room.playerCount >= room.maxPlayers;
            const isJoinUnavailable = isStartedRoom || isFullRoom;
            const joinButtonDisabled = joiningRoomKey !== null || isJoinUnavailable;
            return (
              <article key={room.key} className="game-servers-room-card">
                <header className="game-servers-room-header">
                  <div className="game-servers-room-heading">
                    <h3 className="game-servers-room-title">{room.trueHostName}</h3>
                  </div>
                <div className="game-servers-room-badges">
                  <div
                    className="game-servers-room-players"
                    role="img"
                    aria-label={t("gameServers.players", {
                      current: room.playerCount,
                      max: room.maxPlayers,
                    })}
                  >
                    <div className="game-servers-room-players-meta">
                      <span
                        className={`badge game-servers-room-state-badge${
                          room.gameState === 0 ? " success" : room.gameState === 2 ? " danger" : ""
                        }`}
                      >
                        {formatGameState(room.gameState, t)}
                      </span>
                    </div>
                    <span className="game-servers-room-players-value-wrap">
                      <span className="game-servers-room-players-label">{t("gameServers.playersLabel")}</span>
                      <strong className="game-servers-room-players-value">
                        {room.playerCount}
                        <span>/{room.maxPlayers}</span>
                      </strong>
                    </span>
                  </div>
                </div>
              </header>

                <div className="game-servers-room-join-row">
                  <div className="game-servers-room-join-meta">
                    <div className="game-servers-room-code-wrap">
                      <span className="game-servers-room-code-label">{t("gameServers.roomCodeLabel")}</span>
                      <code className="game-servers-room-code">{formatGameId(room.gameId)}</code>
                    </div>
                    <div className="game-servers-room-code-wrap">
                      <span className="game-servers-room-code-label">{t("gameServers.languageLabel")}</span>
                      <span className="game-servers-room-language">{room.language}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className={`game-servers-room-join${
                      isJoinUnavailable ? " game-servers-room-join-unavailable" : ""
                    }`}
                    disabled={joinButtonDisabled}
                    onClick={() => {
                      void handleJoin(room);
                    }}
                  >
                    {joiningRoomKey === room.key ? t("gameServers.joinJoining") : t("gameServers.join")}
                  </button>
                </div>

                <div className="game-servers-room-priority-meta">
                  <div className="game-servers-room-priority-item">
                    <span className="game-servers-room-priority-label">{t("gameServers.mapShort")}</span>
                    <strong className="game-servers-room-priority-value">{room.mapId}</strong>
                  </div>
                  <div className="game-servers-room-priority-item">
                    <span className="game-servers-room-priority-label">
                      {t("gameServers.impostorsShort")}
                    </span>
                    <strong className="game-servers-room-priority-value">
                      {room.numImpostors ?? t("common.unset")}
                    </strong>
                  </div>
                </div>

                <details className="game-servers-room-details">
                  <summary>{t("gameServers.details")}</summary>
                  <div className="game-servers-room-details-content">
                    <div className="game-servers-room-details-content-inner">
                      <dl className="game-servers-room-detail-grid">
                        <div>
                          <dt>{t("gameServers.detail.ipPort")}</dt>
                          <dd>
                            {room.ipBigEndian}:{room.port}
                          </dd>
                        </div>
                        <div>
                          <dt>{t("gameServers.detail.platform")}</dt>
                          <dd>{room.platform}</dd>
                        </div>
                        <div>
                          <dt>{t("gameServers.detail.gameState")}</dt>
                          <dd>{formatGameState(room.gameState, t)}</dd>
                        </div>
                        <div>
                          <dt>{t("gameServers.detail.quickChat")}</dt>
                          <dd>{formatQuickChat(room.quickChat, t)}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                </details>
              </article>
            );
          })
        )}
      </section>
    </div>
  );
}
