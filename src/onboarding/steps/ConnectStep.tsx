import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { launchShortcutCreate } from "../../app/services/tauriClient";
import { OnboardingLayout } from "../OnboardingLayout";
import type { OnboardingStepProps } from "../types";

function DiscordIcon() {
  return (
    <svg viewBox="0 0 127.14 96.36" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M107.7 8.07A105.15 105.15 0 0 0 81.47 0a72.06 72.06 0 0 0-3.36 6.83A97.68 97.68 0 0 0 49 6.83 72.37 72.37 0 0 0 45.64 0 105.89 105.89 0 0 0 19.39 8.09C2.79 33.65-1.71 58.58.54 83.15a105.73 105.73 0 0 0 32.17 16.24 77.7 77.7 0 0 0 6.89-11.31 68.42 68.42 0 0 1-10.84-5.18c.91-.66 1.79-1.35 2.64-2.08a75.11 75.11 0 0 0 64.32 0c.86.73 1.74 1.43 2.64 2.08a68.68 68.68 0 0 1-10.86 5.19 77 77 0 0 0 6.9 11.3 105.25 105.25 0 0 0 32.19-16.24c2.64-28.47-4.5-53.17-18.89-75.08ZM42.45 65.69C36.18 65.69 31 59.95 31 52.88s5.05-12.8 11.45-12.8S54 45.82 53.89 52.88c0 7.07-5.04 12.81-11.44 12.81Zm42.24 0c-6.27 0-11.44-5.74-11.44-12.81s5.04-12.8 11.44-12.8S96.2 45.82 96.14 52.88c0 7.07-5.04 12.81-11.45 12.81Z"
      />
    </svg>
  );
}

function XIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M18.901 1.153h3.68L14.54 10.34 24 22.846h-7.406l-5.8-7.584-6.62 7.584H.49l8.6-9.85L0 1.154h7.594l5.243 6.932 6.064-6.932Zm-1.29 19.49h2.039L6.486 3.25H4.298l13.313 17.394Z"
      />
    </svg>
  );
}

export function ConnectStep({ t, onNext, onBack }: OnboardingStepProps) {
  const [shortcutStatus, setShortcutStatus] = useState<"idle" | "creating" | "created" | "error">(
    "idle",
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [nextDisabled, setNextDisabled] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setNextDisabled(false);
    }, 500);
    return () => clearTimeout(timer);
  }, []);

  const handleDiscord = () => openUrl("https://supernewroles.com/discord");
  const handleTwitter = () => openUrl("https://supernewroles.com/twitter");

  const handleShortcut = async () => {
    try {
      setShortcutStatus("creating");
      setErrorMessage(null);
      await launchShortcutCreate();
      setShortcutStatus("created");
    } catch (e) {
      setShortcutStatus("error");
      setErrorMessage(String(e));
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
        <div className="connect-buttons-grid">
          <button type="button" className="connect-btn btn-discord" onClick={handleDiscord}>
            <span className="icon" aria-hidden="true">
              <DiscordIcon />
            </span>
            <span className="label">Discord</span>
          </button>
          <button type="button" className="connect-btn btn-twitter" onClick={handleTwitter}>
            <span className="icon" aria-hidden="true">
              <XIcon />
            </span>
            <span className="label">X (Twitter)</span>
          </button>
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
                ? "Creating..."
                : shortcutStatus === "created"
                  ? t("onboarding.connect.shortcutCreated")
                  : t("onboarding.connect.shortcut")}
            </span>
          </button>
        </div>
        {shortcutStatus === "created" && (
          <div className="status-line success">{t("onboarding.connect.shortcutCreated")}</div>
        )}
        {shortcutStatus === "error" && errorMessage && (
          <div className="status-line error">{errorMessage}</div>
        )}
      </div>
    </OnboardingLayout>
  );
}
