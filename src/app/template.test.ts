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
  });

  it("includes among us reselect and uninstall overlays", () => {
    expect(html).toContain('id="settings-among-us-overlay"');
    expect(html).toContain('id="settings-among-us-candidate-list"');
    expect(html).toContain('id="settings-uninstall-confirm-overlay"');
    expect(html).toContain('id="settings-uninstall-confirm-accept"');
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
