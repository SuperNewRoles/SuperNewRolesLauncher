import { OnboardingLayout } from "../OnboardingLayout";
import type { OnboardingStepProps } from "../types";

export function ReportStep({ t, onNext, onBack, onSkip }: OnboardingStepProps) {
  // 不具合報告導線の存在をオンボーディング中に周知する。
  return (
    <OnboardingLayout
      t={t}
      // 報告ステップだと一目で分かる虫アイコンを使う。
      image={<div className="placeholder-icon">🐛</div>}
      onNext={onNext}
      onBack={onBack}
    >
      {t("onboarding.report.body")}
    </OnboardingLayout>
  );
}
