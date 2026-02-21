import { type ReactNode, useEffect, useRef, useState } from "react";
import type { OnboardingStep } from "./types";
import { STEP_ORDER } from "./types";

// ステップ遷移アニメーション時間。
const TRANSITION_MS = 420;

interface StepTransitionProps {
  step: OnboardingStep;
  children: (step: OnboardingStep, isExiting: boolean, direction: "forward" | "back") => ReactNode;
  shouldAnimateTransition?: (from: OnboardingStep, to: OnboardingStep) => boolean;
}

export default function StepTransition({
  step,
  children,
  shouldAnimateTransition,
}: StepTransitionProps) {
  const [displayStep, setDisplayStep] = useState<OnboardingStep>(step);
  const [prevStep, setPrevStep] = useState<OnboardingStep | null>(null);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [isAnimating, setIsAnimating] = useState(false);
  const [animateCurrentStep, setAnimateCurrentStep] = useState(false);
  const currentStepRef = useRef<OnboardingStep>(step);

  useEffect(() => {
    if (step === currentStepRef.current) return;

    const fromStep = currentStepRef.current;
    // 呼び出し側で抑止指定がある場合は即時切り替えにする。
    const shouldAnimate = shouldAnimateTransition?.(fromStep, step) ?? true;
    const isForward = STEP_ORDER[step] > STEP_ORDER[fromStep];
    setDirection(isForward ? "forward" : "back");
    setDisplayStep(step);
    currentStepRef.current = step;
    if (!shouldAnimate) {
      setPrevStep(null);
      setIsAnimating(false);
      setAnimateCurrentStep(false);
      return;
    }

    setAnimateCurrentStep(true);
    setPrevStep(fromStep);
    setIsAnimating(true);

    // 退場ステップはアニメーション完了後に破棄する。
    const t = window.setTimeout(() => {
      setPrevStep(null);
      setIsAnimating(false);
      setAnimateCurrentStep(false);
    }, TRANSITION_MS);
    return () => window.clearTimeout(t);
  }, [step, shouldAnimateTransition]);

  return (
    <div
      className={`step-transition-container${isAnimating ? " is-animating" : ""}`}
      style={{ "--transition-ms": `${TRANSITION_MS}ms` } as React.CSSProperties}
    >
      {prevStep != null && (
        <div
          className={`step-transition-slide step-exit step-exit-${direction}`}
          key={`exit-${prevStep}`}
        >
          {children(prevStep, true, direction)}
        </div>
      )}
      <div
        className={
          animateCurrentStep
            ? `step-transition-slide step-enter step-enter-${direction}`
            : // アニメーション不要時は static クラスで即時表示する。
              "step-transition-slide step-static"
        }
        key={displayStep}
      >
        {children(displayStep, false, direction)}
      </div>
    </div>
  );
}
