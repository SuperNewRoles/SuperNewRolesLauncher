import {
  ANNOUNCE_API_BASE_URL as MOD_CONFIG_ANNOUNCE_API_BASE_URL,
  OFFICIAL_LINKS as MOD_CONFIG_OFFICIAL_LINKS,
} from "./modConfig";
import type { OfficialLink } from "./types";

/**
 * 機能全体で共有する定数。
 * 複数ファイルから参照されるため、ここに集約して変更点を追いやすくする。
 */
export const REPORTING_NOTIFICATION_STORAGE_KEY = "reporting.notification.enabled";
// アナウンスAPIの実体は mod.config から受け取り、参照名だけをこの層で固定する。
export const ANNOUNCE_API_BASE_URL = MOD_CONFIG_ANNOUNCE_API_BASE_URL;
// 既読管理キーは用途別に prefix を分け、将来キー追加時の衝突を避ける。
export const ANNOUNCE_BADGE_READ_CREATED_AT_STORAGE_KEY = "announce.badge.readCreatedAt";

// UI表示側で使う公式リンク定義を、設定値からそのまま公開する。
export const OFFICIAL_LINKS: OfficialLink[] = MOD_CONFIG_OFFICIAL_LINKS;
