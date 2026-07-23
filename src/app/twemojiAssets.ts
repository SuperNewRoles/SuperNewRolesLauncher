import twemoji from "twemoji";

/** Twemoji CDN のバージョン。表示崩れ防止のため固定する。 */
export const TWEMOJI_VERSION = "14.0.2";

const TWEMOJI_SVG_BASE = `https://cdn.jsdelivr.net/gh/twitter/twemoji@${TWEMOJI_VERSION}/assets/svg`;

function toTwemojiIconId(emoji: string): string {
  // Twemoji 本体と同じく、ZWJ を含まない場合は variation selector を除去する。
  const normalized = emoji.includes("\u200d") ? emoji : emoji.replace(/\uFE0F/g, "");
  return twemoji.convert.toCodePoint(normalized);
}

/** 絵文字文字列から Twemoji SVG の URL を生成する。 */
export function getTwemojiSvgUrl(emoji: string): string {
  return `${TWEMOJI_SVG_BASE}/${toTwemojiIconId(emoji)}.svg`;
}
