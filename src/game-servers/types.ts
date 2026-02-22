export interface GameServerRoomRaw {
  IP?: number | string;
  Port?: number | string;
  GameId?: number | string;
  PlayerCount?: number | string;
  HostName?: string;
  TrueHostName?: string;
  HostPlatformName?: string;
  Platform?: string;
  QuickChat?: number | string;
  Age?: number | string;
  MaxPlayers?: number | string;
  NumImpostors?: number | string;
  MapId?: string;
  Language?: string;
  GameState?: number | string;
  MatchmakerIP?: string;
  MatchmakerIp?: string;
  MatchmakerHost?: string;
  MatchmakerPort?: number | string;
  MatchmakerPortNumber?: number | string;
  MatchmakerPortString?: number | string;
  MatchmakerPortValue?: number | string;
}

export interface GameServerRoomsApiResponse {
  games?: GameServerRoomRaw[];
  metadata?: {
    allGamesCount?: number;
    matchingGamesCount?: number;
  };
}

export interface GameServerRoom {
  key: string;
  ipNumber: number;
  ipBigEndian: string;
  ipLittleEndian: string;
  port: number;
  gameId: number;
  hostName: string;
  trueHostName: string;
  hostPlatformName: string;
  platform: string;
  quickChat: number | null;
  ageSeconds: number | null;
  maxPlayers: number;
  playerCount: number;
  numImpostors: number | null;
  mapId: string;
  language: string;
  gameState: number | null;
  matchmakerIp: string | null;
  matchmakerPort: string | null;
}

export interface GameServerRoomsSnapshot {
  serverId: string;
  rooms: GameServerRoom[];
  totalRooms: number;
  publicRooms: number;
  fetchedAt: number;
}
