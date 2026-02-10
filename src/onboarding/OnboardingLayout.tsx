import type { ReactNode } from "react";
import type { createTranslator } from "../i18n";

type Translator = ReturnType<typeof createTranslator>;

interface OnboardingLayoutProps {
  t: Translator;
  image?: ReactNode; // Or URL string
  children: ReactNode; // Description content
  onNext: () => void;
  onBack?: () => void;

  onSkip?: () => void;
  nextLabel?: string;
  backLabel?: string;
  isLastStep?: boolean;
  nextDisabled?: boolean;
}

export function OnboardingLayout({
  t,
  image,
  children,
  onNext,
  onBack,
  nextLabel,
  backLabel,
  isLastStep,
  nextDisabled,
}: OnboardingLayoutProps) {
  return (
    <div className="onboarding-layout">
      <div className="onboarding-content">
        <div className="onboarding-image-container">{image}</div>
        <div className="onboarding-description">{children}</div>
      </div>

      <div className="onboarding-footer">
        {onBack ? (
          <button type="button" className="secondary" onClick={onBack}>
            {backLabel || t("common.back")}
          </button>
        ) : (
          <div /> /* Spacer */
        )}
        <button type="button" className="primary" onClick={onNext} disabled={nextDisabled}>
          {nextLabel || (isLastStep ? t("onboarding.start") : t("common.next"))}
        </button>
      </div>
    </div>
  );
}
