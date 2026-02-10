import type { createTranslator } from "../i18n";

export type OnboardingStep =
  | "welcome"
  | "launch"
  | "reporting"
  | "preset"
  | "migration"
  | "connect"
  | "complete";

export const STEP_ORDER: Record<OnboardingStep, number> = {
  welcome: 0,
  launch: 1,
  reporting: 2,
  preset: 3,
  migration: 4,
  connect: 5,
  complete: 6,
};

export type Translator = ReturnType<typeof createTranslator>;

export interface OnboardingStepProps {
  t: Translator;
  onNext: () => void;
  onBack?: () => void;
  onSkip?: () => void;
}
