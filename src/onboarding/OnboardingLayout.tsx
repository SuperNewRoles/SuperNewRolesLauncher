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
  // 各ステップで共通の本文レイアウトとフッター操作を提供する。
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
          // 戻るボタンがないステップでも左右バランスを保つための空要素。
          <div /> /* Spacer */
        )}
        <button type="button" className="primary" onClick={onNext} disabled={nextDisabled}>
          {/* 最終ステップのみ文言を「開始」に切り替える。 */}
          {nextLabel || (isLastStep ? t("onboarding.start") : t("common.next"))}
        </button>
      </div>
    </div>
  );
}
