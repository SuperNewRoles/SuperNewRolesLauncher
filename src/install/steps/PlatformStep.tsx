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

export const STEAM_SVG = (
  <svg viewBox="0 0 24 24" width={80} height={80} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" />
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
  </svg>
);

export const EPIC_SVG = (
  <svg viewBox="0 0 24 24" width={80} height={80} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
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
