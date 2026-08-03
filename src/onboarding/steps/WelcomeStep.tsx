import { OnboardingLayout } from "../OnboardingLayout";
import type { OnboardingStepProps } from "../types";

export function WelcomeStep({ t, onNext }: OnboardingStepProps) {
  // 導入開始時の歓迎メッセージを表示する。
  return (
    <OnboardingLayout
      t={t}
      // 最初の導入画面であることを示す挨拶アイコン。
      image={<div className="placeholder-icon">👋</div>}
      onNext={onNext}
    >
      {t("onboarding.welcome.body")}
    </OnboardingLayout>
  );
}
