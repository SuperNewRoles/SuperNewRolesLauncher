import { OnboardingLayout } from "../OnboardingLayout";
import type { OnboardingStepProps } from "../types";

export function ReportStep({ t, onNext, onBack, onSkip }: OnboardingStepProps) {
  return (
    <OnboardingLayout
      t={t}
      title={t("onboarding.report.title")}
      image={<div style={{ fontSize: "64px", textAlign: "center" }}>🐛</div>}
      onNext={onNext}
      onBack={onBack}
      onSkip={onSkip}
    >
      {t("onboarding.report.body")}
    </OnboardingLayout>
  );
}
