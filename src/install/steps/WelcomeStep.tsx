import type { LocaleCode } from "../../i18n";
import type { MessageKey } from "../../i18n";

interface WelcomeStepProps {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  locale: LocaleCode;
  onLocaleChange: (locale: LocaleCode) => void;
  onStart: () => void;
  localeOptions: { value: LocaleCode; label: string }[];
}

export default function WelcomeStep({
  t,
  locale,
  onLocaleChange,
  onStart,
  localeOptions,
}: WelcomeStepProps) {
  return (
    <div className="install-step install-step-welcome">
      <div className="welcome-bg-pattern" />
      <div className="welcome-content">
        <h1 className="welcome-title">SuperNewRoles Launcher</h1>
        <p className="welcome-message">{t("installFlow.welcome")}</p>
        <p className="welcome-hint">{t("installFlow.welcomeHint")}</p>
        <div className="welcome-controls">
          <select
            className="locale-select"
            value={locale}
            onChange={(e) =>
              onLocaleChange((e.target.value as LocaleCode) ?? locale)
            }
          >
            {localeOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn-primary" onClick={onStart}>
            {t("installFlow.start")}
          </button>
        </div>
      </div>
    </div>
  );
}
