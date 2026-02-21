import { createRoot } from "react-dom/client";
import App from "./App";
import { BODY_AURA_RGB } from "./app/modConfig";
import { settingsProfileReady } from "./app/services/tauriClient";
import { initTheme } from "./app/theme";

function applyConfiguredAuraColors(): void {
  // mod.config 由来の色を CSS カスタムプロパティへ反映する。
  const rootStyle = document.documentElement.style;
  rootStyle.setProperty("--body-aura-orange-rgb", BODY_AURA_RGB.colorLeft);
  rootStyle.setProperty("--body-aura-green-rgb", BODY_AURA_RGB.colorRight);
  rootStyle.setProperty("--body-aura-red-rgb", BODY_AURA_RGB.colorCenter);
}

async function run() {
  const container = document.getElementById("app");
  if (!container) {
    throw new Error("#app not found");
  }

  const params = new URLSearchParams(window.location.search);
  if (params.get("tray-menu") === "1") {
    await import("./tray-menu/styles.css");
    const { runTrayMenu } = await import("./tray-menu/bootstrap");
    await runTrayMenu(container);
    return;
  }

  await import("./styles.css");

  // 画面描画前に見た目の初期値を適用してちらつきを抑える。
  applyConfiguredAuraColors();

  // テーマ初期化（システム設定に連動）
  await initTheme().catch(() => {
    // テーマ初期化に失敗してもアプリは続行
  });

  // プロファイル（SNR展開先）が準備できているかバックエンドに確認
  const isInstalled = await settingsProfileReady().catch(() => false);

  if (isInstalled) {
    // インストール済みならランチャー本体へ遷移する。
    const { runLauncher } = await import("./app/bootstrap");
    await runLauncher(container);
    return;
  }

  // 未インストール時のみインストールウィザードを表示する。
  container.replaceChildren();
  const root = createRoot(container);
  root.render(<App />);
}

// エントリポイントでは戻り値を待たずに起動し、内部で例外を管理する。
void run();
