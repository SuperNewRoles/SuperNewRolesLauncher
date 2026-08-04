import { Twemoji } from "../../app/Twemoji";
import { OnboardingLayout } from "../OnboardingLayout";
import type { OnboardingStepProps } from "../types";

export function CompleteStep({ t, onNext, onBack }: OnboardingStepProps) {
  // 最終ステップとして開始ボタンラベルに切り替える。
  return (
    <OnboardingLayout
      t={t}
      // 最終到達感を出すため、完了アイコンを表示する。
      image={
        <div className="placeholder-icon">
          <Twemoji emoji="🎉" />
        </div>
      }
      onNext={onNext}
      onBack={onBack}
      isLastStep
    >
      {t("onboarding.finish.body")}
    </OnboardingLayout>
  );
}
