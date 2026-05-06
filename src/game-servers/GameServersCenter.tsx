import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GAME_SERVER_CATALOG } from "../app/modConfig";
import { gameServersJoinDirect } from "../app/services/tauriClient";
import type { LocaleCode, createTranslator } from "../i18n";
import { buildJoinQuery, formatGameId, joinPayloadFromRoom } from "./join";
import { fetchGameServerRooms, resolveGameServerById } from "./roomsApi";
import type { GameServerRoom } from "./types";

type Translator = ReturnType<typeof createTranslator>;

const ROOMS_REFRESH_INTERVAL_MS = 5_000;

const GAME_STATE_FILTERS = [0, 1, 2, 3, 4] as const;
const MAP_FILTERS = [
  { value: "0", label: "Skeld" },
  { value: "1", label: "MIRA HQ" },
  { value: "2", label: "Polus" },
  { value: "3", label: "Dleks" },
  { value: "4", label: "Airship" },
  { value: "5", label: "Fungle" },
] as const;

const MAP_NAMES = MAP_FILTERS.reduce<Record<string, string>>((acc, item) => {
  acc[item.value] = item.label;
  return acc;
}, {});

interface GameServersCenterProps {
  locale: LocaleCode;
  t: Translator;
  initialSelectedServerId?: string | null;
  onSelectedServerIdChange?: (serverId: string) => Promise<void> | void;
}

interface RoomStats {
  joinable: number;
  full: number;
  ingame: number;
}

function formatActionError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking '[^']+':\s*/u, "").trim() || raw;
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

function formatMapName(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized === "-") {
    return "-";
  }
  return MAP_NAMES[normalized] ?? normalized;
}

function resolveMapFilterValue(value: string): string {
  const normalized = value.trim();
  const direct = MAP_FILTERS.find((item) => item.value === normalized);
  if (direct) {
    return direct.value;
  }
  const byLabel = MAP_FILTERS.find((item) => item.label.toLowerCase() === normalized.toLowerCase());
  return byLabel?.value ?? normalized;
}

function isFullRoom(room: GameServerRoom): boolean {
  return room.maxPlayers > 0 && room.playerCount >= room.maxPlayers;
}

function isStartedRoom(room: GameServerRoom): boolean {
  return room.gameState === 2;
}

function isJoinUnavailable(room: GameServerRoom): boolean {
  return isStartedRoom(room) || isFullRoom(room);
}

function isJoinableRoom(room: GameServerRoom): boolean {
  return !isJoinUnavailable(room);
}

function getPlayerPercent(room: GameServerRoom): number {
  if (room.maxPlayers <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, Math.round((room.playerCount / room.maxPlayers) * 100)));
}

function getStatusClassName(room: GameServerRoom): string {
  if (room.gameState === 0) {
    return "status-recruiting";
  }
  if (room.gameState === 1) {
    return "status-ingame";
  }
  if (room.gameState === 2) {
    return "status-progress";
  }
  if (room.gameState === 3 || room.gameState === 4) {
    return "status-ended";
  }
  return "status-unknown";
}

function getProgressClassName(room: GameServerRoom): string {
  if (isStartedRoom(room)) {
    return "red";
  }
  if (isFullRoom(room) || room.gameState === 1) {
    return "orange";
  }
  return "green";
}

function compareRoomsForDisplay(a: GameServerRoom, b: GameServerRoom): number {
  const aOrder = getDisplayOrder(a);
  const bOrder = getDisplayOrder(b);
  if (aOrder !== bOrder) {
    return aOrder - bOrder;
  }
  return b.playerCount - a.playerCount;
}

function getDisplayOrder(room: GameServerRoom): number {
  if (isJoinableRoom(room)) {
    return 0;
  }
  if (room.gameState === 1 || room.gameState === 2) {
    return 1;
  }
  if (isFullRoom(room)) {
    return 2;
  }
  return 3;
}

function matchesKeyword(room: GameServerRoom, keyword: string): boolean {
  if (!keyword) {
    return true;
  }
  const lowerKeyword = keyword.toLowerCase();
  const searchableText = [
    room.trueHostName,
    room.hostName,
    formatGameId(room.gameId),
    formatMapName(room.mapId),
    room.language,
    room.platform,
  ]
    .join(" ")
    .toLowerCase();
  return searchableText.includes(lowerKeyword);
}

function matchesMapFilter(room: GameServerRoom, mapFilter: string): boolean {
  if (!mapFilter) {
    return true;
  }
  return resolveMapFilterValue(room.mapId) === mapFilter;
}

