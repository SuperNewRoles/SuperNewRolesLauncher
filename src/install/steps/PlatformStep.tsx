import { open } from "@tauri-apps/plugin-dialog";
import type { GamePlatform } from "../../app/types";
import type { DetectedPlatform } from "../types";
import type { MessageKey } from "../../i18n";

interface PlatformStepProps {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  detectedPlatforms: DetectedPlatform[];
  onSelect: (path: string, platform: GamePlatform) => void;
  onManualSelect: (path: string) => void;
  onBack: () => void;
  error: string | null;
}

const STEAM_SVG = (
  <svg viewBox="0 0 24 24" width={80} height={80}>
    <path
      fill="currentColor"
      d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"
    />
  </svg>
);

const EPIC_SVG = (
  <svg viewBox="0 0 24 24" width={80} height={80}>
    <path
      fill="currentColor"
      d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
    />
  </svg>
);

export default function PlatformStep({
  t,
  detectedPlatforms,
  onSelect,
  onManualSelect,
  onBack,
  error,
}: PlatformStepProps) {
  const handleManualSelect = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
      });
      if (selected) {
        onManualSelect(selected);
      }
    } catch {
      // user cancelled
    }
  };

  return (
    <div className="install-step install-step-platform">
      <button type="button" className="btn-back" onClick={onBack}>
        ← {t("installFlow.back")}
      </button>
      <h2 className="step-title">{t("installFlow.platformTitle")}</h2>
      <div className="platform-grid">
        {detectedPlatforms
          .filter((p) => p.platform === "steam")
          .map((p) => (
            <button
              key={p.path}
              type="button"
              className="platform-card"
              onClick={() => onSelect(p.path, "steam")}
            >
              <span className="platform-icon">{STEAM_SVG}</span>
              <span className="platform-name">{t("installFlow.platformSteam")}</span>
              <span className="platform-path">{t("installFlow.folderPath")}: {p.path}</span>
            </button>
          ))}
        {detectedPlatforms
          .filter((p) => p.platform === "epic")
          .map((p) => (
            <button
              key={p.path}
              type="button"
              className="platform-card"
              onClick={() => onSelect(p.path, "epic")}
            >
              <span className="platform-icon">{EPIC_SVG}</span>
              <span className="platform-name">{t("installFlow.platformEpic")}</span>
              <span className="platform-path">{t("installFlow.folderPath")}: {p.path}</span>
            </button>
          ))}
      </div>
      <button
        type="button"
        className="btn-manual-select"
        onClick={handleManualSelect}
      >
        📁 {t("installFlow.manualSelect")}
      </button>
      {error && <p className="step-error">{error}</p>}
    </div>
  );
}
