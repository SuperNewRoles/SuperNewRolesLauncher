import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import { EPIC_ICON_PATH, STEAM_ICON_PATH } from "../../app/platformIconPaths";
import { getPlatformLabelKey, normalizePlatformCandidates } from "../../app/platformSelection";
import { finderDetectPlatform } from "../../app/services/tauriClient";
import type { GamePlatform } from "../../app/types";
import type { MessageKey } from "../../i18n";
import type { DetectedPlatform } from "../types";

interface PlatformStepProps {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  detectedPlatforms: DetectedPlatform[];
  onSelect: (path: string, platform: GamePlatform) => void;
  onManualSelect: (path: string, platform: GamePlatform) => void;
  onBack: () => void;
  error: string | null;
}

export const STEAM_SVG = (
  <svg viewBox="0 0 24 24" width={80} height={80} fill="currentColor" role="img" aria-label="Steam">
    <path d={STEAM_ICON_PATH} />
  </svg>
);

export const EPIC_SVG = (
  <svg viewBox="0 0 24 24" width={80} height={80} fill="currentColor" role="img" aria-label="Epic">
    <path d={EPIC_ICON_PATH} />
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
  const [localError, setLocalError] = useState<string | null>(null);
  const candidates = normalizePlatformCandidates(detectedPlatforms);

  const handleManualSelect = async () => {
    let selectedPath: string | string[] | null;
    try {
      selectedPath = await open({
        directory: true,
        multiple: false,
      });
    } catch (error) {
      console.error("Failed to open folder picker:", error);
      return;
    }

    if (!selectedPath || Array.isArray(selectedPath)) {
      // User cancelled the picker.
      return;
    }

    try {
      const detectedPlatform = await finderDetectPlatform(selectedPath);
      setLocalError(null);
      onManualSelect(selectedPath, detectedPlatform);
    } catch {
      setLocalError(t("installFlow.invalidAmongUsFolder"));
    }
  };

  return (
    <div className="install-step install-step-platform">
      <button type="button" className="btn-back" onClick={onBack}>
        ← {t("installFlow.back")}
      </button>
      <h2 className="step-title">{t("installFlow.platformTitle")}</h2>
      <div className="platform-grid">
        {candidates.map((candidate) => (
          <button
            key={`${candidate.platform}:${candidate.path}`}
            type="button"
            className="platform-card"
            onClick={() => onSelect(candidate.path, candidate.platform)}
          >
            <span className="platform-icon">
              {candidate.platform === "steam" ? STEAM_SVG : EPIC_SVG}
            </span>
            <span className="platform-name">{t(getPlatformLabelKey(candidate.platform))}</span>
            <span className="platform-path">
              {t("installFlow.folderPath")}: {candidate.path}
            </span>
          </button>
        ))}
      </div>
      <button type="button" className="btn-manual-select" onClick={handleManualSelect}>
        📁 {t("installFlow.manualSelect")}
      </button>
      {(error || localError) && (
        <p className="step-error" style={{ textAlign: "center" }}>
          {localError || error}
        </p>
      )}
    </div>
  );
}
