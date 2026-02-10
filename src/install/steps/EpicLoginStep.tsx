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
      <h2 className="step-title">{t("installFlow.epicLogin")}</h2>
      <p className="epic-hint">{t("installFlow.epicLoginRequired")}</p>
      {epicLoggedIn ? (
        <div className="epic-logged-in">
          <p className="epic-status success">{t("epic.loggedIn", { user: epicUserDisplay || "✓" })}</p>
          <button type="button" className="btn-primary" onClick={onDone}>
            {t("installFlow.next")}
          </button>
        </div>
      ) : (
        <div className="epic-login-form">
          <button type="button" className="btn-primary" onClick={handleLogin}>
            {t("epic.loginWebview")}
          </button>
        </div>
      )}
    </div>
  );
}
