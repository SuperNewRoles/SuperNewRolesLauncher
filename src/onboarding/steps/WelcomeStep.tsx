import { Twemoji } from "../../app/Twemoji";
import { OnboardingLayout } from "../OnboardingLayout";
import type { OnboardingStepProps } from "../types";

export function WelcomeStep({ t, onNext }: OnboardingStepProps) {
  // 導入開始時の歓迎メッセージを表示する。
  return (
    <OnboardingLayout
      t={t}
      // 最初の導入画面であることを示す挨拶アイコンを表示する。
      image={
        <div className="placeholder-icon">
          <Twemoji emoji="👋" />
        </div>
      }
      onNext={onNext}
    >
      {t("onboarding.welcome.body")}
    </OnboardingLayout>
  );
}
