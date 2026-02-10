import { OnboardingLayout } from "../OnboardingLayout";
import type { OnboardingStepProps } from "../types";

export function WelcomeStep({ t, onNext, onSkip }: OnboardingStepProps) {
  return (
    <OnboardingLayout
      t={t}
      title={t("onboarding.welcome.title")}
      image={<div style={{ fontSize: "64px", textAlign: "center" }}>👋</div>}
      onNext={onNext}
      onSkip={onSkip}
    >
      {t("onboarding.welcome.body")}
    </OnboardingLayout>
  );
}
