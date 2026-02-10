import type { GamePlatform } from "../../app/types";
import type { MessageKey } from "../../i18n";

interface ConfirmStepProps {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  platform: GamePlatform | null;
  amongUsPath: string;
  releaseTag: string;
  restoreSaveData: boolean;
  onRestoreChange: (value: boolean) => void;
  onInstall: () => void;
  onBack: () => void;
  error: string | null;
}

export default function ConfirmStep({
  t,
  platform,
  amongUsPath,
  releaseTag,
  restoreSaveData,
  onRestoreChange,
  onInstall,
  onBack,
  error,
}: ConfirmStepProps) {
  const platformLabel =
    platform === "steam"
      ? t("installFlow.platformSteam")
      : platform === "epic"
        ? t("installFlow.platformEpic")
        : t("common.unset");

  return (
    <div className="install-step install-step-confirm">
      <button type="button" className="btn-back" onClick={onBack}>
        ← {t("installFlow.back")}
      </button>
      <h2 className="step-title">{t("installFlow.confirmTitle")}</h2>
      <div className="confirm-content">
        <dl className="confirm-list">
          <dt>{t("installFlow.platformSteam")} / {t("installFlow.platformEpic")}</dt>
          <dd>{platformLabel}</dd>
          <dt>{t("installFlow.folderPath")}</dt>
          <dd><code>{amongUsPath || t("common.unset")}</code></dd>
          <dt>SNR {t("installFlow.versionLatest")}</dt>
          <dd><code>{releaseTag || t("common.unset")}</code></dd>
        </dl>
        <label className="confirm-checkbox">
          <input
            type="checkbox"
            checked={restoreSaveData}
            onChange={(e) => onRestoreChange(e.target.checked)}
          />
          {t("launcher.restoreSavedDataOnInstall")}
        </label>
      </div>
      <div className="confirm-actions">
        <button type="button" className="btn-primary" onClick={onInstall}>
          {t("installFlow.install")}
        </button>
      </div>
      {error && <p className="step-error">{error}</p>}
    </div>
  );
}
