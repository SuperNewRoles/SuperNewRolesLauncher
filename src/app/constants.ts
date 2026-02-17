import { SOCIAL_ICON_SPECS } from "./socialBrandIcons";
import type { OfficialLink } from "./types";

/**
 * 機能全体で共有する定数。
 * 複数ファイルから参照されるため、ここに集約して変更点を追いやすくする。
 */
export const REPORTING_NOTIFICATION_STORAGE_KEY = "reporting.notification.enabled";
export const ANNOUNCE_API_BASE_URL = "https://announce.supernewroles.com/api/v1/";
export const ANNOUNCE_BADGE_READ_CREATED_AT_STORAGE_KEY = "announce.badge.readCreatedAt";

export const OFFICIAL_LINKS: OfficialLink[] = [
  {
    label: "FANBOX",
    url: "https://supernewroles.fanbox.cc",
    backgroundColor: "#06A6F2",
    icon: SOCIAL_ICON_SPECS.fanbox,
  },
  {
    label: "Discord",
    url: "https://discord.gg/Cqfwx82ynN",
    backgroundColor: "#5865F2",
    icon: SOCIAL_ICON_SPECS.discord,
  },
  {
    label: "YouTube",
    url: "https://www.youtube.com/@SuperNewRoles",
    backgroundColor: "#FF0000",
    icon: SOCIAL_ICON_SPECS.youtube,
  },
  {
    label: "GitHub",
    url: "https://github.com/SuperNewRoles/SuperNewRoles",
    backgroundColor: "#24292F",
    icon: SOCIAL_ICON_SPECS.github,
  },
  {
    label: "X (Twitter)",
    url: "https://supernewroles.com/twitter",
    backgroundColor: "#000000",
    icon: SOCIAL_ICON_SPECS.x,
  },
];
