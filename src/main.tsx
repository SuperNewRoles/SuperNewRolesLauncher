import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App";
import { settingsProfileReady } from "./app/services/tauriClient";

async function run() {
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

  const root = createRoot(container);
  root.render(<App />);
}

void run();
