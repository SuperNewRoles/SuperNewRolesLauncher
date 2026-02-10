import { OnboardingLayout } from "../OnboardingLayout";
import type { OnboardingStepProps } from "../types";

export function CompleteStep({ t, onNext, onBack }: OnboardingStepProps) {
  return (
    <OnboardingLayout
      t={t}
      title={t("onboarding.finish.title")}
      image={<div style={{ fontSize: "64px", textAlign: "center" }}>🎉</div>}
      onNext={onNext}
      onBack={onBack}
      isLastStep
    >
      {t("onboarding.finish.body")}
    </OnboardingLayout>
  );
}
