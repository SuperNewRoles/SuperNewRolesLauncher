import { describe, expect, it } from "vitest";

import { createTranslator } from "../i18n";
import { renderAppTemplate } from "./template";

describe("renderAppTemplate (settings general)", () => {
  const t = createTranslator("ja");
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
  });

  it("includes among us reselect and uninstall overlays", () => {
    expect(html).toContain('id="settings-among-us-overlay"');
    expect(html).toContain('id="settings-among-us-candidate-list"');
    expect(html).toContain('id="settings-uninstall-confirm-overlay"');
    expect(html).toContain('id="settings-uninstall-confirm-accept"');
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
    expect(html).toContain('id="preset-inspect"');
    expect(html).toContain('id="preset-refresh"');
    expect(html).toContain('id="preset-local-list"');
    expect(html).toContain('id="preset-archive-list"');
    expect(html).toContain('class="preset-remake-launch-grid"');
    expect(html).not.toContain('id="preset-export-path"');
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
