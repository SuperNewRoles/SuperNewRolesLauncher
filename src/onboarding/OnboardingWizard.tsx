import { useCallback, useEffect, useMemo, useState } from "react";
import { createTranslator, resolveInitialLocale } from "../i18n";
import StepTransition from "./StepTransition";
import { CompleteStep } from "./steps/CompleteStep";
import { ConnectStep } from "./steps/ConnectStep";
import { LaunchStep } from "./steps/LaunchStep";
import { MigrationStep } from "./steps/MigrationStep";
import { PresetStep } from "./steps/PresetStep";
import { ReportStep } from "./steps/ReportStep";
import { WelcomeStep } from "./steps/WelcomeStep";
import type { OnboardingStep } from "./types";

interface OnboardingWizardProps {
  onComplete: (reason: "skip" | "complete") => void;
  onStepChange?: (step: OnboardingStep) => void;
  reportingEnabled?: boolean;
  presetsEnabled?: boolean;
  migrationEnabled?: boolean;
}

const isFullscreenOnboardingStep = (candidate: OnboardingStep): boolean =>
  // 導入と完了系ステップは全面表示、説明中心ステップはスポットライト表示に分ける。
  candidate === "welcome" || candidate === "connect" || candidate === "complete";

export default function OnboardingWizard({
  onComplete,
  onStepChange,
  reportingEnabled = true,
  presetsEnabled = true,
  migrationEnabled = true,
}: OnboardingWizardProps) {
  const steps = useMemo<OnboardingStep[]>(() => {
    // 機能フラグに応じて実行ステップ列を動的に構築する。
    const sequence: OnboardingStep[] = ["welcome", "launch"];
    if (reportingEnabled) {
      sequence.push("reporting");
    }
    if (presetsEnabled) {
      sequence.push("preset");
    }
    if (migrationEnabled) {
      sequence.push("migration");
    }
    sequence.push("connect", "complete");
    return sequence;
  }, [reportingEnabled, presetsEnabled, migrationEnabled]);
  const [stepIndex, setStepIndex] = useState(0);
  // Note: ideally we should lift locale state up if we want dynamic language switching,
  // but for now reusing resolveInitialLocale is fine as it respects saved setting.
  const t = createTranslator(resolveInitialLocale());
  // steps 範囲外アクセス時の保険として welcome を既定値にする。
  const step = steps[stepIndex] ?? "welcome";

  useEffect(() => {
    // 外部がステップ同期できるよう、変更時コールバックを通知する。
    onStepChange?.(step);
  }, [onStepChange, step]);

  useEffect(() => {
    // ステップ配列が短くなった時に index の範囲外参照を防ぐ。
    setStepIndex((index) => Math.min(index, steps.length - 1));
  }, [steps]);

  const handleNext = useCallback(() => {
    // 最終ステップ到達時は onComplete を返し、以降は進めない。
    if (stepIndex >= steps.length - 1) {
      onComplete("complete");
      return;
    }
    setStepIndex((index) => Math.min(index + 1, steps.length - 1));
  }, [onComplete, stepIndex, steps.length]);

  const handleBack = useCallback(() => {
    // 先頭未満へは戻らない。
    setStepIndex((index) => Math.max(0, index - 1));
  }, []);

  const handleSkip = useCallback(() => {
    // スキップ時は明示的に理由を返す。
    onComplete("skip");
  }, [onComplete]);

  const renderStep = (s: OnboardingStep, _isExiting: boolean, _direction: "forward" | "back") => {
    // 各ステップへ共通ナビゲーション props を配布する。
    const commonProps = {
      t,
      onNext: handleNext,
      onBack: stepIndex === 0 ? undefined : handleBack,
      onSkip: s === "complete" ? undefined : handleSkip,
    };

    switch (s) {
      case "welcome":
        return <WelcomeStep {...commonProps} />;
      case "launch":
        return <LaunchStep {...commonProps} />;
      case "reporting":
        return <ReportStep {...commonProps} />;
      case "preset":
        return <PresetStep {...commonProps} />;
      case "migration":
        return <MigrationStep {...commonProps} />;
      case "connect":
        return <ConnectStep {...commonProps} />;
      case "complete":
        return <CompleteStep {...commonProps} />;
      default:
        return null;
    }
  };

  const getStepTitle = (s: OnboardingStep) => {
    // ヘッダー表示タイトルをステップごとに切り替える。
    switch (s) {
      case "welcome":
        return t("onboarding.welcome.title");
      case "launch":
        return t("onboarding.launch.title");
      case "reporting":
        return t("onboarding.report.title");
      case "preset":
        return t("onboarding.preset.title");
      case "migration":
        return t("onboarding.migration.title");
      case "connect":
        return t("onboarding.connect.title");
      case "complete":
        return t("onboarding.finish.title");
    }
  };

  const isFullscreenStep = isFullscreenOnboardingStep(step);
  const shouldAnimateStepTransition = useCallback(
    (from: OnboardingStep, to: OnboardingStep) =>
      // 表示モード切り替えを跨ぐ場合はアニメーションを無効化してちらつきを防ぐ。
      isFullscreenOnboardingStep(from) === isFullscreenOnboardingStep(to),
    [],
  );

  const onboardingModeClass = isFullscreenStep
    ? "onboarding-mode-fullscreen"
    : "onboarding-mode-spotlight";

  return (
    <div className={`install-wizard onboarding-wizard ${onboardingModeClass}`}>
      <div className="onboarding-main-container">
        <div className="onboarding-header">
          <div className="onboarding-title">{getStepTitle(step)}</div>
          {step !== "complete" && (
            <button type="button" className="text-button" onClick={handleSkip}>
              {t("common.skip")} &gt;
            </button>
          )}
        </div>
        <div className="onboarding-slide-container">
          <StepTransition step={step} shouldAnimateTransition={shouldAnimateStepTransition}>
            {renderStep}
          </StepTransition>
        </div>
      </div>
    </div>
  );
}
