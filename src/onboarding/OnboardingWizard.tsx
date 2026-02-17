import { useCallback, useEffect, useState } from "react";
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
}

const isFullscreenOnboardingStep = (candidate: OnboardingStep): boolean =>
  candidate === "welcome" || candidate === "connect" || candidate === "complete";

export default function OnboardingWizard({ onComplete, onStepChange }: OnboardingWizardProps) {
  const [step, setStep] = useState<OnboardingStep>("welcome");
  // Note: ideally we should lift locale state up if we want dynamic language switching,
  // but for now reusing resolveInitialLocale is fine as it respects saved setting.
  const t = createTranslator(resolveInitialLocale());

  useEffect(() => {
    onStepChange?.(step);
  }, [onStepChange, step]);

  const handleNext = useCallback(() => {
    switch (step) {
      case "welcome":
        setStep("launch");
        break;
      case "launch":
        setStep("reporting");
        break;
      case "reporting":
        setStep("preset");
        break;
      case "preset":
        setStep("migration");
        break;
      case "migration":
        setStep("connect");
        break;
      case "connect":
        setStep("complete");
        break;
      case "complete":
        onComplete("complete");
        break;
    }
  }, [step, onComplete]);

  const handleBack = useCallback(() => {
    switch (step) {
      case "launch":
        setStep("welcome");
        break;
      case "reporting":
        setStep("launch");
        break;
      case "preset":
        setStep("reporting");
        break;
      case "migration":
        setStep("preset");
        break;
      case "connect":
        setStep("migration");
        break;
      case "complete":
        setStep("connect");
        break;
      default:
        break;
    }
  }, [step]);

  const handleSkip = useCallback(() => {
    onComplete("skip");
  }, [onComplete]);

  const renderStep = (s: OnboardingStep, _isExiting: boolean, _direction: "forward" | "back") => {
    const commonProps = {
      t,
      onNext: handleNext,
      onBack: s === "welcome" ? undefined : handleBack,
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
