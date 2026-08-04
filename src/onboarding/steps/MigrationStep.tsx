import { Twemoji } from "../../app/Twemoji";
import { OnboardingLayout } from "../OnboardingLayout";
import type { OnboardingStepProps } from "../types";

export function MigrationStep({ t, onNext, onBack }: OnboardingStepProps) {
  // 移行機能の概要を案内する説明ステップ。
  return (
    <OnboardingLayout
      t={t}
      // データ移行を連想しやすい箱アイコンを使う。
      image={
        <div className="placeholder-icon">
          <Twemoji emoji="📦" />
        </div>
      }
      onNext={onNext}
      onBack={onBack}
    >
      {t("onboarding.migration.body")}
    </OnboardingLayout>
  );
}