function buildRoomStats(rooms: GameServerRoom[]): RoomStats {
  return rooms.reduce<RoomStats>(
    (acc, room) => {
      if (isJoinableRoom(room)) {
        acc.joinable += 1;
      }
      if (isFullRoom(room)) {
        acc.full += 1;
      }
      if (room.gameState === 1 || room.gameState === 2) {
        acc.ingame += 1;
      }
      return acc;
    },
    { joinable: 0, full: 0, ingame: 0 },
  );
}

async function copyTextToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall back to the textarea path for WebViews that expose but reject Clipboard API calls.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!copied) {
    throw new Error("Clipboard copy failed.");
  }
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" x2="16.65" y1="21" y2="16.65" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function MapIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function JoinableStatIcon() {
  return (
    <svg className="game-servers-stat-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
    </svg>
  );
}

function FullStatIcon() {
  return (
    <svg className="game-servers-stat-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
    </svg>
  );
}

function InGameStatIcon() {
  return (
    <svg className="game-servers-stat-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z" />
    </svg>
  );
}

export function GameServersCenter({
  locale,
  t,
  initialSelectedServerId,
  onSelectedServerIdChange,
}: GameServersCenterProps) {
  const [selectedServerId, setSelectedServerId] = useState(
    () => resolveGameServerById(initialSelectedServerId).id,
  );
  const [roomsServerId, setRoomsServerId] = useState(
    () => resolveGameServerById(initialSelectedServerId).id,
  );
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState(true);
  const [rooms, setRooms] = useState<GameServerRoom[]>([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [joinMessage, setJoinMessage] = useState("");
  const [joinMessageTone, setJoinMessageTone] = useState<"info" | "success" | "error">("info");
  const [joiningRoomKey, setJoiningRoomKey] = useState<string | null>(null);
  const [copiedRoomKey, setCopiedRoomKey] = useState<string | null>(null);
  const [searchKeyword, setSearchKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [mapFilter, setMapFilter] = useState("");
  const [joinableOnly, setJoinableOnly] = useState(true);
  const [openRoomDetails, setOpenRoomDetails] = useState<ReadonlySet<string>>(() => new Set());

  const isMountedRef = useRef(true);
  const hasFetchedRef = useRef(false);
  const latestRefreshRequestIdRef = useRef(0);
  const copiedResetTimerRef = useRef<number | null>(null);
  const selectedServerIdRef = useRef(selectedServerId);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (copiedResetTimerRef.current !== null) {
        window.clearTimeout(copiedResetTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    selectedServerIdRef.current = selectedServerId;
  }, [selectedServerId]);

  useEffect(() => {
    const nextServerId = resolveGameServerById(initialSelectedServerId).id;
    if (selectedServerIdRef.current === nextServerId) {
      return;
    }
    latestRefreshRequestIdRef.current += 1;
    hasFetchedRef.current = false;
    selectedServerIdRef.current = nextServerId;
    setSelectedServerId(nextServerId);
    setRoomsServerId(nextServerId);
    setRooms([]);
    setLastUpdatedAt(null);
    setStatusMessage("");
    setErrorMessage("");
    setJoinMessage("");
    setCopiedRoomKey(null);
    setOpenRoomDetails(new Set());
  }, [initialSelectedServerId]);

  const refreshRooms = useCallback(
    async (manual = false) => {
      const requestId = latestRefreshRequestIdRef.current + 1;
      latestRefreshRequestIdRef.current = requestId;
      const shouldClearRooms = manual || !hasFetchedRef.current;
      if (manual) {
        setStatusMessage(t("gameServers.statusRefreshing"));
      } else if (!hasFetchedRef.current) {
        setStatusMessage(t("gameServers.statusLoading"));
      }
      setErrorMessage("");
      setIsLoading(true);
      if (shouldClearRooms) {
        setRooms([]);
      }

      try {
        const snapshot = await fetchGameServerRooms(selectedServerId);
        if (!isMountedRef.current || requestId !== latestRefreshRequestIdRef.current) {
          return;
        }
        hasFetchedRef.current = true;
        setRooms(snapshot.rooms);
        setRoomsServerId(snapshot.serverId);
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

  const filteredRooms = useMemo(
    () =>
      rooms
        .filter((room) => matchesKeyword(room, searchKeyword.trim()))
        .filter((room) => statusFilter === "" || String(room.gameState) === statusFilter)
        .filter((room) => matchesMapFilter(room, mapFilter))
        .filter((room) => !joinableOnly || isJoinableRoom(room))
        .sort(compareRoomsForDisplay),
    [joinableOnly, mapFilter, rooms, searchKeyword, statusFilter],
  );

  const roomStats = useMemo(() => buildRoomStats(rooms), [rooms]);

  const lastUpdatedLabel = lastUpdatedAt
    ? new Date(lastUpdatedAt).toLocaleString(locale)
    : t("common.unset");

  const handleServerSelect = useCallback(
    async (nextServerId: string) => {
      const resolvedServerId = resolveGameServerById(nextServerId).id;
      if (resolvedServerId === selectedServerId) {
        return;
      }
      latestRefreshRequestIdRef.current += 1;
      hasFetchedRef.current = false;
      selectedServerIdRef.current = resolvedServerId;
      setSelectedServerId(resolvedServerId);
      setRoomsServerId(resolvedServerId);
      setRooms([]);
      setLastUpdatedAt(null);
      setStatusMessage("");
      setErrorMessage("");
      setJoinMessage("");
      setCopiedRoomKey(null);
      setOpenRoomDetails(new Set());
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
    [onSelectedServerIdChange, selectedServerId, t],
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

  const handleCopyCode = useCallback(
    async (room: GameServerRoom) => {
      const roomCode = formatGameId(room.gameId);
      try {
        await copyTextToClipboard(roomCode);
        setCopiedRoomKey(room.key);
        setJoinMessageTone("success");
        setJoinMessage(t("gameServers.copyCodeSuccess"));
        if (copiedResetTimerRef.current !== null) {
          window.clearTimeout(copiedResetTimerRef.current);
        }
        copiedResetTimerRef.current = window.setTimeout(() => {
          setCopiedRoomKey((current) => (current === room.key ? null : current));
        }, 1200);
      } catch {
        setJoinMessageTone("error");
        setJoinMessage(t("gameServers.copyCodeFailed"));
      }
    },
    [t],
  );

  const toggleRoomDetails = useCallback((roomKey: string) => {
    setOpenRoomDetails((current) => {
      const next = new Set(current);
      if (next.has(roomKey)) {
        next.delete(roomKey);
      } else {
        next.add(roomKey);
      }
      return next;
    });
  }, []);

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
  const showBlockingLoading = isLoading && rooms.length === 0;

  const renderDetails = (room: GameServerRoom) => (
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
        <dt>{t("gameServers.statusLabel")}</dt>
        <dd>{formatGameState(room.gameState, t)}</dd>
      </div>
      <div>
        <dt>{t("gameServers.mapLabel")}</dt>
        <dd>{formatMapName(room.mapId)}</dd>
      </div>
      <div>
        <dt>{t("gameServers.detail.quickChat")}</dt>
        <dd>{formatQuickChat(room.quickChat, t)}</dd>
      </div>
    </dl>
  );

  const renderProgress = (room: GameServerRoom) => (
    <div className="game-servers-room-progress" aria-hidden="true">
      <span
        className={`game-servers-room-progress-fill ${getProgressClassName(room)}`}
        style={{ width: `${getPlayerPercent(room)}%` }}
      />
    </div>
  );

  const renderJoinButton = (room: GameServerRoom) => {
    const unavailable = isJoinUnavailable(room);
    const disabled = joiningRoomKey !== null || unavailable;
    return (
      <button
        type="button"
        className={`game-servers-room-join${
          unavailable ? " game-servers-room-join-unavailable" : ""
        }`}
        disabled={disabled}
        onClick={() => {
          void handleJoin(room);
        }}
      >
        {joiningRoomKey === room.key
          ? t("gameServers.joinJoining")
          : unavailable
            ? t("gameServers.joinUnavailable")
            : t("gameServers.join")}
      </button>
    );
  };

  const renderCopyButton = (room: GameServerRoom) => (
    <button
      type="button"
      className={`game-servers-room-copy${copiedRoomKey === room.key ? " is-copied" : ""}`}
      onClick={() => {
        void handleCopyCode(room);
      }}
    >
      {copiedRoomKey === room.key ? t("gameServers.copyCodeCopied") : t("gameServers.copyCode")}
    </button>
  );

  const renderActionButtons = (room: GameServerRoom) => (
    <div className="game-servers-room-actions">
      {renderJoinButton(room)}
      {renderCopyButton(room)}
    </div>
  );

  const renderMapBadge = (room: GameServerRoom) => (
    <span className="game-servers-map-badge">
      <span className="game-servers-map-icon">
        <MapIcon />
      </span>
      <span>{formatMapName(room.mapId)}</span>
    </span>
  );

  return (
    <div className="game-servers-center" aria-busy={isLoading}>
      <header className="game-servers-toolbar">
        <div className="game-servers-toolbar-main">
          <div>
            <h2 className="game-servers-title">{t("gameServers.tab")}</h2>
            <p className="game-servers-subtitle">{t("gameServers.subtitle")}</p>
          </div>
        </div>

        <div className="game-servers-toolbar-actions">
          <label className="game-servers-auto-refresh">
            <input
              type="checkbox"
              checked={autoRefreshEnabled}
              onChange={(event) => {
                setAutoRefreshEnabled(event.target.checked);
              }}
            />
            <span className="game-servers-live-dot" aria-hidden="true" />
            <span>{t("gameServers.autoRefresh")}</span>
          </label>
          <span className="game-servers-last-updated">
            {t("gameServers.lastUpdated", { time: lastUpdatedLabel })}
          </span>
          <button
            type="button"
            className="game-servers-refresh-button"
            onClick={() => {
              void refreshRooms(true);
            }}
            disabled={isLoading}
          >
            <RefreshIcon />
            <span>{isLoading ? t("gameServers.refreshing") : t("gameServers.refresh")}</span>
          </button>
        </div>
      </header>

      <section className="game-servers-filter-bar" aria-label={t("gameServers.filtersLabel")}>
        <label className="game-servers-control-field game-servers-server-field">
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

        <label className="game-servers-search-field">
          <span className="game-servers-search-icon">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={searchKeyword}
            placeholder={t("gameServers.searchPlaceholder")}
            onChange={(event) => {
              setSearchKeyword(event.target.value);
            }}
          />
        </label>

        <label className="game-servers-control-field">
          <span className="game-servers-control-label">{t("gameServers.statusLabel")}</span>
          <select
            className="game-servers-control-input"
            value={statusFilter}
            onChange={(event) => {
              setStatusFilter(event.target.value);
            }}
          >
            <option value="">{t("gameServers.filterAll")}</option>
            {GAME_STATE_FILTERS.map((state) => (
              <option key={state} value={String(state)}>
                {formatGameState(state, t)}
              </option>
            ))}
          </select>
        </label>

        <label className="game-servers-control-field">
          <span className="game-servers-control-label">{t("gameServers.mapLabel")}</span>
          <select
            className="game-servers-control-input"
            value={mapFilter}
            onChange={(event) => {
              setMapFilter(event.target.value);
            }}
          >
            <option value="">{t("gameServers.filterAll")}</option>
            {MAP_FILTERS.map((map) => (
              <option key={map.value} value={map.value}>
                {map.label}
              </option>
            ))}
          </select>
        </label>

        <label className="game-servers-joinable-filter">
          <input
            type="checkbox"
            checked={joinableOnly}
            onChange={(event) => {
              setJoinableOnly(event.target.checked);
            }}
          />
          <span>{t("gameServers.joinableOnly")}</span>
        </label>
      </section>

      <section className="game-servers-stats">
        <article className="game-servers-stat-card stat-green">
          <span className="game-servers-stat-icon-wrap">
            <JoinableStatIcon />
          </span>
          <span className="game-servers-stat-text">
            <span className="game-servers-stat-label">{t("gameServers.stats.joinable")}</span>
            <strong className="game-servers-stat-value">{roomStats.joinable}</strong>
          </span>
        </article>
        <article className="game-servers-stat-card stat-orange">
          <span className="game-servers-stat-icon-wrap">
            <FullStatIcon />
          </span>
          <span className="game-servers-stat-text">
            <span className="game-servers-stat-label">{t("gameServers.stats.full")}</span>
            <strong className="game-servers-stat-value">{roomStats.full}</strong>
          </span>
        </article>
        <article className="game-servers-stat-card stat-red">
          <span className="game-servers-stat-icon-wrap">
            <InGameStatIcon />
          </span>
          <span className="game-servers-stat-text">
            <span className="game-servers-stat-label">{t("gameServers.stats.ingame")}</span>
            <strong className="game-servers-stat-value">{roomStats.ingame}</strong>
          </span>
        </article>
      </section>

      <section className="game-servers-status" aria-live="polite">
        {lastUpdatedMessage ? (
          <span className={lastUpdatedMessage.className}>{lastUpdatedMessage.text}</span>
        ) : (
          <span className="muted">{t("gameServers.statusIdle")}</span>
        )}
      </section>

      {showBlockingLoading ? (
        <output className="game-servers-loading" aria-live="polite">
          <span className="game-servers-loading-spinner" aria-hidden="true" />
        </output>
      ) : filteredRooms.length === 0 ? (
        <p className="game-servers-empty muted">{t("gameServers.empty")}</p>
      ) : (
        <>
          <section className="game-servers-room-table-wrap game-servers-desktop-only">
            <table className="game-servers-room-table">
              <thead>
                <tr>
                  <th>{t("gameServers.table.room")}</th>
                  <th>{t("gameServers.table.status")}</th>
                  <th>{t("gameServers.table.players")}</th>
                  <th>{t("gameServers.table.impostors")}</th>
                  <th>{t("gameServers.table.map")}</th>
                  <th>{t("gameServers.table.action")}</th>
                </tr>
              </thead>
              <tbody>
                {filteredRooms.map((room) => {
                  const detailsOpen = openRoomDetails.has(room.key);
                  const roomCode = formatGameId(room.gameId);
                  const showHost = room.hostName !== "-" && room.hostName !== room.trueHostName;
                  return (
                    <Fragment key={room.key}>
                      <tr>
                        <td>
                          <div className="game-servers-room-info-cell">
                            <button
                              type="button"
                              className={`game-servers-detail-toggle${
                                detailsOpen ? " is-open" : ""
                              }`}
                              aria-expanded={detailsOpen}
                              aria-label={t("gameServers.details")}
                              onClick={() => {
                                toggleRoomDetails(room.key);
                              }}
                            >
                              <ChevronIcon />
                            </button>
                            <div className="game-servers-room-info-text">
                              <strong className="game-servers-room-title">
                                {room.trueHostName}
                              </strong>
                              {showHost ? (
                                <span className="game-servers-room-host">
                                  {t("gameServers.hostName", { host: room.hostName })}
                                </span>
                              ) : null}
                              <code className="game-servers-room-code">{roomCode}</code>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span
                            className={`game-servers-room-state-badge ${getStatusClassName(room)}`}
                          >
                            {formatGameState(room.gameState, t)}
                          </span>
                        </td>
                        <td>
                          <div className="game-servers-room-players-cell">
                            <strong>
                              {room.playerCount} / {room.maxPlayers}
                            </strong>
                            {renderProgress(room)}
                          </div>
                        </td>
                        <td>{room.numImpostors ?? t("common.unset")}</td>
                        <td>{renderMapBadge(room)}</td>
                        <td className="game-servers-room-action-cell">
                          {renderActionButtons(room)}
                        </td>
                      </tr>
                      <tr className="game-servers-details-row" hidden={!detailsOpen}>
                        <td colSpan={6}>{renderDetails(room)}</td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </section>

          <section
            className="game-servers-mobile-room-list game-servers-mobile-only"
            aria-live="polite"
          >
            {filteredRooms.map((room) => {
              const roomCode = formatGameId(room.gameId);
              const showHost = room.hostName !== "-" && room.hostName !== room.trueHostName;
              return (
                <article key={room.key} className="game-servers-room-card">
                  <div className="game-servers-room-card-main">
                    <div className="game-servers-room-card-body">
                      <strong className="game-servers-room-title">{room.trueHostName}</strong>
                      {showHost ? (
                        <span className="game-servers-room-host">
                          {t("gameServers.hostName", { host: room.hostName })}
                        </span>
                      ) : null}
                      <div className="game-servers-room-card-meta">
                        <div className="game-servers-room-meta-entry">
                          <span className="game-servers-room-meta-label">
                            {t("gameServers.statusLabel")}
                          </span>
                          <span
                            className={`game-servers-room-state-badge ${getStatusClassName(room)}`}
                          >
                            {formatGameState(room.gameState, t)}
                          </span>
                        </div>
                        <span className="game-servers-room-count">
                          {room.playerCount} / {room.maxPlayers}
                        </span>
                        <span className="game-servers-room-count">
                          {t("gameServers.impostorsShort")}:{" "}
                          {room.numImpostors ?? t("common.unset")}
                        </span>
                      </div>
                      {renderProgress(room)}
                    </div>
                    <div className="game-servers-room-card-side">
                      <div className="game-servers-room-meta-entry">
                        <span className="game-servers-room-meta-label">
                          {t("gameServers.mapShort")}
                        </span>
                        {renderMapBadge(room)}
                      </div>
                      {renderActionButtons(room)}
                    </div>
                  </div>
                  <div className="game-servers-room-code-row">
                    <span>{t("gameServers.roomCodeLabel")}</span>
                    <code className="game-servers-room-code">{roomCode}</code>
                  </div>
                  <details className="game-servers-room-details">
                    <summary>{t("gameServers.details")}</summary>
                    <div className="game-servers-room-details-content">
                      <div className="game-servers-room-details-content-inner">
                        {renderDetails(room)}
                      </div>
                    </div>
                  </details>
                </article>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}
