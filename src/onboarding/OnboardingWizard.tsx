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
  candidate === "welcome" || candidate === "connect" || candidate === "complete";

export default function OnboardingWizard({
  onComplete,
  onStepChange,
  reportingEnabled = true,
  presetsEnabled = true,
  migrationEnabled = true,
}: OnboardingWizardProps) {
  const steps = useMemo<OnboardingStep[]>(() => {
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
  const step = steps[stepIndex] ?? "welcome";

  useEffect(() => {
    onStepChange?.(step);
  }, [onStepChange, step]);

  useEffect(() => {
    setStepIndex((index) => Math.min(index, steps.length - 1));
  }, [steps]);

  const handleNext = useCallback(() => {
    if (stepIndex >= steps.length - 1) {
      onComplete("complete");
      return;
    }
    setStepIndex((index) => Math.min(index + 1, steps.length - 1));
  }, [onComplete, stepIndex, steps.length]);

  const handleBack = useCallback(() => {
    setStepIndex((index) => Math.max(0, index - 1));
  }, []);

  const handleSkip = useCallback(() => {
    onComplete("skip");
  }, [onComplete]);

  const renderStep = (s: OnboardingStep, _isExiting: boolean, _direction: "forward" | "back") => {
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
