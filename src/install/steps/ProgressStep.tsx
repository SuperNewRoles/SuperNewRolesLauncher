import type { MessageKey } from "../../i18n";

interface ProgressStepProps {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  progress: number;
  message: string;
}

export default function ProgressStep({ t, progress, message }: ProgressStepProps) {
  return (
    <div className="install-step install-step-progress">
      <h2 className="step-title">{t("installFlow.installing")}</h2>
      <div className="progress-character">
        <div className="among-us-character" />
      </div>
      <div className="progress-bar-container">
        <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
        <span className="progress-message">{message || t("installFlow.processing")}</span>
      </div>
      <span className="progress-percent">{Math.round(progress)}%</span>
    </div>
  );
}
