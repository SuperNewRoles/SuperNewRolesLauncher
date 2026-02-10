import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import { launchShortcutCreate } from "../../app/services/tauriClient";
import { OnboardingLayout } from "../OnboardingLayout";
import type { OnboardingStepProps } from "../types";

export function ConnectStep({ t, onNext, onBack, onSkip }: OnboardingStepProps) {
  const [shortcutStatus, setShortcutStatus] = useState<string | null>(null);

  const handleDiscord = () => openUrl("https://discord.gg/Cqfwx82ynN");
  const handleTwitter = () => openUrl("https://x.com/SuperNewRoles");
  const handleShortcut = async () => {
    try {
      setShortcutStatus("Creating...");
      await launchShortcutCreate();
      setShortcutStatus(t("onboarding.connect.shortcutCreated"));
    } catch (e) {
      setShortcutStatus(`Error: ${e}`);
    }
  };

  return (
    <OnboardingLayout
      t={t}
      title={t("onboarding.connect.title")}
      onNext={onNext}
      onBack={onBack}
      onSkip={onSkip}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "16px", alignItems: "center" }}>
        <div>{t("onboarding.connect.body")}</div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", justifyContent: "center" }}>
          <button type="button" className="secondary" onClick={handleDiscord}>
            Discord
          </button>
          <button type="button" className="secondary" onClick={handleTwitter}>
            X (Twitter)
          </button>
          <button type="button" className="secondary" onClick={handleShortcut}>
            {t("onboarding.connect.shortcut")}
          </button>
        </div>
        {shortcutStatus && <div className="status-line success">{shortcutStatus}</div>}
      </div>
    </OnboardingLayout>
  );
}
