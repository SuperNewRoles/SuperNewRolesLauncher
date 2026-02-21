import { MOD_SHORT_NAME } from "../../app/modConfig";
import logo from "../../assets/snr_logo.png";
import type { MessageKey } from "../../i18n";

interface ProgressStepProps {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  progress: number;
  message: string;
}

export default function ProgressStep({ t, progress, message }: ProgressStepProps) {
  // 進捗率と説明文を同時表示し、現在の処理段階を把握しやすくする。
  return (
    <div className="install-step install-step-progress">
      <h2 className="step-title">{t("installFlow.installing")}</h2>
      <div className="progress-character">
        <img src={logo} alt={`${MOD_SHORT_NAME} Logo`} className="among-us-character-img" />
      </div>
      <div className="progress-bar-container">
        {/* progress は親で 0-100 に丸め済みの値を受け取る前提。 */}
        <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
      </div>
      <div className="progress-meta">
        <span className="progress-message">{message || t("installFlow.processing")}</span>
        <span className="progress-percent">{Math.round(progress)}%</span>
      </div>
    </div>
  );
}
