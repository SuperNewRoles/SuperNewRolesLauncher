import { cloneElement } from "react";
import type { GamePlatform } from "../../app/types";
import type { MessageKey } from "../../i18n";
import { EPIC_SVG, STEAM_SVG } from "./PlatformStep";

interface ConfirmStepProps {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  platform: GamePlatform | null;
  amongUsPath: string;
  releaseTag: string;
  importEnabled: boolean;
  migrationImportEnabled: boolean;
  importSourceAmongUsPath: string;
  migrationArchivePath: string;
  importPresetCount: number;
  showRestoreSaveDataOption: boolean;
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
  importEnabled,
  migrationImportEnabled,
  importSourceAmongUsPath,
  migrationArchivePath,
  importPresetCount,
  showRestoreSaveDataOption,
  restoreSaveData,
  onRestoreChange,
  onInstall,
  onBack,
  error,
}: ConfirmStepProps) {
  const iconProps = {
    width: "1em",
    height: "1em",
    style: { display: "block" },
  };

  const platformContent =
    platform === "steam" ? (
      <span
        style={{ display: "inline-flex", alignItems: "center", gap: "0.15em", lineHeight: "1" }}
      >
        {cloneElement(STEAM_SVG, iconProps)}
        {t("installFlow.platformSteam")}
      </span>
    ) : platform === "epic" ? (
      <span
        style={{ display: "inline-flex", alignItems: "center", gap: "0.15em", lineHeight: "1" }}
      >
        {cloneElement(EPIC_SVG, iconProps)}
        {t("installFlow.platformEpic")}
      </span>
    ) : (
      t("common.unset")
    );

  return (
    <div className="install-step install-step-confirm">
      <button type="button" className="btn-back" onClick={onBack}>
        ← {t("installFlow.back")}
      </button>
      <h2 className="step-title">{t("installFlow.confirmTitle")}</h2>
      <div className="confirm-content">
        <dl className="confirm-list">
          <dt>
            {t("installFlow.platformSteam")} / {t("installFlow.platformEpic")}
          </dt>
          <dd>{platformContent}</dd>
          <dt>{t("installFlow.folderPath")}</dt>
          <dd>
            <code>{amongUsPath || t("common.unset")}</code>
          </dd>
          <dt>{t("installFlow.versionLabelSNR")}</dt>
          <dd>
            <code>v{releaseTag || t("common.unset")}</code>
          </dd>
          <dt>{t("installFlow.importTitle")}</dt>
          <dd>
            {!importEnabled && !migrationImportEnabled
              ? t("installFlow.importSummaryDisabled")
              : importEnabled && migrationImportEnabled
                ? `${t("installFlow.importSummaryEnabled", { count: importPresetCount })} / ${t("installFlow.importSummaryEnabledMigration")}`
                : migrationImportEnabled
                ? t("installFlow.importSummaryEnabledMigration")
                : t("installFlow.importSummaryEnabled", { count: importPresetCount })}
          </dd>
          {importEnabled && (
            <>
              <dt>{t("installFlow.importSourcePath")}</dt>
              <dd>
                <code>{importSourceAmongUsPath || t("common.unset")}</code>
              </dd>
            </>
          )}
          {migrationImportEnabled && (
            <>
              <dt>{t("installFlow.importArchivePath")}</dt>
              <dd>
                <code>{migrationArchivePath || t("common.unset")}</code>
              </dd>
            </>
          )}
        </dl>
        {showRestoreSaveDataOption && (
          <label className="confirm-checkbox">
            <input
              type="checkbox"
              checked={restoreSaveData}
              onChange={(e) => onRestoreChange(e.target.checked)}
            />
            {t("launcher.restoreSavedDataOnInstall")}
          </label>
        )}
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
