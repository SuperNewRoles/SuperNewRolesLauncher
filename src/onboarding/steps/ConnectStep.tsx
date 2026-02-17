import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { launchShortcutCreate } from "../../app/services/tauriClient";
import { SOCIAL_ICON_SPECS } from "../../app/socialBrandIcons";
import type { SocialIcon } from "../../app/types";
import { OnboardingLayout } from "../OnboardingLayout";
import type { OnboardingStepProps } from "../types";

const NEXT_BUTTON_UNLOCK_DELAY_MS = 500;

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

  const handleDiscord = () => openUrl("https://supernewroles.com/discord");
  const handleTwitter = () => openUrl("https://supernewroles.com/twitter");
  const handleFanbox = () => openUrl("https://supernewroles.fanbox.cc/");

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
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", alignItems: "center" }}>
        <div>{t("onboarding.connect.body")}</div>
        <div className="connect-buttons-section">
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
          <div className="status-line success">{t("onboarding.connect.shortcutCreated")}</div>
        )}
        {shortcutStatus === "error" && shortcutErrorMessage && (
          <div className="status-line error">{shortcutErrorMessage}</div>
        )}
      </div>
    </OnboardingLayout>
  );
}
