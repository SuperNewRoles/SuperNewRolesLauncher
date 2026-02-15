import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  epicLoginWebview,
  epicSessionRestore,
  epicStatusGet,
  finderDetectPlatforms,
  migrationImport,
  migrationValidateArchivePassword,
  settingsUpdate,
  snrInstall,
  snrPreservedSaveDataMergePresets,
  snrPreservedSaveDataStatus,
  snrReleasesList,
  snrSaveDataImport,
  snrSaveDataMergePresets,
  snrSaveDataPreview,
} from "../app/services/tauriClient";
import { type ThemePreference, applyTheme, getStoredTheme, setStoredTheme } from "../app/theme";
import type { GamePlatform, InstallProgressPayload, PresetSummary, SnrReleaseSummary } from "../app/types";
import {
  type LocaleCode,
  SUPPORTED_LOCALES,
  createTranslator,
  resolveInitialLocale,
  saveLocale,
} from "../i18n";
import type { MessageKey } from "../i18n";
import StepTransition from "./StepTransition";
import CompleteStep from "./steps/CompleteStep";
import ConfirmStep from "./steps/ConfirmStep";
import DetectingStep from "./steps/DetectingStep";
import EpicLoginStep from "./steps/EpicLoginStep";
import ImportStep from "./steps/ImportStep";
import PlatformStep from "./steps/PlatformStep";
import ProgressStep from "./steps/ProgressStep";
import VersionStep from "./steps/VersionStep";
import WelcomeStep from "./steps/WelcomeStep";
import type { DetectedPlatform, InstallStep } from "./types";

const LOCALE_OPTION_LABEL_KEYS: Record<LocaleCode, MessageKey> = {
  ja: "language.option.ja",
  en: "language.option.en",
};

type MigrationPasswordValidationState = "idle" | "checking" | "valid" | "invalid";

