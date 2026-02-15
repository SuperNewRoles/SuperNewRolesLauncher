import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import type { PresetSummary } from "../../app/types";
import type { MessageKey } from "../../i18n";

interface ImportStepProps {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  importEnabled: boolean;
  migrationImportEnabled: boolean;
  migrationPasswordValidationState: "idle" | "checking" | "valid" | "invalid";
  sourceAmongUsPath: string;
  sourceSaveDataPath: string;
  previewPresets: PresetSummary[];
  previewFileCount: number;
  previewError: string | null;
  migrationArchivePath: string;
  migrationPassword: string;
  migrationArchiveError: string | null;
  onImportEnabledChange: (enabled: boolean) => void;
  onMigrationImportEnabledChange: (enabled: boolean) => void;
  onSelectSource: (sourceAmongUsPath: string) => Promise<void>;
  onSelectArchive: (archivePath: string) => void;
  onMigrationPasswordChange: (password: string) => void;
  onMigrationPasswordBlur: () => void;
  onNext: () => void;
  onBack: () => void;
}

export default function ImportStep({
  t,
  importEnabled,
  migrationImportEnabled,
  migrationPasswordValidationState,
  sourceAmongUsPath,
  sourceSaveDataPath,
  previewPresets,
  previewFileCount,
  previewError,
  migrationArchivePath,
  migrationPassword,
  migrationArchiveError,
  onImportEnabledChange,
  onMigrationImportEnabledChange,
  onSelectSource,
  onSelectArchive,
  onMigrationPasswordChange,
  onMigrationPasswordBlur,
  onNext,
  onBack,
}: ImportStepProps) {
  const [previewing, setPreviewing] = useState(false);
  const [pickingArchive, setPickingArchive] = useState(false);
  const hasFolderPreview = sourceSaveDataPath.trim().length > 0;
  const hasArchivePath = migrationArchivePath.trim().length > 0;

  const canProceed =
    (!importEnabled || (hasFolderPreview && !previewError && !previewing)) &&
    (!migrationImportEnabled ||
      (hasArchivePath &&
        migrationPassword.trim().length > 0 &&
        !pickingArchive &&
        migrationPasswordValidationState !== "checking" &&
        migrationPasswordValidationState !== "invalid"));

  const handleSelectSource = async () => {
    let selectedPath: string | string[] | null;
    try {
      selectedPath = await open({
        directory: true,
        multiple: false,
      });
    } catch (error) {
      console.error("Failed to open source folder picker:", error);
      return;
    }

    if (!selectedPath || Array.isArray(selectedPath)) {
      return;
    }

    setPreviewing(true);
    try {
      await onSelectSource(selectedPath);
    } finally {
      setPreviewing(false);
    }
  };

  const handleSelectArchive = async () => {
    let selectedPath: string | string[] | null;
    try {
      selectedPath = await open({
        directory: false,
        multiple: false,
        filters: [{ name: "snrdata", extensions: ["snrdata"] }],
      });
    } catch (error) {
      console.error("Failed to open migration archive picker:", error);
      return;
    }

    if (!selectedPath || Array.isArray(selectedPath)) {
      return;
    }

    setPickingArchive(true);
    try {
      onSelectArchive(selectedPath);
    } finally {
      setPickingArchive(false);
    }
  };

  const previewStatus = previewing
    ? t("installFlow.importPreviewLoading")
    : previewError
      ? t("installFlow.importPreviewError", { error: previewError })
      : hasFolderPreview
        ? previewPresets.length > 0
          ? t("installFlow.importPreviewReady", {
              count: previewPresets.length,
              files: previewFileCount,
            })
          : t("installFlow.importPreviewEmpty", { files: previewFileCount })
        : t("installFlow.importNotConfigured");

  const archiveStatus = migrationArchiveError
    ? migrationArchiveError
    : migrationPasswordValidationState === "checking"
      ? t("installFlow.importArchivePasswordChecking")
      : migrationPasswordValidationState === "valid"
        ? t("installFlow.importArchivePasswordValid")
        : !hasArchivePath
          ? t("installFlow.importArchiveNotConfigured")
          : null;

  const archiveStatusClass = migrationArchiveError
    ? "is-error"
    : migrationPasswordValidationState === "valid"
      ? "is-success"
      : "";

  return (
    <div className="install-step install-step-import">
      <button type="button" className="btn-back" onClick={onBack}>
        ← {t("installFlow.back")}
      </button>

      <h2 className="step-title">{t("installFlow.importTitle")}</h2>
      <p className="import-step-description">{t("installFlow.importDescription")}</p>

      <div className="import-step-card">
        <div className="import-option-block">
          <label className="confirm-checkbox import-toggle">
            <input
              type="checkbox"
              checked={importEnabled}
              onChange={(event) => onImportEnabledChange(event.target.checked)}
            />
            {t("installFlow.importEnable")}
          </label>

          {importEnabled && (
            <div className="import-step-content">
              <button
                type="button"
                className="btn-manual-select"
                onClick={handleSelectSource}
                disabled={previewing}
              >
                📁 {t("installFlow.importSelectSource")}
              </button>

              <div className="import-paths">
                <p className="import-path-line">
                  <strong>{t("installFlow.folderPath")}:</strong>{" "}
                  <code>{sourceAmongUsPath || t("common.unset")}</code>
                </p>
              </div>

              <p className={`import-preview-status ${previewError ? "is-error" : ""}`}>
                {previewStatus}
              </p>

              {hasFolderPreview && (
                <>
                  {!previewError && (
                    <p className="import-preview-heading">{t("installFlow.importPreviewListTitle")}</p>
                  )}
                  <div className="import-preview-list-wrap">
                    {previewPresets.length === 0 ? (
                      <p className="import-preview-empty">{t("preset.localEmpty")}</p>
                    ) : (
                      <ul className="import-preview-list">
                        {previewPresets.map((preset) => (
                          <li key={`import-preview-${preset.id}`} className="import-preview-item">
                            <span className="import-preview-name">
                              [{preset.id}] {preset.name}
                            </span>
                            {!preset.hasDataFile && (
                              <span className="import-preview-missing">
                                {t("preset.archiveMissingData")}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="import-option-block">
          <label className="confirm-checkbox import-toggle">
            <input
              type="checkbox"
              checked={migrationImportEnabled}
              onChange={(event) => onMigrationImportEnabledChange(event.target.checked)}
            />
            {t("installFlow.importArchiveEnable")}
          </label>

          {migrationImportEnabled && (
            <div className="import-step-content">
              <div className="import-archive-fields">
                <button
                  type="button"
                  className="btn-manual-select"
                  onClick={handleSelectArchive}
                  disabled={pickingArchive}
                >
                  📦 {t("installFlow.importArchiveSelect")}
                </button>
                <p className="import-path-line">
                  <strong>{t("installFlow.importArchivePath")}:</strong>{" "}
                  <code>{migrationArchivePath || t("common.unset")}</code>
                </p>
                <label className="stack import-password-field" htmlFor="import-archive-password">
                  <span>{t("installFlow.importArchivePassword")}</span>
                  <input
                    id="import-archive-password"
                    type="password"
                    value={migrationPassword}
                    placeholder={t("migration.overlay.passwordPlaceholder")}
                    autoComplete="new-password"
                    onChange={(event) => onMigrationPasswordChange(event.target.value)}
                    onBlur={() => onMigrationPasswordBlur()}
                  />
                </label>
                {archiveStatus && (
                  <p className={`import-preview-status ${archiveStatusClass}`}>
                    {archiveStatus}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="confirm-actions">
        <button type="button" className="btn-primary" onClick={onNext} disabled={!canProceed}>
          {t("installFlow.next")}
        </button>
      </div>
    </div>
  );
}
