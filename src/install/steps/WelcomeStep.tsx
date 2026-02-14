import type { ThemePreference } from "../../app/theme";
import type { LocaleCode } from "../../i18n";
import type { MessageKey } from "../../i18n";

interface WelcomeStepProps {
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
  locale: LocaleCode;
  onLocaleChange: (locale: LocaleCode) => void;
  onStart: () => void;
  error?: string | null;
  localeOptions: { value: LocaleCode; label: string }[];
  theme: ThemePreference;
  onThemeChange: (theme: ThemePreference) => void;
}

export default function WelcomeStep({
  t,
  locale,
  onLocaleChange,
  onStart,
  error,
  localeOptions,
  theme,
  onThemeChange,
}: WelcomeStepProps) {
  return (
    <div className="install-step install-step-welcome">
      <div className="welcome-content">
        <h1 className="welcome-title">SuperNewRoles Launcher</h1>
        <p className="welcome-message">{t("installFlow.welcome")}</p>
        <p className="welcome-hint">{t("installFlow.welcomeHint")}</p>
        <div className="welcome-controls">
          <div className="welcome-settings-row">
            <div className="theme-toggle">
              <span className="theme-label">{t("theme.label")}</span>
              <div className="theme-buttons">
                <button
                  type="button"
                  className={`theme-btn ${theme === "system" ? "active" : ""}`}
                  onClick={() => onThemeChange("system")}
                  title={t("theme.system")}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <line x1="8" y1="21" x2="16" y2="21" />
                    <line x1="12" y1="17" x2="12" y2="21" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`theme-btn ${theme === "light" ? "active" : ""}`}
                  onClick={() => onThemeChange("light")}
                  title={t("theme.light")}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="5" />
                    <line x1="12" y1="1" x2="12" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="23" />
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                    <line x1="1" y1="12" x2="3" y2="12" />
                    <line x1="21" y1="12" x2="23" y2="12" />
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                  </svg>
                </button>
                <button
                  type="button"
                  className={`theme-btn ${theme === "dark" ? "active" : ""}`}
                  onClick={() => onThemeChange("dark")}
                  title={t("theme.dark")}
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                </button>
              </div>
            </div>
            <select
              className="locale-select"
              value={locale}
              onChange={(e) => onLocaleChange((e.target.value as LocaleCode) ?? locale)}
            >
              {localeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <button type="button" className="btn-primary" onClick={onStart}>
            {t("installFlow.start")}
          </button>
          {error && <p className="step-error">{error}</p>}
        </div>
      </div>
    </div>
  );
}
