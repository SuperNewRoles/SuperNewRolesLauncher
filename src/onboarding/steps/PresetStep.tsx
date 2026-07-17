import { OnboardingLayout } from "../OnboardingLayout";
import type { OnboardingStepProps } from "../types";

export function PresetStep({ t, onNext, onBack }: OnboardingStepProps) {
  // プリセット保存・呼び出し機能を紹介する。
  return (
    <OnboardingLayout
      t={t}
      // 保存機能の文脈に合わせてストレージ系アイコンを表示する。
      image={<div className="placeholder-icon">💾</div>}
      onNext={onNext}
      onBack={onBack}
    >
      {t("onboarding.preset.body")}
    </OnboardingLayout>
  );
}
