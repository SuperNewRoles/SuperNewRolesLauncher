import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  settingsGet,
  trayExitApp,
  trayLaunchModded,
  trayShowMainWindow,
} from "../app/services/tauriClient";
import { applyTheme, getStoredTheme, initTheme } from "../app/theme";
import snrLogo from "../assets/snr_logo.png";

type TrayLocale = "ja" | "en";

interface TrayLabels {
  launchModded: string;
  showApp: string;
  exit: string;
}

function resolveInitialLocale(): TrayLocale {
  const localeParam = new URLSearchParams(window.location.search).get("locale");
  return localeParam === "en" ? "en" : "ja";
}

function resolveVersionLabel(): string {
  const versionParam = new URLSearchParams(window.location.search).get("version")?.trim();
  if (!versionParam) {
    return "";
  }
  return versionParam.startsWith("v") ? versionParam : `v${versionParam}`;
}

function resolveShortName(): string {
  const shortNameParam = new URLSearchParams(window.location.search).get("shortName")?.trim();
  return shortNameParam && shortNameParam.length > 0 ? shortNameParam : "SNR";
}

function labelsForLocale(locale: TrayLocale, shortName: string): TrayLabels {
  if (locale === "en") {
    return {
      launchModded: `Launch ${shortName} AmongUs`,
      showApp: "Show app",
      exit: "Exit",
    };
  }
  return {
    launchModded: `${shortName} AmongUsを起動`,
    showApp: "アプリを表示",
    exit: "終了",
  };
}

function TrayMenuApp() {
  const [locale, setLocale] = useState<TrayLocale>(resolveInitialLocale);
  const [runningAction, setRunningAction] = useState(false);
  const shortName = useMemo(resolveShortName, []);
  const versionLabel = useMemo(resolveVersionLabel, []);
  const labels = useMemo(() => labelsForLocale(locale, shortName), [locale, shortName]);

  useEffect(() => {
    void settingsGet()
      .then((settings) => {
        setLocale(settings.uiLocale === "en" ? "en" : "ja");
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const syncTheme = () => {
      applyTheme(getStoredTheme());
    };
    const handleStorage = () => {
      syncTheme();
    };

    // hidden webview を再表示したときにも最新テーマを確実に反映する。
    syncTheme();
    window.addEventListener("focus", syncTheme);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("focus", syncTheme);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    const hideSelf = () => {
      void getCurrentWindow()
        .hide()
        .catch(() => undefined);
    };
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }
      hideSelf();
    };
    window.addEventListener("keydown", handleKeydown);
    return () => {
      window.removeEventListener("keydown", handleKeydown);
    };
  }, []);

  const runAction = async (action: "launch" | "show" | "exit"): Promise<void> => {
    if (runningAction) {
      return;
    }
    setRunningAction(true);
    try {
      if (action === "launch") {
        await trayLaunchModded();
      } else if (action === "show") {
        await trayShowMainWindow();
      } else {
        await trayExitApp();
      }
    } catch {
      // command 側で失敗時に処理されるため、UIは静かに閉じる。
    } finally {
      await getCurrentWindow()
        .hide()
        .catch(() => undefined);
      setRunningAction(false);
    }
  };

  return (
    <div
      className="tray-menu-shell"
      onMouseDown={(event) => {
        if (event.target !== event.currentTarget) {
          return;
        }
        void getCurrentWindow()
          .hide()
          .catch(() => undefined);
      }}
    >
      <div
        className="tray-menu-panel"
        role="menu"
        aria-label="tray-menu"
        onMouseDown={(event) => {
          event.stopPropagation();
        }}
      >
        {versionLabel ? <p className="tray-menu-version">{versionLabel}</p> : null}
        <button
          type="button"
          className="tray-menu-item tray-menu-item-launch"
          disabled={runningAction}
          onClick={() => {
            void runAction("launch");
          }}
        >
          <span className="tray-menu-item-launch-content">
            <img className="tray-menu-item-launch-icon" src={snrLogo} alt="" aria-hidden="true" />
            <span>{labels.launchModded}</span>
          </span>
        </button>
        <button
          type="button"
          className="tray-menu-item"
          disabled={runningAction}
          onClick={() => {
            void runAction("show");
          }}
        >
          {labels.showApp}
        </button>
        <button
          type="button"
          className="tray-menu-item tray-menu-item-danger"
          disabled={runningAction}
          onClick={() => {
            void runAction("exit");
          }}
        >
          {labels.exit}
        </button>
      </div>
    </div>
  );
}

export async function runTrayMenu(container: HTMLElement): Promise<void> {
  await initTheme().catch(() => {
    // テーマ初期化に失敗してもメニュー表示は継続する。
  });
  container.replaceChildren();
  const root = createRoot(container);
  root.render(<TrayMenuApp />);
}
