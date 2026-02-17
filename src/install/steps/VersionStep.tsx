import type { GamePlatform, SnrReleaseSummary } from "../../app/types";
import { MOD_DISPLAY_NAME } from "../../app/modConfig";
import type { MessageKey } from "../../i18n";
import { EPIC_SVG, STEAM_SVG } from "./PlatformStep";

interface VersionStepProps {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  releases: SnrReleaseSummary[];
  releasesLoading: boolean;
  releasesError: string | null;
  selectedTag: string;
  onSelect: (tag: string) => void;
  onRetryFetchReleases: () => void;
  onBack: () => void;
  platform: GamePlatform | null;
}

function formatDate(value: string): string {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export default function VersionStep({
  t,
  releases,
  releasesLoading,
  releasesError,
  selectedTag,
  onSelect,
  onRetryFetchReleases,
  onBack,
  platform,
}: VersionStepProps) {
  const latest = releases[0];
  const hasReleaseOptions = releases.length > 0;
  const showLoadingState = releasesLoading && !hasReleaseOptions;
  const showErrorState = !releasesLoading && Boolean(releasesError) && !hasReleaseOptions;
  const showEmptyState = !releasesLoading && !releasesError && !hasReleaseOptions;

  const platformName =
    platform === "steam"
      ? t("installFlow.platformSteam")
      : platform === "epic"
        ? t("installFlow.platformEpic")
        : "";

  const platformIcon =
    platform === "steam" ? (
      <span className="version-platform-icon steam">{STEAM_SVG}</span>
    ) : platform === "epic" ? (
      <span className="version-platform-icon epic">{EPIC_SVG}</span>
    ) : null;

  return (
    <div className="install-step install-step-version">
      <button type="button" className="btn-back" onClick={onBack}>
        ← {t("installFlow.back")}
      </button>
      <div className="version-header">
        {platformIcon}
        <h2 className="step-title">{t("installFlow.versionTitle")}</h2>
      </div>
      {showLoadingState || showErrorState || showEmptyState ? (
        <div className="version-status-panel">
          {showLoadingState && (
            <>
              <div className="spinner version-status-spinner" aria-hidden="true" />
              <p className="version-status-text">{t("installFlow.versionLoading")}</p>
            </>
          )}
          {showErrorState && (
            <>
              <p className="version-status-text version-status-error">
                {t("releases.failed", { error: releasesError ?? "" })}
              </p>
              <button
                type="button"
                className="btn-manual-select version-retry-button"
                onClick={onRetryFetchReleases}
              >
                {t("common.retry")}
              </button>
            </>
          )}
          {showEmptyState && (
            <>
              <p className="version-status-text">{t("releases.none")}</p>
              <button
                type="button"
                className="btn-manual-select version-retry-button"
                onClick={onRetryFetchReleases}
              >
                {t("common.retry")}
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="version-options">
          {latest && (
            <button
              type="button"
              className={`version-card version-latest ${selectedTag === latest.tag ? "selected" : ""}`}
              onClick={() => onSelect(latest.tag)}
            >
              <span className="version-label">{t("installFlow.versionLatest")}</span>
              <span className="version-tag">
                {MOD_DISPLAY_NAME} v{latest.tag}
              </span>
            </button>
          )}
          <div className="version-custom-area">
            <label className="version-custom-label" htmlFor="release-tag-select">
              {t("installFlow.versionCustom")}
            </label>
            <select
              id="release-tag-select"
              className="version-select"
              value={selectedTag}
              onChange={(e) => onSelect(e.target.value)}
            >
              {releases.map((r) => (
                <option key={r.tag} value={r.tag}>
                  {t("releases.optionText", {
                    tag: r.tag,
                    name: r.name || t("releases.noTitle"),
                    date: formatDate(r.publishedAt),
                  })}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
