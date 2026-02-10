import { OnboardingLayout } from "../OnboardingLayout";
import type { OnboardingStepProps } from "../types";

export function WelcomeStep({ t, onNext, onSkip }: OnboardingStepProps) {
  return (
    <OnboardingLayout t={t} image={<div className="placeholder-icon">👋</div>} onNext={onNext}>
      {t("onboarding.welcome.body")}
    </OnboardingLayout>
  );
}
