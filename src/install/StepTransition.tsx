import { type ReactNode, useEffect, useRef, useState } from "react";
import type { InstallStep } from "./types";
import { STEP_ORDER } from "./types";

// ステップ切り替えアニメーションの時間。
const TRANSITION_MS = 420;

interface StepTransitionProps {
  step: InstallStep;
  children: (step: InstallStep, isExiting: boolean, direction: "forward" | "back") => ReactNode;
}

export default function StepTransition({ step, children }: StepTransitionProps) {
  const [displayStep, setDisplayStep] = useState<InstallStep>(step);
  const [prevStep, setPrevStep] = useState<InstallStep | null>(null);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  // 直前ステップを ref で保持し、描画順に依存せず方向判定する。
  const currentStepRef = useRef<InstallStep>(step);

  useEffect(() => {
    if (step === currentStepRef.current) return;

    // STEP_ORDER の大小で前進/後退を判定し、入れ替え方向を決める。
    const fromStep = currentStepRef.current;
    const isForward = STEP_ORDER[step] > STEP_ORDER[fromStep];
    setDirection(isForward ? "forward" : "back");
    setPrevStep(fromStep);
    setDisplayStep(step);
    currentStepRef.current = step;

    // 退出中の旧ステップは一定時間後に破棄する。
    const t = window.setTimeout(() => setPrevStep(null), TRANSITION_MS);
    return () => window.clearTimeout(t);
  }, [step]);

  return (
    <div
      className="step-transition-container"
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
      <div className={`step-transition-slide step-enter step-enter-${direction}`} key={displayStep}>
        {children(displayStep, false, direction)}
      </div>
    </div>
  );
}
