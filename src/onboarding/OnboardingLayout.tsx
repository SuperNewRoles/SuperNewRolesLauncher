import type { ReactNode } from "react";
import type { createTranslator } from "../i18n";

type Translator = ReturnType<typeof createTranslator>;

interface OnboardingLayoutProps {
  t: Translator;
  title?: string;
  image?: ReactNode; // Or URL string
  children: ReactNode; // Description content
  onNext: () => void;
  onBack?: () => void;
  onSkip?: () => void;
  nextLabel?: string;
  backLabel?: string;
  isLastStep?: boolean;
}

export function OnboardingLayout({
  t,
  title,
  image,
  children,
  onNext,
  onBack,
  onSkip,
  nextLabel,
  backLabel,
  isLastStep,
}: OnboardingLayoutProps) {
  return (
    <div className="onboarding-layout">
      <div className="onboarding-header">
        <div className="onboarding-title">{title}</div>
        {onSkip && (
          <button type="button" className="text-button" onClick={onSkip}>
            {t("common.skip")} &gt;
          </button>
        )}
      </div>

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
        <button type="button" className="primary" onClick={onNext}>
          {nextLabel || (isLastStep ? t("onboarding.start") : t("common.next"))}
        </button>
      </div>
    </div>
  );
}
