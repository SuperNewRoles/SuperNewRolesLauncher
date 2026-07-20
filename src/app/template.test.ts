import { describe, expect, it } from "vitest";

import { createTranslator } from "../i18n";
import { renderAppTemplate } from "./template";

describe("renderAppTemplate (settings general)", () => {
  const t = createTranslator("ja");
  // 複数テストで同じ HTML を使い回し、検証対象をマークアップ有無に絞る。
  const html = renderAppTemplate("ja", t);

  it("includes new general setting elements", () => {
    expect(html).toContain('id="reselect-among-us-button"');
    expect(html).toContain('id="settings-support-discord-link"');
    expect(html).toContain('id="close-to-tray-on-close"');
    expect(html).toContain('id="create-modded-shortcut"');
    expect(html).toContain('id="settings-general-status"');
    expect(html).toContain('id="settings-shortcut-status"');
    expect(html).toContain('id="custom-dll-load"');
    expect(html).toContain('id="uninstall-snr"');
    expect(html).toContain('id="install-status"');
    expect(html).toContain('id="report-tab-badge"');
    expect(html).toContain('id="announce-tab-badge"');
    expect(html).toContain('id="tab-announce"');
    expect(html).toContain('id="announce-center-root"');
    expect(html).toContain('data-tab="announce"');
    expect(html).toContain('id="tab-servers"');
    expect(html).toContain('id="game-servers-root"');
    expect(html).toContain('data-tab="servers"');
  });

  it("renders tab order as preset, announce, home, matchmaking, report, settings", () => {
    const document = new DOMParser().parseFromString(html, "text/html");
    const tabBarItems = Array.from(document.querySelectorAll(".tab-bar .tab-bar-item"));
    const tabOrder = tabBarItems.map((item) => item.getAttribute("data-tab"));

    expect(tabOrder).toEqual(["preset", "announce", "home", "servers", "report", "settings"]);
  });

  it("places the custom DLL card between shortcut and uninstall", () => {
    const document = new DOMParser().parseFromString(html, "text/html");
    const cards = Array.from(
      document.querySelectorAll("#settings-panel-general .settings-general-layout > .card"),
    );
    const shortcutCard = document.querySelector("#create-modded-shortcut")?.closest(".card");
    const customDllCard = document.querySelector("#custom-dll-load")?.closest(".card");
    const uninstallCard = document.querySelector("#uninstall-snr")?.closest(".card");

    expect(shortcutCard).not.toBeNull();
    expect(customDllCard).not.toBeNull();
    expect(uninstallCard).not.toBeNull();
    expect(cards.indexOf(customDllCard as Element)).toBe(
      cards.indexOf(shortcutCard as Element) + 1,
    );
    expect(cards.indexOf(uninstallCard as Element)).toBe(
      cards.indexOf(customDllCard as Element) + 1,
    );
  });

  it("includes an accessible custom DLL loading overlay", () => {
    const document = new DOMParser().parseFromString(html, "text/html");
    const overlay = document.querySelector<HTMLElement>("#settings-custom-dll-overlay");
    const dialog = overlay?.querySelector<HTMLElement>("[role='dialog']");

    expect(overlay?.hidden).toBe(true);
    expect(overlay?.getAttribute("aria-hidden")).toBe("true");
    expect(dialog?.getAttribute("aria-modal")).toBe("true");
    expect(dialog?.getAttribute("aria-labelledby")).toBe("settings-custom-dll-overlay-title");
    expect(document.querySelector("#settings-custom-dll-overlay-title")?.textContent).not.toBe("");

    for (const id of [
      "settings-custom-dll-overlay-backdrop",
      "settings-custom-dll-close",
      "settings-custom-dll-step-warning",
      "settings-custom-dll-selection",
      "settings-custom-dll-selected-path",
      "settings-custom-dll-reselect",
      "settings-custom-dll-disable-auto-update",
      "settings-custom-dll-error",
      "settings-custom-dll-cancel",
      "settings-custom-dll-next",
      "settings-custom-dll-step-processing",
      "settings-custom-dll-processing-message",
      "settings-custom-dll-step-result",
      "settings-custom-dll-result-title",
      "settings-custom-dll-result-message",
      "settings-custom-dll-result-close",
    ]) {
      expect(document.getElementById(id), `missing #${id}`).not.toBeNull();
    }

    expect(document.querySelector(".settings-custom-dll-warning-list")?.children).toHaveLength(5);
    expect(document.querySelector<HTMLElement>("#settings-custom-dll-selection")?.hidden).toBe(
      true,
    );
    expect(document.querySelector("#settings-custom-dll-selected-path")?.textContent).toBe("");
    expect(
      document.querySelector<HTMLInputElement>("#settings-custom-dll-disable-auto-update")?.checked,
    ).toBe(true);
    expect(document.querySelector("#settings-custom-dll-error")?.getAttribute("aria-live")).toBe(
      "assertive",
    );
    expect(document.querySelector<HTMLElement>("#settings-custom-dll-error")?.hidden).toBe(true);
    expect(
      document.querySelector<HTMLElement>("#settings-custom-dll-step-processing")?.hidden,
    ).toBe(true);
    expect(document.querySelector<HTMLElement>("#settings-custom-dll-step-result")?.hidden).toBe(
      true,
    );
    expect(
      document.querySelector("#settings-custom-dll-close")?.getAttribute("aria-label"),
    ).not.toBe("");
    expect(
      document.querySelector("label[for='settings-custom-dll-disable-auto-update']"),
    ).not.toBeNull();
  });

  it("includes among us reselect and uninstall overlays", () => {
    expect(html).toContain('id="settings-among-us-overlay"');
    expect(html).toContain('id="settings-among-us-candidate-list"');
    expect(html).toContain('id="settings-uninstall-confirm-overlay"');
    expect(html).toContain('id="settings-uninstall-confirm-accept"');
    expect(html).toContain('id="settings-elevation-confirm-overlay"');
    expect(html).toContain('id="settings-elevation-confirm-accept"');
    expect(html).toContain('id="settings-steam-warning-overlay"');
    expect(html).toContain('id="settings-steam-warning-dismiss"');
    expect(html).toContain('id="settings-steam-warning-continue"');
  });

  it("keeps settings overlays outside the settings tab container", () => {
    const document = new DOMParser().parseFromString(html, "text/html");
    const settingsTab = document.querySelector("#tab-settings");
    const mainContent = document.querySelector(".main-content");

    expect(settingsTab).not.toBeNull();
    expect(mainContent).not.toBeNull();

    // オーバーレイがタブ内部に入ると z-index とフォーカス制御が崩れるため位置を固定で検証する。
    for (const id of [
      "settings-among-us-overlay",
      "settings-custom-dll-overlay",
      "settings-uninstall-confirm-overlay",
      "settings-elevation-confirm-overlay",
      "settings-steam-warning-overlay",
      "settings-migration-overlay",
    ]) {
      const overlay = document.getElementById(id);
      expect(overlay).not.toBeNull();
      expect(settingsTab?.contains(overlay as Node)).toBe(false);
      expect(mainContent?.contains(overlay as Node)).toBe(true);
    }
  });

  it("includes redesigned migration controls and overlay", () => {
    expect(html).toContain('id="migration-export"');
    expect(html).toContain('id="migration-import"');
    expect(html).toContain('id="settings-migration-overlay"');
    expect(html).toContain('id="settings-migration-step-select"');
    expect(html).toContain('id="settings-migration-step-password"');
    expect(html).toContain('id="settings-migration-step-processing"');
    expect(html).toContain('id="settings-migration-step-result"');
    expect(html).toContain('id="settings-migration-result-close"');
  });

  it("includes redesigned preset split layout with fullscreen overlay", () => {
    expect(html).toContain('id="preset-open-import"');
    expect(html).toContain('id="preset-open-export"');
    expect(html).toContain('id="preset-overlay"');
    expect(html).toContain('id="preset-overlay-import-screen"');
    expect(html).toContain('id="preset-overlay-export-screen"');
    expect(html).toContain('id="preset-import"');
    expect(html).toContain('id="preset-export"');
    expect(html).toContain('id="preset-refresh"');
    expect(html).toContain('id="preset-local-list"');
    expect(html).toContain('id="preset-archive-list"');
    expect(html).toContain('id="preset-feedback-overlay"');
    expect(html).toContain('id="preset-feedback-title"');
    expect(html).toContain('id="preset-feedback-message"');
    expect(html).toContain('id="preset-feedback-primary"');
    expect(html).toContain('id="preset-feedback-secondary"');
    expect(html).toContain('class="preset-remake-launch-grid"');
    expect(html).not.toContain('id="preset-export-path"');
    expect(html).not.toContain('id="preset-import-path"');
    expect(html).not.toContain('id="preset-inspect"');
  });

  it("does not include removed legacy migration controls", () => {
    expect(html).not.toContain('id="migration-encryption-enabled"');
    expect(html).not.toContain('id="migration-export-password"');
    expect(html).not.toContain('id="migration-import-path"');
    expect(html).not.toContain('id="migration-import-password"');
    expect(html).not.toContain('id="settings-migration-overlay-description"');
    expect(html).not.toContain('id="settings-migration-step-password-back"');
  });

  it("does not include removed legacy general controls", () => {
    expect(html).not.toContain('id="among-us-path"');
    expect(html).not.toContain('id="save-among-us-path"');
    expect(html).not.toContain('id="detect-among-us-path"');
    expect(html).not.toContain('id="platform-select"');
    expect(html).not.toContain('id="release-select"');
    expect(html).not.toContain('id="refresh-releases"');
    expect(html).not.toContain('id="install-snr"');
    expect(html).not.toContain('id="install-restore-save-data"');
    expect(html).not.toContain('id="uninstall-preserve-save-data"');
    expect(html).not.toContain('id="install-progress"');
    expect(html).not.toContain('id="profile-path"');
  });
});
