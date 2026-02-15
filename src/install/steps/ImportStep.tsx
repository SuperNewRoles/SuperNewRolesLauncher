import { open } from "@tauri-apps/plugin-dialog";
import { useState } from "react";
import type { PresetSummary } from "../../app/types";
import type { MessageKey } from "../../i18n";

interface ImportStepProps {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  importEnabled: boolean;
  sourceAmongUsPath: string;
  sourceSaveDataPath: string;
  previewPresets: PresetSummary[];
  previewFileCount: number;
  previewError: string | null;
  onImportEnabledChange: (enabled: boolean) => void;
  onSelectSource: (sourceAmongUsPath: string) => Promise<void>;
  onNext: () => void;
  onBack: () => void;
}

export default function ImportStep({
  t,
  importEnabled,
  sourceAmongUsPath,
  sourceSaveDataPath,
  previewPresets,
  previewFileCount,
  previewError,
  onImportEnabledChange,
  onSelectSource,
  onNext,
  onBack,
}: ImportStepProps) {
  const [previewing, setPreviewing] = useState(false);
  const hasPreview = sourceSaveDataPath.trim().length > 0;
  const canProceed = !importEnabled || (hasPreview && !previewError && !previewing);

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

  const previewStatus = previewing
    ? t("installFlow.importPreviewLoading")
    : previewError
      ? t("installFlow.importPreviewError", { error: previewError })
      : hasPreview
        ? previewPresets.length > 0
          ? t("installFlow.importPreviewReady", {
              count: previewPresets.length,
              files: previewFileCount,
            })
          : t("installFlow.importPreviewEmpty", { files: previewFileCount })
        : t("installFlow.importNotConfigured");

  return (
    <div className="install-step install-step-import">
      <button type="button" className="btn-back" onClick={onBack}>
        ← {t("installFlow.back")}
      </button>

      <h2 className="step-title">{t("installFlow.importTitle")}</h2>
      <p className="import-step-description">{t("installFlow.importDescription")}</p>

      <div className="import-step-card">
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

            {hasPreview && (
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
                          <span className="import-preview-missing">{t("preset.archiveMissingData")}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="confirm-actions">
        <button type="button" className="btn-primary" onClick={onNext} disabled={!canProceed}>
          {t("installFlow.next")}
        </button>
      </div>
    </div>
  );
}
