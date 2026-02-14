import { OnboardingLayout } from "../OnboardingLayout";
import type { OnboardingStepProps } from "../types";

export function LaunchStep({ t, onNext, onBack, onSkip }: OnboardingStepProps) {
  return (
    <OnboardingLayout
      t={t}
      image={<div className="placeholder-icon">🚀</div>}
      onNext={onNext}
      onBack={onBack}
    >
      {t("onboarding.launch.body")}
    </OnboardingLayout>
  );
}
