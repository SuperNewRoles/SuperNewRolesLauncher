import { OnboardingLayout } from "../OnboardingLayout";
import type { OnboardingStepProps } from "../types";

export function MigrationStep({ t, onNext, onBack, onSkip }: OnboardingStepProps) {
  return (
    <OnboardingLayout
      t={t}
      title={t("onboarding.migration.title")}
      image={<div style={{ fontSize: "64px", textAlign: "center" }}>📦</div>}
      onNext={onNext}
      onBack={onBack}
      onSkip={onSkip}
    >
      {t("onboarding.migration.body")}
    </OnboardingLayout>
  );
}
