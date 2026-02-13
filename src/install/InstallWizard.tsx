import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useState } from "react";
import {
  epicLoginWebview,
  epicSessionRestore,
  epicStatusGet,
  finderDetectPlatforms,
  settingsUpdate,
  snrInstall,
  snrPreservedSaveDataStatus,
  snrReleasesList,
} from "../app/services/tauriClient";
import { type ThemePreference, applyTheme, getStoredTheme, setStoredTheme } from "../app/theme";
import type { InstallProgressPayload } from "../app/types";
import type { GamePlatform } from "../app/types";
import type { SnrReleaseSummary } from "../app/types";
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
import PlatformStep from "./steps/PlatformStep";
import ProgressStep from "./steps/ProgressStep";
import VersionStep from "./steps/VersionStep";
import WelcomeStep from "./steps/WelcomeStep";
import type { DetectedPlatform, InstallStep } from "./types";

const LOCALE_OPTION_LABEL_KEYS: Record<LocaleCode, MessageKey> = {
  ja: "language.option.ja",
  en: "language.option.en",
};

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

  const [detectedPlatforms, setDetectedPlatforms] = useState<DetectedPlatform[]>([]);
  const [releases, setReleases] = useState<SnrReleaseSummary[]>([]);
  const [preservedSaveDataAvailable, setPreservedSaveDataAvailable] = useState(false);
  const [epicLoggedIn, setEpicLoggedIn] = useState(false);
  const [epicUserDisplay, setEpicUserDisplay] = useState<string | null>(null);

  const onStart = useCallback(async () => {
    setError(null);
    setStep("detecting");
    try {
      const platforms = await finderDetectPlatforms();
      setDetectedPlatforms(platforms);
      const rels = await snrReleasesList();
      setReleases(rels);
      const preservedSaveDataStatus = await snrPreservedSaveDataStatus().catch(() => ({
        available: false,
        files: 0,
      }));
      const hasPreservedSaveData = preservedSaveDataStatus.available;
      setPreservedSaveDataAvailable(hasPreservedSaveData);
      setRestoreSaveData(hasPreservedSaveData);
      if (rels.length > 0) {
        setReleaseTag(rels[0].tag);
      }
      setStep("platform");
    } catch (e) {
      setError(String(e));
      setStep("welcome");
    }
  }, []);

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
    setStep("confirm");
  }, []);

  const onConfirmInstall = useCallback(async () => {
    if (!platform || !amongUsPath || !releaseTag) return;
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
      setStep("complete");
    } catch (e) {
      setError(String(e));
      setStep("confirm");
    }
  }, [platform, amongUsPath, releaseTag, restoreSaveData, preservedSaveDataAvailable, t]);

  const onComplete = useCallback(() => {
    setStep("welcome");
    setPlatform(null);
    setAmongUsPath("");
    setReleaseTag("");
    setRestoreSaveData(true);
    setProgress(0);
    setProgressMessage("");
  }, []);

  const onBack = useCallback(() => {
    if (step === "platform") setStep("welcome");
    else if (step === "version") setStep(platform === "epic" ? "epic-login" : "platform");
    else if (step === "epic-login") setStep("platform");
    else if (step === "confirm") setStep("version");
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
  }, [step]);

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

  const renderStep = (s: InstallStep, isExiting: boolean, _direction: "forward" | "back") => {
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
            epicStatusGet().then((s) => {
              setEpicLoggedIn(s.loggedIn);
              setEpicUserDisplay(s.displayName?.trim() || s.accountId?.trim() || null);
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
          selectedTag={releaseTag}
          onSelect={onVersionSelect}
          onBack={onBack}
          platform={platform}
        />
      );
    if (s === "confirm")
      return (
        <ConfirmStep
          t={t}
          platform={platform}
          amongUsPath={amongUsPath}
          releaseTag={releaseTag}
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
    if (s === "complete") return <CompleteStep t={t} onNext={onComplete} />;
    return null;
  };

  const isWelcome = step === "welcome";

  return (
    <div className={`install-wizard ${isWelcome ? "install-wizard-welcome" : ""}`}>
      <StepTransition step={step}>{renderStep}</StepTransition>
    </div>
  );
}
