import twemoji from "twemoji";

/** 同梱する Twemoji アセットのバージョン。表示崩れ防止のため固定する。 */
export const TWEMOJI_VERSION = "14.0.2";

const TWEMOJI_SVG_BASE = `${import.meta.env.BASE_URL}twemoji`;
const BUNDLED_TWEMOJI_ICON_IDS = new Set([
  "1f44b",
  "1f680",
  "1f41b",
  "1f4be",
  "1f4e6",
  "1f389",
  "2705",
  "23f3",
  "1f5a5",
]);

function toTwemojiIconId(emoji: string): string {
  // Twemoji 本体と同じく、ZWJ を含まない場合は variation selector を除去する。
  const normalized = emoji.includes("\u200d") ? emoji : emoji.replace(/\uFE0F/g, "");
  return twemoji.convert.toCodePoint(normalized);
}

/** 絵文字文字列から Twemoji SVG の URL を生成する。 */
export function getTwemojiSvgUrl(emoji: string): string {
  const iconId = toTwemojiIconId(emoji);
  if (!BUNDLED_TWEMOJI_ICON_IDS.has(iconId)) {
    throw new Error(`Twemoji asset is not bundled: ${iconId}`);
  }
  return `${TWEMOJI_SVG_BASE}/${iconId}.svg`;
}
