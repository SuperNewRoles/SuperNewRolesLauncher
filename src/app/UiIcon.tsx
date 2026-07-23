import type { CSSProperties } from "react";
import { getUiIconContent, type UiIconName } from "./uiIcons";

interface UiIconProps {
  name: UiIconName;
  className?: string;
  size?: number | string;
  strokeWidth?: number | string;
  style?: CSSProperties;
}

/** React 向けの共通ストロークアイコン。 */
export function UiIcon({ name, className, size, strokeWidth = 2, style }: UiIconProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={style}
      dangerouslySetInnerHTML={{ __html: getUiIconContent(name) }}
    />
  );
}
