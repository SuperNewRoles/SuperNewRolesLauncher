import { getTwemojiSvgUrl } from "./twemojiAssets";

interface TwemojiProps {
  emoji: string;
  className?: string;
}

/** オンボーディング向け Twemoji 画像。 */
export function Twemoji({ emoji, className }: TwemojiProps) {
  return (
    <img
      className={className ? `twemoji ${className}` : "twemoji"}
      src={getTwemojiSvgUrl(emoji)}
      alt=""
      aria-hidden="true"
      draggable={false}
      decoding="async"
    />
  );
}
