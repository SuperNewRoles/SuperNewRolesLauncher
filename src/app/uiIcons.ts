// UI 全体で共有する Lucide 系ストロークアイコン。
// template.ts（HTML文字列）と React の両方から同じパス定義を使う。

export type UiIconName =
  | "package"
  | "megaphone"
  | "home"
  | "globe"
  | "messages-square"
  | "file-text"
  | "settings"
  | "folder"
  | "download"
  | "upload"
  | "lock"
  | "alert-triangle"
  | "check"
  | "check-circle"
  | "suitcase"
  | "bug"
  | "help-circle"
  | "lightbulb"
  | "heart"
  | "party-popper"
  | "hard-drive"
  | "monitor"
  | "loader"
  | "maximize"
  | "minimize"
  | "arrow-right"
  | "arrow-left"
  | "alert-circle"
  | "rocket"
  | "hand"
  | "sparkles";

type IconContent = string;

export type UiIconElementTag = "circle" | "path" | "polyline" | "rect";

export interface UiIconElement {
  tag: UiIconElementTag;
  attributes: Readonly<Record<string, string>>;
}

const ICON_ELEMENT_PATTERN = /<(circle|path|polyline|rect)\s+([^>]+)\/>/gu;
const ICON_ATTRIBUTE_PATTERN = /([a-z][a-z0-9-]*)="([^"]*)"/gu;

const UI_ICON_CONTENTS: Record<UiIconName, IconContent> = {
  package:
    '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><polyline points="3.29 7 12 12 20.71 7"/><path d="m7.5 4.27 9 5.15"/>',
  megaphone: '<path d="m3 11 19-7-7 19"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  home: '<path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8"/><path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  globe:
    '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  "messages-square":
    '<path d="M14 9a2 2 0 0 1-2 2H6l-4 4V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2z"/><path d="M18 9h2a2 2 0 0 1 2 2v11l-4-4h-6a2 2 0 0 1-2-2v-1"/>',
  "file-text":
    '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  settings:
    '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915"/><circle cx="12" cy="12" r="3"/>',
  folder:
    '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/>',
  download:
    '<path d="M12 15V3"/><path d="m7 10 5 5 5-5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
  upload:
    '<path d="M12 3v12"/><path d="m17 8-5-5-5 5"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>',
  lock: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  "alert-triangle":
    '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  "check-circle": '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  suitcase:
    '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><rect width="20" height="14" x="2" y="6" rx="2"/><path d="M2 13h20"/><path d="M10 11v4"/><path d="M14 11v4"/>',
  bug: '<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
  "help-circle":
    '<circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  lightbulb:
    '<path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/>',
  heart:
    '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  "party-popper":
    '<path d="M5.8 11.3 2 22l10.7-3.79"/><path d="M4 3h.01"/><path d="M22 8h.01"/><path d="M15 2h.01"/><path d="M22 20h.01"/><path d="m22 2-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.01c-.86 0-1.6.6-1.57 1.5.02.9-.6 1.6-1.5 1.6h-.01c-.9 0-1.6.6-1.57 1.5.02.9-.68 1.62-1.58 1.62h-.01a1.54 1.54 0 0 0-1.48 1.06l-.22.66"/><path d="M11 10.5a2.5 2.5 0 0 0 2.5-2.5"/>',
  "hard-drive":
    '<path d="M22 12H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/><path d="M6 16h.01"/><path d="M10 16h.01"/>',
  monitor:
    '<rect width="20" height="14" x="2" y="3" rx="2"/><path d="M8 21h8"/><path d="M12 17v4"/>',
  loader: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  maximize: '<path d="M15 3h6v6"/><path d="m21 3-7 7"/><path d="m3 21 7-7"/><path d="M9 21H3v-6"/>',
  minimize:
    '<path d="m14 10 7-7"/><path d="M20 10h-6V4"/><path d="m3 21 7-7"/><path d="M4 14h6v6"/>',
  "arrow-right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
  "arrow-left": '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
  "alert-circle": '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  rocket:
    '<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>',
  hand: '<path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2"/><path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8"/><path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-4a8 8 0 0 1-6-2.3l-.1-.1a3.37 3.37 0 0 1-.1-4.5l.2-.2a2 2 0 0 1 2.8 0L7 15"/>',
  sparkles:
    '<path d="M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z"/><path d="M20 3v4"/><path d="M22 5h-4"/><path d="M4 17v2"/><path d="M5 18H3"/>',
};

export interface UiIconHtmlOptions {
  className?: string;
  size?: number | string;
  strokeWidth?: number | string;
}

/** template.ts など HTML 文字列向けの SVG を生成する。 */
export function uiIconHtml(name: UiIconName, options: UiIconHtmlOptions = {}): string {
  const { className, size, strokeWidth = 2 } = options;
  const sizeAttr = size === undefined ? "" : ` width="${String(size)}" height="${String(size)}"`;
  const classAttr = className ? ` class="${className}"` : "";
  return `<svg${classAttr} viewBox="0 0 24 24"${sizeAttr} fill="none" stroke="currentColor" stroke-width="${String(strokeWidth)}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${UI_ICON_CONTENTS[name]}</svg>`;
}

export function getUiIconContent(name: UiIconName): string {
  return UI_ICON_CONTENTS[name];
}

function parseUiIconElements(content: IconContent): readonly UiIconElement[] {
  return Array.from(content.matchAll(ICON_ELEMENT_PATTERN), (elementMatch) => {
    const attributes = Object.fromEntries(
      Array.from(elementMatch[2].matchAll(ICON_ATTRIBUTE_PATTERN), (attributeMatch) => [
        attributeMatch[1],
        attributeMatch[2],
      ]),
    );
    return {
      tag: elementMatch[1] as UiIconElementTag,
      attributes,
    };
  });
}

const UI_ICON_ELEMENTS = Object.fromEntries(
  Object.entries(UI_ICON_CONTENTS).map(([name, content]) => [name, parseUiIconElements(content)]),
) as Record<UiIconName, readonly UiIconElement[]>;

export function getUiIconElements(name: UiIconName): readonly UiIconElement[] {
  return UI_ICON_ELEMENTS[name];
}

/** 報告センター共通アイコン名（ホーム導線とタブで揃える）。 */
export const REPORT_CENTER_ICON: UiIconName = "messages-square";
