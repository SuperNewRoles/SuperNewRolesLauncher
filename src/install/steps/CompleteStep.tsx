import { useEffect, useState } from "react";
import type { MessageKey } from "../../i18n";

interface CompleteStepProps {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  onNext: () => void;
}

function Confetti() {
  const [particles] = useState(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 1.2,
      duration: 1.5 + Math.random() * 1.5,
      size: 6 + Math.random() * 8,
      color: ["#2278c8", "#19764c", "#f59f00", "#e03131", "#7048e8", "#1098ad", "#f06595"][
        Math.floor(Math.random() * 7)
      ],
      rotation: Math.random() * 360,
      drift: (Math.random() - 0.5) * 80,
    })),
  );

  return (
    <div className="confetti-container" aria-hidden="true">
      {particles.map((p) => (
        <div
          key={p.id}
          className="confetti-particle"
          style={{
            left: `${p.left}%`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            width: `${p.size}px`,
            height: `${p.size * 1.4}px`,
            backgroundColor: p.color,
            "--drift": `${p.drift}px`,
            "--rotation": `${p.rotation}deg`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

function SuccessRing() {
  return (
    <div className="success-ring-container">
      <svg className="success-ring" viewBox="0 0 120 120" width="160" height="160">
        <circle
          className="success-ring-bg"
          cx="60"
          cy="60"
          r="54"
          fill="none"
          stroke="#e8f5e9"
          strokeWidth="6"
        />
        <circle
          className="success-ring-progress"
          cx="60"
          cy="60"
          r="54"
          fill="none"
          stroke="#19764c"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray="339.3"
          strokeDashoffset="339.3"
        />
      </svg>
      <div className="success-icon-wrapper">
        <img
          src="https://cdn.jsdelivr.net/gh/twitter/twemoji@latest/assets/svg/2705.svg"
          alt="✅"
          className="success-twemoji"
        />
      </div>
    </div>
  );
}

export default function CompleteStep({ t, onNext }: CompleteStepProps) {
  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 600);
    return () => clearTimeout(timer);
  }, []);

  const handleNext = () => {
    onNext();
    window.location.reload();
  };

  return (
    <div className="install-step install-step-complete">
      <SuccessRing />
      <div className={`complete-text-area ${showContent ? "visible" : ""}`}>
        <h2 className="complete-title">{t("installFlow.complete")}</h2>
        <p className="complete-message">{t("installFlow.completeMessage")}</p>
        <p className="complete-hint">{t("installFlow.completeHint")}</p>
      </div>
      <div className={`complete-actions ${showContent ? "visible" : ""}`}>
        <button type="button" className="btn-primary btn-launcher" onClick={handleNext}>
          <span className="btn-launcher-icon">🚀</span>
          {t("installFlow.goToLauncher")}
        </button>
      </div>
    </div>
  );
}
