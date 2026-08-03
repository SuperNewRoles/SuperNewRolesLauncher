import { useEffect, useState } from "react";
import type { MessageKey } from "../../i18n";

// bootstrap.tsx の locale-switch 入場アニメーション機構を再利用して
// リロード後のメイン画面にもフェードイン演出を適用する
const RELOAD_ENTRANCE_ANIMATION_FLAG = "ui.localeSwitchReloadAnimation";
const INSTALL_FLOW_HOME_AFTER_RELOAD_FLAG_KEY = "ui.installFlowHomeAfterReload";

// 完了画面のフェードアウト時間。CSS と揃えている。
const LEAVE_ANIMATION_MS = 280;

interface CompleteStepProps {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  importSkippedAfterFailure: boolean;
  importSkipReason: string | null;
}

function SuccessIcon() {
  // 完了アイコンは単純な SVG で描画し、テーマ色に追従させる。
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
    // 入場アニメーションのために本文表示を少し遅らせる。
    const timer = setTimeout(() => setShowContent(true), 320);
    return () => clearTimeout(timer);
  }, []);

  const handleNext = () => {
    // 連打による重複遷移を防止する。
    if (leaving) return;
    setLeaving(true);
    window.setTimeout(() => {
      try {
        // リロード後のメインレイアウトにフェードイン演出を適用するフラグ
        sessionStorage.setItem(RELOAD_ENTRANCE_ANIMATION_FLAG, "1");
        sessionStorage.setItem(INSTALL_FLOW_HOME_AFTER_RELOAD_FLAG_KEY, "1");
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
