import type { SnrReleaseSummary } from "../../app/types";
import type { MessageKey } from "../../i18n";

interface VersionStepProps {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  releases: SnrReleaseSummary[];
  selectedTag: string;
  onSelect: (tag: string) => void;
  onBack: () => void;
}

function formatDate(value: string): string {
  if (!value) return "-";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

export default function VersionStep({
  t,
  releases,
  selectedTag,
  onSelect,
  onBack,
}: VersionStepProps) {
  const latest = releases[0];

  return (
    <div className="install-step install-step-version">
      <button type="button" className="btn-back" onClick={onBack}>
        ← {t("installFlow.back")}
      </button>
      <h2 className="step-title">{t("installFlow.versionTitle")}</h2>
      <div className="version-options">
        {latest && (
          <button
            type="button"
            className={`version-card version-latest ${selectedTag === latest.tag ? "selected" : ""}`}
            onClick={() => onSelect(latest.tag)}
          >
            <span className="version-label">{t("installFlow.versionLatest")}</span>
            <span className="version-tag">{latest.tag}</span>
          </button>
        )}
        <div className="version-custom-area">
          <label className="version-custom-label">
            {t("installFlow.versionCustom")}
          </label>
          <select
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
    </div>
  );
}
