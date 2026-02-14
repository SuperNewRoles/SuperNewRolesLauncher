import { type ReactNode, useEffect, useState } from "react";
import type { InstallStep } from "./types";
import { STEP_ORDER } from "./types";

const TRANSITION_MS = 420;

interface StepTransitionProps {
  step: InstallStep;
  children: (step: InstallStep, isExiting: boolean, direction: "forward" | "back") => ReactNode;
}

export default function StepTransition({ step, children }: StepTransitionProps) {
  const [displayStep, setDisplayStep] = useState<InstallStep>(step);
  const [prevStep, setPrevStep] = useState<InstallStep | null>(null);
  const [direction, setDirection] = useState<"forward" | "back">("forward");

  useEffect(() => {
    if (step === displayStep && prevStep === null) return;

    const isForward = STEP_ORDER[step] > STEP_ORDER[displayStep];
    setDirection(isForward ? "forward" : "back");
    setPrevStep(displayStep);
    setDisplayStep(step);

    const t = setTimeout(() => setPrevStep(null), TRANSITION_MS);
    return () => clearTimeout(t);
  }, [step, displayStep, prevStep]);

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
