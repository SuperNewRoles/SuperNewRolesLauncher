import { OnboardingLayout } from "../OnboardingLayout";
import type { OnboardingStepProps } from "../types";

export function CompleteStep({ t, onNext, onBack }: OnboardingStepProps) {
  return (
    <OnboardingLayout
      t={t}
      image={<div className="placeholder-icon">🎉</div>}
      onNext={onNext}
      onBack={onBack}
      isLastStep
    >
      {t("onboarding.finish.body")}
    </OnboardingLayout>
  );
}