export default function InstallWizard() {
  const initialLocale = resolveInitialLocale();
  const [locale, setLocale] = useState<LocaleCode>(initialLocale);
  const t = createTranslator(locale);

  const [theme, setTheme] = useState<ThemePreference>(() => getStoredTheme());

  const [step, setStep] = useState<InstallStep>("welcome");
  const [platform, setPlatform] = useState<GamePlatform | null>(null);
  const [amongUsPath, setAmongUsPath] = useState("");
  const [releaseTag, setReleaseTag] = useState("");
  const [restoreSaveData, setRestoreSaveData] = useState(true);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [importEnabled, setImportEnabled] = useState(false);
  const [migrationImportEnabled, setMigrationImportEnabled] = useState(false);
  const [importSourceAmongUsPath, setImportSourceAmongUsPath] = useState("");
  const [importSourceSaveDataPath, setImportSourceSaveDataPath] = useState("");
  const [importPreviewPresets, setImportPreviewPresets] = useState<PresetSummary[]>([]);
  const [importPreviewFileCount, setImportPreviewFileCount] = useState(0);
  const [importPreviewError, setImportPreviewError] = useState<string | null>(null);
  const [migrationArchivePath, setMigrationArchivePath] = useState("");
  const [migrationPassword, setMigrationPassword] = useState("");
  const [migrationArchiveError, setMigrationArchiveError] = useState<string | null>(null);
  const [migrationPasswordValidationState, setMigrationPasswordValidationState] =
    useState<MigrationPasswordValidationState>("idle");
  const [importSkippedAfterFailure, setImportSkippedAfterFailure] = useState(false);
  const [importSkipReason, setImportSkipReason] = useState<string | null>(null);

  const [detectedPlatforms, setDetectedPlatforms] = useState<DetectedPlatform[]>([]);
  const [releases, setReleases] = useState<SnrReleaseSummary[]>([]);
  const [releasesLoading, setReleasesLoading] = useState(false);
  const [releasesError, setReleasesError] = useState<string | null>(null);
  const [preservedSaveDataAvailable, setPreservedSaveDataAvailable] = useState(false);
  const [epicLoggedIn, setEpicLoggedIn] = useState(false);
  const [epicUserDisplay, setEpicUserDisplay] = useState<string | null>(null);
  const releasesRequestIdRef = useRef(0);
  const migrationPasswordValidationRequestIdRef = useRef(0);

  const resetImportState = useCallback(() => {
    setImportEnabled(false);
    setMigrationImportEnabled(false);
    setImportSourceAmongUsPath("");
    setImportSourceSaveDataPath("");
    setImportPreviewPresets([]);
    setImportPreviewFileCount(0);
    setImportPreviewError(null);
    setMigrationArchivePath("");
    setMigrationPassword("");
    setMigrationArchiveError(null);
    setMigrationPasswordValidationState("idle");
    migrationPasswordValidationRequestIdRef.current += 1;
    setImportSkippedAfterFailure(false);
    setImportSkipReason(null);
  }, []);

  const fetchReleasesForInstall = useCallback(async () => {
    const requestId = releasesRequestIdRef.current + 1;
    releasesRequestIdRef.current = requestId;
    setReleasesLoading(true);
    setReleasesError(null);
    setReleases([]);
    setReleaseTag("");

    try {
      const rels = await snrReleasesList();
      if (releasesRequestIdRef.current !== requestId) {
        return;
      }

      setReleases(rels);
      if (rels.length > 0) {
        setReleaseTag((current) => (current.trim().length > 0 ? current : rels[0].tag));
      }
    } catch (e) {
      if (releasesRequestIdRef.current !== requestId) {
        return;
      }
      setReleases([]);
      setReleaseTag("");
      setReleasesError(String(e));
    } finally {
      if (releasesRequestIdRef.current === requestId) {
        setReleasesLoading(false);
      }
    }
  }, []);

  const onStart = useCallback(async () => {
    setError(null);
    resetImportState();
    setStep("detecting");
    void fetchReleasesForInstall();
    try {
      const platforms = await finderDetectPlatforms();
      setDetectedPlatforms(platforms);
      const preservedSaveDataStatus = await snrPreservedSaveDataStatus().catch(() => ({
        available: false,
        files: 0,
      }));
      const hasPreservedSaveData =
        preservedSaveDataStatus.available && preservedSaveDataStatus.files > 0;
      setPreservedSaveDataAvailable(hasPreservedSaveData);
      setRestoreSaveData(hasPreservedSaveData);
      setStep("platform");
    } catch (e) {
      setError(String(e));
      setStep("welcome");
    }
  }, [fetchReleasesForInstall, resetImportState]);

  const onPlatformSelect = useCallback((path: string, plat: GamePlatform) => {
    setAmongUsPath(path);
    setPlatform(plat);
    if (plat === "epic") {
      setStep("epic-login");
    } else {
      setStep("version");
    }
  }, []);

  const onManualFolderSelect = useCallback(async (path: string, plat: GamePlatform) => {
    setAmongUsPath(path);
    setPlatform(plat);
    if (plat === "epic") {
      setStep("epic-login");
    } else {
      setStep("version");
    }
  }, []);

  const onEpicLoginDone = useCallback(() => {
    setStep("version");
  }, []);

  const onVersionSelect = useCallback((tag: string) => {
    setReleaseTag(tag);
    setError(null);
    setStep("import");
  }, []);

  const onImportSourceSelect = useCallback(async (sourcePath: string) => {
    setImportSourceAmongUsPath(sourcePath);
    setImportSourceSaveDataPath("");
    setImportPreviewPresets([]);
    setImportPreviewFileCount(0);
    setImportPreviewError(null);

    try {
      const preview = await snrSaveDataPreview(sourcePath);
      setImportSourceAmongUsPath(preview.sourceAmongUsPath);
      setImportSourceSaveDataPath(preview.sourceSaveDataPath);
      setImportPreviewPresets(preview.presets);
      setImportPreviewFileCount(preview.fileCount);
    } catch (previewError) {
      setImportPreviewError(String(previewError));
    }
  }, []);

  const isMigrationPasswordError = useCallback((message: string): boolean => {
    const normalized = message.toLowerCase();
    return (
      normalized.includes("incorrect password") ||
      normalized.includes("invalid password") ||
      normalized.includes("failed to decrypt .snrdata") ||
      normalized.includes("password may be incorrect") ||
      normalized.includes("please provide a password")
    );
  }, []);

  const validateMigrationPassword = useCallback(async (): Promise<boolean> => {
    if (!migrationImportEnabled) {
      return true;
    }

    const archivePath = migrationArchivePath.trim();
    if (archivePath.length === 0) {
      setMigrationArchiveError(t("installFlow.importArchiveNotConfigured"));
      setMigrationPasswordValidationState("invalid");
      return false;
    }

    const password = migrationPassword.trim();
    if (password.length === 0) {
      setMigrationArchiveError(t("installFlow.importArchivePasswordRequired"));
      setMigrationPasswordValidationState("invalid");
      return false;
    }

    const requestId = migrationPasswordValidationRequestIdRef.current + 1;
    migrationPasswordValidationRequestIdRef.current = requestId;
    setMigrationArchiveError(null);
    setMigrationPasswordValidationState("checking");

    try {
      await migrationValidateArchivePassword({
        archivePath,
        password,
      });

      if (migrationPasswordValidationRequestIdRef.current !== requestId) {
        return false;
      }

      setMigrationPasswordValidationState("valid");
      return true;
    } catch (validationError) {
      if (migrationPasswordValidationRequestIdRef.current !== requestId) {
        return false;
      }

      const message = String(validationError);
      setMigrationPasswordValidationState("invalid");
      if (isMigrationPasswordError(message)) {
        setMigrationArchiveError(t("installFlow.importArchivePasswordInvalid"));
      } else {
        setMigrationArchiveError(
          t("installFlow.importArchivePasswordCheckFailed", { error: message }),
        );
      }
      return false;
    }
  }, [
    migrationArchivePath,
    migrationImportEnabled,
    migrationPassword,
    t,
    isMigrationPasswordError,
  ]);

  const onMigrationArchiveSelect = useCallback((archivePath: string) => {
    migrationPasswordValidationRequestIdRef.current += 1;
    setMigrationArchivePath(archivePath);
    setMigrationArchiveError(null);
    setMigrationPasswordValidationState("idle");
  }, []);

  const onImportNext = useCallback(async () => {
    if (importEnabled && (importSourceSaveDataPath.trim().length === 0 || importPreviewError !== null)) {
      return;
    }

    if (migrationImportEnabled && migrationArchivePath.trim().length === 0) {
      setMigrationArchiveError(t("installFlow.importArchiveNotConfigured"));
      return;
    }
    if (migrationImportEnabled && migrationPassword.trim().length === 0) {
      setMigrationArchiveError(t("installFlow.importArchivePasswordRequired"));
      return;
    }

    if (
      migrationImportEnabled &&
      (migrationPasswordValidationState === "checking" ||
        migrationPasswordValidationState === "idle" ||
        migrationPasswordValidationState === "invalid")
    ) {
      const validated = await validateMigrationPassword();
      if (!validated) {
        return;
      }
    }

    setStep("confirm");
  }, [
    importEnabled,
    migrationImportEnabled,
    importPreviewError,
    importSourceSaveDataPath,
    migrationArchivePath,
    migrationPassword,
    migrationPasswordValidationState,
    t,
    validateMigrationPassword,
  ]);

  const onConfirmInstall = useCallback(async () => {
    if (!platform || !amongUsPath || !releaseTag) {
      return;
    }

    if (importEnabled && importSourceAmongUsPath.trim().length === 0) {
      setImportPreviewError(t("installFlow.importNotConfigured"));
      setStep("import");
      return;
    }
    if (migrationImportEnabled && migrationArchivePath.trim().length === 0) {
      setMigrationArchiveError(t("installFlow.importArchiveNotConfigured"));
      setStep("import");
      return;
    }
    if (migrationImportEnabled && migrationPassword.trim().length === 0) {
      setMigrationArchiveError(t("installFlow.importArchivePasswordRequired"));
      setStep("import");
      return;
    }
    if (migrationImportEnabled) {
      const validated = await validateMigrationPassword();
      if (!validated) {
        setStep("import");
        return;
      }
    }

    const markImportSkipped = (reason: string) => {
      setImportSkippedAfterFailure(true);
      setImportSkipReason((current) => (current ? `${current} / ${reason}` : reason));
    };

    const runSaveDataImportFlow = async (): Promise<boolean> => {
      setProgress(99);
      setProgressMessage(t("installFlow.importingSaveData"));
      while (true) {
        try {
          await snrSaveDataImport(importSourceAmongUsPath);
          return true;
        } catch (importError) {
          const message = String(importError);
          const shouldRetry = window.confirm(t("installFlow.importRetrySkipPrompt", { error: message }));
          if (shouldRetry) {
            continue;
          }
          markImportSkipped(message);
          return false;
        }
      }
    };

    const runMigrationImportFlow = async (): Promise<boolean> => {
      setProgress(99);
      setProgressMessage(t("installFlow.importingMigrationData"));
      while (true) {
        try {
          await migrationImport({
            archivePath: migrationArchivePath.trim(),
            password: migrationPassword.trim(),
          });
          return true;
        } catch (importError) {
          const message = String(importError);
          const shouldRetry = window.confirm(
            t("installFlow.importRetrySkipPromptMigration", { error: message }),
          );
          if (shouldRetry) {
            continue;
          }
          markImportSkipped(message);
          return false;
        }
      }
    };

    const runSaveDataPresetMergeFlow = async (): Promise<boolean> => {
      setProgress(99);
      setProgressMessage(t("installFlow.importingSaveDataPresetMerge"));
      while (true) {
        try {
          await snrSaveDataMergePresets(importSourceAmongUsPath);
          return true;
        } catch (mergeError) {
          const message = String(mergeError);
          const shouldRetry = window.confirm(
            t("installFlow.importRetrySkipPromptSaveDataPresetMerge", { error: message }),
          );
          if (shouldRetry) {
            continue;
          }
          markImportSkipped(message);
          return false;
        }
      }
    };

    const runPreservedSaveDataPresetMergeFlow = async (): Promise<boolean> => {
      setProgress(99);
      setProgressMessage(t("installFlow.importingPreservedSaveDataPresetMerge"));
      while (true) {
        try {
          await snrPreservedSaveDataMergePresets();
          return true;
        } catch (mergeError) {
          const message = String(mergeError);
          const shouldRetry = window.confirm(
            t("installFlow.importRetrySkipPromptPreservedSaveDataPresetMerge", { error: message }),
          );
          if (shouldRetry) {
            continue;
          }
          markImportSkipped(message);
          return false;
        }
      }
    };

    setImportSkippedAfterFailure(false);
    setImportSkipReason(null);
    setStep("progress");
    setProgress(0);
    setProgressMessage(t("install.starting"));
    setError(null);

    try {
      await settingsUpdate({
        amongUsPath,
        gamePlatform: platform,
        selectedReleaseTag: releaseTag,
      });
      await snrInstall({
        tag: releaseTag,
        platform,
        restorePreservedSaveData: preservedSaveDataAvailable && restoreSaveData,
      });

      let saveDataImported = false;
      let migrationImported = false;

      if (importEnabled) {
        saveDataImported = await runSaveDataImportFlow();
      }
      if (migrationImportEnabled) {
        migrationImported = await runMigrationImportFlow();
      }
      if (importEnabled && migrationImportEnabled && saveDataImported && migrationImported) {
        await runSaveDataPresetMergeFlow();
      }
      if (
        preservedSaveDataAvailable &&
        restoreSaveData &&
        (saveDataImported || migrationImported)
      ) {
        await runPreservedSaveDataPresetMergeFlow();
      }

      setStep("complete");
    } catch (e) {
      setError(String(e));
      setStep("confirm");
    }
  }, [
    platform,
    amongUsPath,
    releaseTag,
    importEnabled,
    migrationImportEnabled,
    importSourceAmongUsPath,
    migrationArchivePath,
    migrationPassword,
    restoreSaveData,
    preservedSaveDataAvailable,
    t,
    validateMigrationPassword,
  ]);

  const onComplete = useCallback(() => {
    setStep("welcome");
    setPlatform(null);
    setAmongUsPath("");
    setReleaseTag("");
    setRestoreSaveData(true);
    setProgress(0);
    setProgressMessage("");
    resetImportState();
  }, [resetImportState]);

  const onBack = useCallback(() => {
    if (step === "platform") {
      setStep("welcome");
    } else if (step === "version") {
      setStep(platform === "epic" ? "epic-login" : "platform");
    } else if (step === "epic-login") {
      setStep("platform");
    } else if (step === "import") {
      setStep("version");
    } else if (step === "confirm") {
      setStep("import");
    }
  }, [step, platform]);

  useEffect(() => {
    const unlisten = listen<InstallProgressPayload>("snr-install-progress", (event) => {
      const payload = event.payload;
      setProgress(Math.max(0, Math.min(100, payload.progress ?? 0)));
      setProgressMessage(payload.message);
    });
    return () => {
      void unlisten.then((u) => u());
    };
  }, []);

  useEffect(() => {
    const unsubSuccess = listen("epic-login-success", () => {
      void epicStatusGet().then((s) => {
        setEpicLoggedIn(s.loggedIn);
        setEpicUserDisplay(s.displayName?.trim() || s.accountId?.trim() || null);
      });
    });
    return () => {
      void unsubSuccess.then((u) => u());
    };
  }, []);

  useEffect(() => {
    void epicSessionRestore().catch(() => {});
    void epicStatusGet()
      .then((s) => {
        setEpicLoggedIn(s.loggedIn);
        setEpicUserDisplay(s.displayName?.trim() || s.accountId?.trim() || null);
      })
      .catch(() => {});
  }, []);

  const handleLocaleChange = useCallback(async (newLocale: LocaleCode) => {
    setLocale(newLocale);
    saveLocale(newLocale);
    await settingsUpdate({ uiLocale: newLocale }).catch(() => undefined);
    document.documentElement.lang = newLocale;
  }, []);

  const handleThemeChange = useCallback((newTheme: ThemePreference) => {
    setTheme(newTheme);
    setStoredTheme(newTheme);
    applyTheme(newTheme);
  }, []);

  const renderStep = (s: InstallStep, _isExiting: boolean, _direction: "forward" | "back") => {
    if (s === "welcome")
      return (
        <WelcomeStep
          t={t}
          locale={locale}
          onLocaleChange={handleLocaleChange}
          onStart={onStart}
          error={error}
          localeOptions={SUPPORTED_LOCALES.map((code) => ({
            value: code,
            label: t(LOCALE_OPTION_LABEL_KEYS[code]),
          }))}
          theme={theme}
          onThemeChange={handleThemeChange}
        />
      );
    if (s === "detecting") return <DetectingStep t={t} />;
    if (s === "platform")
      return (
        <PlatformStep
          t={t}
          detectedPlatforms={detectedPlatforms}
          onSelect={onPlatformSelect}
          onManualSelect={onManualFolderSelect}
          onBack={onBack}
          error={error}
        />
      );
    if (s === "epic-login")
      return (
        <EpicLoginStep
          t={t}
          epicLoggedIn={epicLoggedIn}
          onEpicLogin={epicLoginWebview}
          onRefreshStatus={() =>
            epicStatusGet().then((status) => {
              setEpicLoggedIn(status.loggedIn);
              setEpicUserDisplay(status.displayName?.trim() || status.accountId?.trim() || null);
            })
          }
          epicUserDisplay={epicUserDisplay}
          onDone={onEpicLoginDone}
          onBack={onBack}
        />
      );
    if (s === "version")
      return (
        <VersionStep
          t={t}
          releases={releases}
          releasesLoading={releasesLoading}
          releasesError={releasesError}
          selectedTag={releaseTag}
          onSelect={onVersionSelect}
          onRetryFetchReleases={() => {
            void fetchReleasesForInstall();
          }}
          onBack={onBack}
          platform={platform}
        />
      );
    if (s === "import")
      return (
        <ImportStep
          t={t}
          importEnabled={importEnabled}
          migrationImportEnabled={migrationImportEnabled}
          sourceAmongUsPath={importSourceAmongUsPath}
          sourceSaveDataPath={importSourceSaveDataPath}
          previewPresets={importPreviewPresets}
          previewFileCount={importPreviewFileCount}
          previewError={importPreviewError}
          migrationArchivePath={migrationArchivePath}
          migrationPassword={migrationPassword}
          migrationArchiveError={migrationArchiveError}
          migrationPasswordValidationState={migrationPasswordValidationState}
          onImportEnabledChange={(enabled) => {
            setImportEnabled(enabled);
            if (!enabled) {
              setImportPreviewError(null);
              setImportSourceAmongUsPath("");
              setImportSourceSaveDataPath("");
              setImportPreviewPresets([]);
              setImportPreviewFileCount(0);
            }
          }}
          onMigrationImportEnabledChange={(enabled) => {
            setMigrationImportEnabled(enabled);
            migrationPasswordValidationRequestIdRef.current += 1;
            if (!enabled) {
              setMigrationArchivePath("");
              setMigrationPassword("");
              setMigrationArchiveError(null);
            }
            setMigrationPasswordValidationState("idle");
          }}
          onSelectSource={onImportSourceSelect}
          onSelectArchive={onMigrationArchiveSelect}
          onMigrationPasswordChange={(password) => {
            migrationPasswordValidationRequestIdRef.current += 1;
            setMigrationPassword(password);
            setMigrationArchiveError(null);
            setMigrationPasswordValidationState("idle");
          }}
          onMigrationPasswordBlur={() => {
            void validateMigrationPassword();
          }}
          onNext={onImportNext}
          onBack={onBack}
        />
      );
    if (s === "confirm")
      return (
        <ConfirmStep
          t={t}
          platform={platform}
          amongUsPath={amongUsPath}
          releaseTag={releaseTag}
          importEnabled={importEnabled}
          migrationImportEnabled={migrationImportEnabled}
          importSourceAmongUsPath={importSourceAmongUsPath}
          migrationArchivePath={migrationArchivePath}
          importPresetCount={importPreviewPresets.length}
          showRestoreSaveDataOption={preservedSaveDataAvailable}
          restoreSaveData={restoreSaveData}
          onRestoreChange={setRestoreSaveData}
          onInstall={onConfirmInstall}
          onBack={onBack}
          error={error}
        />
      );
    if (s === "progress")
      return <ProgressStep t={t} progress={progress} message={progressMessage} />;
    if (s === "complete")
      return (
        <CompleteStep
          t={t}
          onNext={onComplete}
          importSkippedAfterFailure={importSkippedAfterFailure}
          importSkipReason={importSkipReason}
        />
      );
    return null;
  };

  const isWelcome = step === "welcome";

  return (
    <div className={`install-wizard ${isWelcome ? "install-wizard-welcome" : ""}`}>
      <StepTransition step={step}>{renderStep}</StepTransition>
    </div>
  );
}
