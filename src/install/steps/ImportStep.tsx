import { open } from "@tauri-apps/plugin-dialog";
import { useEffect, useState } from "react";
import { UiIcon } from "../../app/UiIcon";
import type { PresetSummary } from "../../app/types";
import type { MessageKey } from "../../i18n";

interface ImportStepProps {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  importEnabled: boolean;
  migrationEnabled: boolean;
  migrationExtension: string;
  migrationLegacyExtension: string;
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

const IMPORT_CONTENT_ANIMATION_MS = 180;

function useAnimatedVisibility(visible: boolean) {
  // 表示/非表示を即時アンマウントせず、退場アニメーション完了まで保持する。
  const [shouldRender, setShouldRender] = useState(visible);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (visible) {
      // 再表示時は即座に表示状態へ戻し、退場フラグを解除する。
      setShouldRender(true);
      setIsClosing(false);
      return;
    }

    if (!shouldRender) {
      // 既に非表示ならタイマー設定は不要。
      return;
    }

    setIsClosing(true);
    const timeoutId = window.setTimeout(() => {
      setShouldRender(false);
      setIsClosing(false);
    }, IMPORT_CONTENT_ANIMATION_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [visible, shouldRender]);

  return {
    shouldRender,
    animationClass: visible && !isClosing ? "is-entering" : "is-leaving",
  } as const;
}

export default function ImportStep({
  t,
  importEnabled,
  migrationEnabled,
  migrationExtension,
  migrationLegacyExtension,
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
  // ダイアログ操作中フラグでボタン連打による重複処理を防ぐ。
  const [previewing, setPreviewing] = useState(false);
  const [pickingArchive, setPickingArchive] = useState(false);
  const importContent = useAnimatedVisibility(importEnabled);
  const archiveContent = useAnimatedVisibility(migrationEnabled && migrationImportEnabled);
  const hasFolderPreview = sourceSaveDataPath.trim().length > 0;
  const hasArchivePath = migrationArchivePath.trim().length > 0;

  // 次へ進む条件を事前計算し、入力不足や検証中の遷移を防ぐ。
  const canProceed =
    (!importEnabled || (hasFolderPreview && !previewError && !previewing)) &&
    (!migrationEnabled ||
      !migrationImportEnabled ||
      (hasArchivePath &&
        migrationPassword.trim().length > 0 &&
        !pickingArchive &&
        migrationPasswordValidationState !== "checking" &&
        migrationPasswordValidationState !== "invalid"));

  const handleSelectSource = async () => {
    let selectedPath: string | string[] | null;
    try {
      // Among Us フォルダ選択用のディレクトリピッカーを開く。
      selectedPath = await open({
        directory: true,
        multiple: false,
      });
    } catch (error) {
      console.error("Failed to open source folder picker:", error);
      return;
    }

    if (!selectedPath || Array.isArray(selectedPath)) {
      // キャンセル時は何も変更しない。
      return;
    }

    setPreviewing(true);
    try {
      // 選択後は即プレビューを取得して内容を確認できるようにする。
      await onSelectSource(selectedPath);
    } finally {
      setPreviewing(false);
    }
  };

  const handleSelectArchive = async () => {
    let selectedPath: string | string[] | null;
    try {
      // 拡張子フィルターで移行アーカイブのみ選択可能にする。
      selectedPath = await open({
        directory: false,
        multiple: false,
        filters: [
          {
            name: migrationExtension,
            extensions: Array.from(new Set([migrationExtension, migrationLegacyExtension])),
          },
        ],
      });
    } catch (error) {
      console.error("Failed to open migration archive picker:", error);
      return;
    }

    if (!selectedPath || Array.isArray(selectedPath)) {
      // アーカイブ未選択のまま戻ったケースを許容する。
      return;
    }

    setPickingArchive(true);
    try {
      // 親コンポーネントへ選択パスを反映して検証を開始する。
      onSelectArchive(selectedPath);
    } finally {
      setPickingArchive(false);
    }
  };

  const previewStatus = previewing
    ? // プレビュー状態に応じて案内文を切り替える。
      t("installFlow.importPreviewLoading")
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
    ? // アーカイブ側はエラー・検証中・検証済みを優先表示する。
      migrationArchiveError
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
        <UiIcon name="arrow-left" size={16} className="btn-back-icon" />
        {t("installFlow.back")}
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

          {importContent.shouldRender && (
            <div className={`import-step-content ${importContent.animationClass}`}>
              <button
                type="button"
                className="btn-manual-select"
                onClick={handleSelectSource}
                disabled={previewing}
              >
                <span className="btn-manual-select-icon" aria-hidden="true">
                  <UiIcon name="folder" size={18} />
                </span>
                {t("installFlow.importSelectSource")}
              </button>

              <p className={`import-preview-status ${previewError ? "is-error" : ""}`}>
                {previewStatus}
              </p>

              <div className="import-paths">
                <p className="import-path-line">
                  <strong>{t("installFlow.folderPath")}:</strong>{" "}
                  <code>{sourceAmongUsPath || t("common.unset")}</code>
                </p>
              </div>

              {hasFolderPreview && (
                <>
                  {!previewError && (
                    <p className="import-preview-heading">
                      {t("installFlow.importPreviewListTitle")}
                    </p>
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

        {migrationEnabled && (
          // 移行機能フラグ有効時のみアーカイブ取込UIを表示する。
          <div className="import-option-block">
            <label className="confirm-checkbox import-toggle">
              <input
                type="checkbox"
                checked={migrationImportEnabled}
                onChange={(event) => onMigrationImportEnabledChange(event.target.checked)}
              />
              {t("installFlow.importArchiveEnable")}
            </label>

            {archiveContent.shouldRender && (
              // パスワード検証結果はアーカイブ入力ブロック内に集約表示する。
              <div className={`import-step-content ${archiveContent.animationClass}`}>
                <div className="import-archive-fields">
                  <button
                    type="button"
                    className="btn-manual-select"
                    onClick={handleSelectArchive}
                    disabled={pickingArchive}
                  >
                    <span className="btn-manual-select-icon" aria-hidden="true">
                      <UiIcon name="package" size={18} />
                    </span>
                    {t("installFlow.importArchiveSelect")}
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
                      // 入力変化は即時反映し、検証はblur時に親で実行する。
                      onChange={(event) => onMigrationPasswordChange(event.target.value)}
                      onBlur={() => onMigrationPasswordBlur()}
                    />
                  </label>
                  {archiveStatus && (
                    <p className={`import-preview-status ${archiveStatusClass}`}>{archiveStatus}</p>
                  )}
                </div>
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
