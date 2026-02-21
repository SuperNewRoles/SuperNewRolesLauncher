import { useEffect, useState } from "react";
import type { MessageKey } from "../../i18n";

// bootstrap.tsx の locale-switch 入場アニメーション機構を再利用して
// リロード後のメイン画面にもフェードイン演出を適用する
const RELOAD_ENTRANCE_ANIMATION_FLAG = "ui.localeSwitchReloadAnimation";
const GOTO_HOME_AFTER_INSTALL_RELOAD_FLAG = "ui.installFlowHomeAfterReload";

const LEAVE_ANIMATION_MS = 280;

interface CompleteStepProps {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  importSkippedAfterFailure: boolean;
  importSkipReason: string | null;
}

function Confetti() {
  const [particles] = useState(() =>
    Array.from({ length: 40 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 0.8,
      duration: 1.0 + Math.random() * 1.1,
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
          style={
            {
              left: `${p.left}%`,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              width: `${p.size}px`,
              height: `${p.size * 1.4}px`,
              backgroundColor: p.color,
              "--drift": `${p.drift}px`,
              "--rotation": `${p.rotation}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

function SuccessIcon() {
  return (
    <div className="success-icon-container">
      <svg
        className="success-icon"
        viewBox="0 0 64 64"
        width="64"
        height="64"
        fill="none"
        role="img"
        aria-label="complete icon"
      >
        <circle cx="32" cy="32" r="30" fill="var(--success)" opacity="0.1" />
        <circle cx="32" cy="32" r="24" fill="var(--success)" opacity="0.15" />
        <path
          d="M20 34L28 42L44 24"
          stroke="var(--success)"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

export default function CompleteStep({
  t,
  importSkippedAfterFailure,
  importSkipReason,
}: CompleteStepProps) {
  const [showContent, setShowContent] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setShowContent(true), 320);
    return () => clearTimeout(timer);
  }, []);

  const handleNext = () => {
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => {
      try {
        // リロード後のメインレイアウトにフェードイン演出を適用するフラグ
        sessionStorage.setItem(RELOAD_ENTRANCE_ANIMATION_FLAG, "1");
        sessionStorage.setItem(GOTO_HOME_AFTER_INSTALL_RELOAD_FLAG, "1");
      } catch {
        // storage failure は無視
      }
      window.location.reload();
    }, LEAVE_ANIMATION_MS);
  };

  return (
    <div className={`install-step install-step-complete${leaving ? " leaving" : ""}`}>
      <SuccessIcon />
      <div className={`complete-text-area ${showContent ? "visible" : ""}`}>
        <h2 className="complete-title">{t("installFlow.complete")}</h2>
        <p className="complete-message">{t("installFlow.completeMessage")}</p>
        <p className="complete-hint">{t("installFlow.completeHint")}</p>
        {importSkippedAfterFailure && (
          <p className="complete-import-warning">
            {t("installFlow.importSkippedNotice", {
              reason: importSkipReason || t("common.unset"),
            })}
          </p>
        )}
      </div>
      <div className={`complete-actions ${showContent && !leaving ? "visible" : ""}`}>
        <button type="button" className="btn-primary" onClick={handleNext} disabled={leaving}>
          {t("installFlow.next")}
        </button>
      </div>
    </div>
  );
}
