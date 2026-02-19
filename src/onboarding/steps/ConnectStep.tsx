import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { modConfig } from "../../app/modConfig";
import { launchShortcutCreate } from "../../app/services/tauriClient";
import { SOCIAL_ICON_SPECS } from "../../app/socialBrandIcons";
import type { SocialIcon } from "../../app/types";
import { OnboardingLayout } from "../OnboardingLayout";
import type { OnboardingStepProps } from "../types";

const NEXT_BUTTON_UNLOCK_DELAY_MS = 500;
const FALLBACK_DISCORD_URL = "https://discord.gg/Cqfwx82ynN";
const FALLBACK_TWITTER_URL = "https://supernewroles.com/twitter";
const FALLBACK_FANBOX_URL = "https://supernewroles.fanbox.cc/";

const DISCORD_URL =
  modConfig.links.official.find((link) => link.iconId === "discord")?.url ??
  modConfig.links.supportDiscordUrl ??
  FALLBACK_DISCORD_URL;
const TWITTER_URL =
  modConfig.links.official.find((link) => link.iconId === "x")?.url ?? FALLBACK_TWITTER_URL;
const FANBOX_URL =
  modConfig.links.official.find((link) => link.iconId === "fanbox")?.url ?? FALLBACK_FANBOX_URL;

function formatActionError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const withoutInvokePrefix = raw.replace(/^Error invoking '[^']+':\s*/u, "");
  return (
    withoutInvokePrefix
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "Operation failed"
  );
}

function SocialIconGraphic({ icon }: { icon: SocialIcon }) {
  if (icon.kind === "image") {
    return (
      <img
        src={icon.src}
        alt=""
        aria-hidden="true"
        className={icon.imageClassName}
        width={40}
        height={40}
        decoding="async"
      />
    );
  }

  return (
    <svg viewBox={icon.viewBox} aria-hidden="true" focusable="false">
      <path fill="currentColor" d={icon.pathD} />
    </svg>
  );
}

export function ConnectStep({ t, onNext, onBack }: OnboardingStepProps) {
  const showConnectLinks = modConfig.features.connectLinks;
  const [shortcutStatus, setShortcutStatus] = useState<"idle" | "creating" | "created" | "error">(
    "idle",
  );
  const [shortcutErrorMessage, setShortcutErrorMessage] = useState<string | null>(null);
  const [nextDisabled, setNextDisabled] = useState(true);

  useEffect(() => {
    // Keep this step visible briefly to avoid accidental immediate skip.
    const timer = window.setTimeout(() => {
      setNextDisabled(false);
    }, NEXT_BUTTON_UNLOCK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  const handleDiscord = () => openUrl(DISCORD_URL);
  const handleTwitter = () => openUrl(TWITTER_URL);
  const handleFanbox = () => openUrl(FANBOX_URL);

  const handleShortcut = async () => {
    try {
      setShortcutStatus("creating");
      setShortcutErrorMessage(null);
      await launchShortcutCreate();
      setShortcutStatus("created");
    } catch (e) {
      setShortcutStatus("error");
      setShortcutErrorMessage(formatActionError(e));
    }
  };

  return (
    <OnboardingLayout
      t={t}
      image={<div className="placeholder-icon">🔗</div>}
      onNext={onNext}
      onBack={onBack}
      nextDisabled={nextDisabled}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "18px", alignItems: "center" }}>
        <p style={{ margin: 0, opacity: 0.85, lineHeight: 1.6 }}>{t("onboarding.connect.body")}</p>
        <div className="connect-buttons-section">
          {showConnectLinks && (
            <div className="connect-buttons-row connect-buttons-row-links">
              <button type="button" className="connect-btn btn-discord" onClick={handleDiscord}>
                <span className="icon" aria-hidden="true">
                  <SocialIconGraphic icon={SOCIAL_ICON_SPECS.discord} />
                </span>
                <span className="label">Discord</span>
              </button>
              <button type="button" className="connect-btn btn-twitter" onClick={handleTwitter}>
                <span className="icon" aria-hidden="true">
                  <SocialIconGraphic icon={SOCIAL_ICON_SPECS.x} />
                </span>
                <span className="label">X (Twitter)</span>
              </button>
              <button type="button" className="connect-btn btn-fanbox" onClick={handleFanbox}>
                <span className="icon" aria-hidden="true">
                  <SocialIconGraphic icon={SOCIAL_ICON_SPECS.fanbox} />
                </span>
                <span className="label">pixiv FANBOX</span>
              </button>
            </div>
          )}
          <div className="connect-buttons-row connect-buttons-row-actions">
            <button
              type="button"
              className={`connect-btn btn-shortcut ${shortcutStatus === "created" ? "success" : ""}`}
              onClick={handleShortcut}
              disabled={shortcutStatus === "creating" || shortcutStatus === "created"}
            >
              <span className="icon">
                {shortcutStatus === "created" ? "✅" : shortcutStatus === "creating" ? "⏳" : "🖥️"}
              </span>
              <span className="label">
                {shortcutStatus === "creating"
                  ? t("onboarding.connect.shortcutCreating")
                  : shortcutStatus === "created"
                    ? t("onboarding.connect.shortcutCreated")
                    : t("onboarding.connect.shortcut")}
              </span>
            </button>
          </div>
        </div>
        {shortcutStatus === "created" && (
          <div className="status-line success" style={{ marginTop: 4 }}>{t("onboarding.connect.shortcutCreated")}</div>
        )}
        {shortcutStatus === "error" && shortcutErrorMessage && (
          <div className="status-line error" style={{ marginTop: 4 }}>{shortcutErrorMessage}</div>
        )}
      </div>
    </OnboardingLayout>
  );
}
