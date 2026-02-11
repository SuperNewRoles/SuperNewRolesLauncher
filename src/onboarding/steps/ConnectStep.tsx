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

function FanboxIcon() {
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <path
        d="M10 10C8 8 6 8 4.5 9.5C4.1 9.9 4.3 10.7 4.9 11C6.6 12 8.6 12.1 10.3 11.5C8.7 13.6 8.1 16 8.1 18.6V22.2C8.1 24.8 10.1 26.9 12.8 27.7C13.4 29 14.7 29.8 16 29.8C17.3 29.8 18.6 29 19.2 27.7C21.9 26.9 23.9 24.8 23.9 22.2V18.6C23.9 16 23.3 13.6 21.7 11.5C23.4 12.1 25.4 12 27.1 11C27.7 10.7 27.9 9.9 27.5 9.5C26 8 24 8 22 10C20.6 7 18.6 5.5 16 5.5C13.4 5.5 11.4 7 10 10Z"
        fill="#ffffff"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M12 8L7 6.5L8 3.8L13 5.6Z"
        fill="#ffffff"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M20 8L25 6.5L24 3.8L19 5.6Z"
        fill="#ffffff"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <path
        d="M11 20.5C9 21.5 8.3 23.5 8.7 25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M21 20.5C23 21.5 23.7 23.5 23.3 25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M13 14L11.4 15L13 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19 14L20.6 15L19 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14.7 18.4C14.7 19.6 15.6 20.3 16.6 20.3C17.6 20.3 18.5 19.6 18.5 18.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M16.6 20.3V21.4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
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
  const handleFanbox = () => openUrl("https://supernewroles.fanbox.cc/");

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
          <button type="button" className="connect-btn btn-fanbox" onClick={handleFanbox}>
            <span className="icon" aria-hidden="true">
              <FanboxIcon />
            </span>
            <span className="label">pixiv FANBOX</span>
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
