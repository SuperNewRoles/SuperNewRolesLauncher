import { OnboardingLayout } from "../OnboardingLayout";
import type { OnboardingStepProps } from "../types";

export function LaunchStep({ t, onNext, onBack, onSkip }: OnboardingStepProps) {
  // ランチャー利用の最初の流れを簡潔に説明するステップ。
  return (
    <OnboardingLayout
      t={t}
      // 起動フェーズであることを視覚的に伝える。
      image={<div className="placeholder-icon">🚀</div>}
      onNext={onNext}
      onBack={onBack}
    >
      {t("onboarding.launch.body")}
    </OnboardingLayout>
  );
}
