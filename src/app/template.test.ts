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

  it("includes among us reselect and uninstall overlays", () => {
    expect(html).toContain('id="settings-among-us-overlay"');
    expect(html).toContain('id="settings-among-us-candidate-list"');
    expect(html).toContain('id="settings-uninstall-confirm-overlay"');
    expect(html).toContain('id="settings-uninstall-confirm-accept"');
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
      "settings-uninstall-confirm-overlay",
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
