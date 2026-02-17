import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";
import { BODY_AURA_RGB } from "./app/modConfig";
import { settingsProfileReady } from "./app/services/tauriClient";
import { initTheme } from "./app/theme";

function applyConfiguredAuraColors(): void {
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--body-aura-orange-rgb", BODY_AURA_RGB.colorLeft);
  rootStyle.setProperty("--body-aura-green-rgb", BODY_AURA_RGB.colorRight);
  rootStyle.setProperty("--body-aura-red-rgb", BODY_AURA_RGB.colorCenter);
}

async function run() {
  applyConfiguredAuraColors();

  // テーマ初期化（システム設定に連動）
  await initTheme().catch(() => {
    // テーマ初期化に失敗してもアプリは続行
  });

  const container = document.getElementById("app");
  if (!container) {
    throw new Error("#app not found");
  }

  // プロファイル（SNR展開先）が準備できているかバックエンドに確認
  const isInstalled = await settingsProfileReady().catch(() => false);

  if (isInstalled) {
    const { runLauncher } = await import("./app/bootstrap");
    await runLauncher(container);
    return;
  }

  container.replaceChildren();
  const root = createRoot(container);
  root.render(<App />);
}

void run();
