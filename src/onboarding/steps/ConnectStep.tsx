import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { Twemoji } from "../../app/Twemoji";
import { modConfig } from "../../app/modConfig";
import { launchShortcutCreate } from "../../app/services/tauriClient";
import { SOCIAL_ICON_SPECS } from "../../app/socialBrandIcons";
import type { SocialIcon } from "../../app/types";
import { OnboardingLayout } from "../OnboardingLayout";
import type { OnboardingStepProps } from "../types";

const NEXT_BUTTON_UNLOCK_DELAY_MS = 500;
const FALLBACK_DISCORD_URL = "https://discord.gg/Cqfwx82ynN";
const FALLBACK_TWITTER_URL = "https://supernewroles.com/twitter";
const FALLBACK_FANBOX_URL = "https://supernewroles.fanbox.cc/";

const DISCORD_URL =
  modConfig.links.official.find((link) => link.iconId === "discord")?.url ??
  modConfig.links.supportDiscordUrl ??
  FALLBACK_DISCORD_URL;
const TWITTER_URL =
  modConfig.links.official.find((link) => link.iconId === "x")?.url ?? FALLBACK_TWITTER_URL;
const FANBOX_URL =
  modConfig.links.official.find((link) => link.iconId === "fanbox")?.url ?? FALLBACK_FANBOX_URL;

function formatActionError(error: unknown): string {
  // Tauri invoke 例外の共通プレフィックスを除去して表示しやすくする。
  const raw = error instanceof Error ? error.message : String(error);
  const withoutInvokePrefix = raw.replace(/^Error invoking '[^']+':\s*/u, "");
  return (
    withoutInvokePrefix
      .split(/\r?\n/u)
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "Operation failed"
  );
}

function SocialIconGraphic({ icon }: { icon: SocialIcon }) {
  if (icon.kind === "image") {
    // 画像アイコン指定時はそのまま img で描画する。
    return (
      <img
        src={icon.src}
        alt=""
        aria-hidden="true"
        className={icon.imageClassName}
        width={40}
        height={40}
        decoding="async"
      />
    );
  }

  // パスデータ指定時は SVG アイコンとして描画する。
  return (
    <svg viewBox={icon.viewBox} aria-hidden="true" focusable="false">
      <path fill="currentColor" d={icon.pathD} />
    </svg>
  );
}

export function ConnectStep({ t, onNext, onBack }: OnboardingStepProps) {
  const showConnectLinks = modConfig.features.connectLinks;
  const [shortcutStatus, setShortcutStatus] = useState<"idle" | "creating" | "created" | "error">(
    "idle",
  );
  const [shortcutErrorMessage, setShortcutErrorMessage] = useState<string | null>(null);
  const [nextDisabled, setNextDisabled] = useState(true);

  useEffect(() => {
    // Keep this step visible briefly to avoid accidental immediate skip.
    const timer = window.setTimeout(() => {
      setNextDisabled(false);
    }, NEXT_BUTTON_UNLOCK_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // 外部コミュニティリンクの起動ハンドラー。
  const handleDiscord = () => openUrl(DISCORD_URL);
  const handleTwitter = () => openUrl(TWITTER_URL);
  const handleFanbox = () => openUrl(FANBOX_URL);

  const handleShortcut = async () => {
    try {
      // OS ショートカット作成の進行状態を UI に反映する。
      setShortcutStatus("creating");
      setShortcutErrorMessage(null);
      await launchShortcutCreate();
      setShortcutStatus("created");
    } catch (e) {
      setShortcutStatus("error");
      setShortcutErrorMessage(formatActionError(e));
    }
  };

  return (
    <OnboardingLayout t={t} onNext={onNext} onBack={onBack} nextDisabled={nextDisabled}>
      <div className="connect-section">
        <p className="connect-description">{t("onboarding.connect.body")}</p>

        {showConnectLinks && (
          <div className="connect-card-list">
            <button
              type="button"
              className="connect-card"
              data-brand="discord"
              onClick={handleDiscord}
            >
              <span className="connect-card-icon" aria-hidden="true">
                <SocialIconGraphic icon={SOCIAL_ICON_SPECS.discord} />
              </span>
              <span className="connect-card-info">
                <span className="connect-card-name">Discord</span>
                <span className="connect-card-sub">{t("onboarding.connect.discordSub")}</span>
              </span>
              <span className="connect-card-arrow" aria-hidden="true">
                ›
              </span>
            </button>

            <button
              type="button"
              className="connect-card"
              data-brand="twitter"
              onClick={handleTwitter}
            >
              <span className="connect-card-icon" aria-hidden="true">
                <SocialIconGraphic icon={SOCIAL_ICON_SPECS.x} />
              </span>
              <span className="connect-card-info">
                <span className="connect-card-name">X (Twitter)</span>
                <span className="connect-card-sub">{t("onboarding.connect.twitterSub")}</span>
              </span>
              <span className="connect-card-arrow" aria-hidden="true">
                ›
              </span>
            </button>

            <button
              type="button"
              className="connect-card"
              data-brand="fanbox"
              onClick={handleFanbox}
            >
              <span className="connect-card-icon" aria-hidden="true">
                <SocialIconGraphic icon={SOCIAL_ICON_SPECS.fanbox} />
              </span>
              <span className="connect-card-info">
                <span className="connect-card-name">pixiv FANBOX</span>
                <span className="connect-card-sub">{t("onboarding.connect.fanboxSub")}</span>
              </span>
              <span className="connect-card-arrow" aria-hidden="true">
                ›
              </span>
            </button>
          </div>
        )}

        <div className="connect-card-list connect-card-list-actions">
          <button
            type="button"
            className={`connect-card ${shortcutStatus === "created" ? "connect-card-done" : ""}`}
            data-brand="shortcut"
            // 作成中/作成済みは再実行を抑止して二重作成を防ぐ。
            onClick={handleShortcut}
            disabled={shortcutStatus === "creating" || shortcutStatus === "created"}
          >
            <span className="connect-card-icon" aria-hidden="true">
              <Twemoji
                emoji={
                  shortcutStatus === "created" ? "✅" : shortcutStatus === "creating" ? "⏳" : "🖥️"
                }
                className="connect-card-emoji"
              />
            </span>
            <span className="connect-card-info">
              <span className="connect-card-name">
                {shortcutStatus === "creating"
                  ? t("onboarding.connect.shortcutCreating")
                  : shortcutStatus === "created"
                    ? t("onboarding.connect.shortcutCreated")
                    : t("onboarding.connect.shortcut")}
              </span>
              <span className="connect-card-sub">{t("onboarding.connect.shortcutSub")}</span>
            </span>
          </button>
        </div>

        {shortcutStatus === "error" && shortcutErrorMessage && (
          <div className="status-line error" style={{ marginTop: 4 }}>
            {shortcutErrorMessage}
          </div>
        )}
      </div>
    </OnboardingLayout>
  );
}
