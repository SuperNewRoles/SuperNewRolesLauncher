import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from "react";

export type ReportModalStep = "type" | "details" | "confirm";

const STEP_ORDER: Record<ReportModalStep, number> = {
  type: 0,
  details: 1,
  confirm: 2,
};

const TRANSITION_MS = 420;

interface ReportStepTransitionProps {
  step: ReportModalStep;
  children: (step: ReportModalStep) => ReactNode;
}

export function ReportStepTransition({ step, children }: ReportStepTransitionProps) {
  const [displayStep, setDisplayStep] = useState<ReportModalStep>(step);
  const [prevStep, setPrevStep] = useState<ReportModalStep | null>(null);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const currentStepRef = useRef<ReportModalStep>(step);

  useEffect(() => {
    if (step === currentStepRef.current) {
      return;
    }

    const fromStep = currentStepRef.current;
    const isForward = STEP_ORDER[step] > STEP_ORDER[fromStep];
    setDirection(isForward ? "forward" : "back");
    setPrevStep(fromStep);
    setDisplayStep(step);
    currentStepRef.current = step;

    const timer = window.setTimeout(() => setPrevStep(null), TRANSITION_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [step]);

  return (
    <div
      className="report-step-transition-container"
      style={{ "--transition-ms": `${TRANSITION_MS}ms` } as CSSProperties}
    >
      {prevStep !== null && (
        <div
          className={`report-step-transition-slide report-step-exit report-step-exit-${direction}`}
          key={`exit-${prevStep}`}
        >
          {children(prevStep)}
        </div>
      )}
      <div
        className={`report-step-transition-slide report-step-enter report-step-enter-${direction}`}
        key={`enter-${displayStep}`}
      >
        {children(displayStep)}
      </div>
    </div>
  );
}
