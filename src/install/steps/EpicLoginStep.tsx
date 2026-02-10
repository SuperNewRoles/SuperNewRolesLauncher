import type { MessageKey } from "../../i18n";

interface EpicLoginStepProps {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  epicLoggedIn: boolean;
  epicUserDisplay?: string | null;
  onEpicLogin: () => Promise<void>;
  onRefreshStatus: () => Promise<void>;
  onDone: () => void;
  onBack: () => void;
}

export default function EpicLoginStep({
  t,
  epicLoggedIn,
  epicUserDisplay,
  onEpicLogin,
  onRefreshStatus,
  onDone,
  onBack,
}: EpicLoginStepProps) {
  const handleLogin = async () => {
    try {
      await onEpicLogin();
      await onRefreshStatus();
    } catch {
      // error handled by event listener
    }
  };

  return (
    <div className="install-step install-step-epic-login">
      <button type="button" className="btn-back" onClick={onBack}>
        ← {t("installFlow.back")}
      </button>

      <div className="epic-login-container">
        <div className="epic-login-header">
          <div className="epic-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2v-2h2v2zm0-4h-2V7h2v6zm4 4h-2v-2h2v2zm0-4h-2V7h2v6z"
                fill="currentColor"
              />
              <circle cx="12" cy="12" r="3" fill="currentColor" />
            </svg>
          </div>
          <h2 className="step-title">{t("installFlow.epicLogin")}</h2>
        </div>

        <p className="epic-hint">{t("installFlow.epicLoginRequired")}</p>

        <div className="epic-login-card">
          {epicLoggedIn ? (
            <div className="epic-logged-in">
              <div className="epic-status-icon">✓</div>
              <div className="epic-status-content">
                <p className="epic-status-label">{t("epic.loggedInLabel")}</p>
                <p className="epic-status success">{epicUserDisplay || "User"}</p>
              </div>
              <button type="button" className="btn-primary btn-next" onClick={onDone}>
                {t("installFlow.next")}
                <span className="btn-arrow">→</span>
              </button>
            </div>
          ) : (
            <div className="epic-login-form">
              <div className="epic-login-info">
                <div className="epic-login-info-icon">🔐</div>
                <p className="epic-login-info-text">{t("epic.loginDescription")}</p>
              </div>
              <button type="button" className="btn-primary btn-login" onClick={handleLogin}>
                <span className="btn-icon">🌐</span>
                {t("epic.loginWebview")}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
