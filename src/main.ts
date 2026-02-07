import { invoke } from "@tauri-apps/api/core";
import { getVersion } from "@tauri-apps/api/app";
import { check } from "@tauri-apps/plugin-updater";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app not found");

app.innerHTML = `
  <main style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 16px; display: grid; gap: 20px;">
    <h1 style="margin: 0 0 12px;">SuperNewRolesLauncher</h1>
    <section style="display: grid; gap: 8px; padding: 12px; border: 1px solid #d0d7de; border-radius: 8px; max-width: 520px;">
      <strong>アプリ更新</strong>
      <div>現在のバージョン: <span id="app-version">読み込み中...</span></div>
      <div style="display:flex; gap: 8px; align-items:center; flex-wrap: wrap;">
        <button id="check-update" type="button" style="padding: 8px 12px;">更新を確認</button>
        <span id="update-status" aria-live="polite"></span>
      </div>
    </section>
    <form id="greet-form" style="display:flex; gap: 8px; align-items:center; flex-wrap: wrap;">
      <input id="name" placeholder="name" style="padding: 8px; min-width: 220px;" />
      <button type="submit" style="padding: 8px 12px;">Greet</button>
      <span id="result" aria-live="polite"></span>
    </form>
  </main>
`;

const form = document.querySelector<HTMLFormElement>("#greet-form");
const nameInput = document.querySelector<HTMLInputElement>("#name");
const result = document.querySelector<HTMLSpanElement>("#result");
const appVersion = document.querySelector<HTMLSpanElement>("#app-version");
const checkUpdateButton = document.querySelector<HTMLButtonElement>("#check-update");
const updateStatus = document.querySelector<HTMLSpanElement>("#update-status");

if (!form || !nameInput || !result || !appVersion || !checkUpdateButton || !updateStatus) {
  throw new Error("UI elements not found");
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  result.textContent = "…";
  try {
    const name = nameInput.value.trim() || "World";
    const message = await invoke<string>("greet", { name });
    result.textContent = message;
  } catch (err) {
    result.textContent = String(err);
  }
});

void (async () => {
  try {
    appVersion.textContent = `v${await getVersion()}`;
  } catch (err) {
    appVersion.textContent = `取得失敗: ${String(err)}`;
  }
})();

let isCheckingUpdate = false;

checkUpdateButton.addEventListener("click", async () => {
  if (isCheckingUpdate) return;
  isCheckingUpdate = true;
  checkUpdateButton.disabled = true;
  updateStatus.textContent = "更新を確認中...";

  try {
    const update = await check();
    if (!update) {
      updateStatus.textContent = "最新バージョンです。";
      return;
    }

    const shouldInstall = window.confirm(
      `v${update.version} が利用可能です。今すぐダウンロードして適用しますか？`
    );
    if (!shouldInstall) {
      updateStatus.textContent = `更新 v${update.version} は未適用です。`;
      return;
    }

    let downloadedBytes = 0;
    let totalBytes = 0;

    await update.downloadAndInstall((event) => {
      if (event.event === "Started") {
        totalBytes = event.data.contentLength ?? 0;
        updateStatus.textContent = "更新をダウンロード中...";
        return;
      }

      if (event.event === "Progress") {
        downloadedBytes += event.data.chunkLength;
        if (totalBytes > 0) {
          const percent = Math.min(100, Math.floor((downloadedBytes / totalBytes) * 100));
          updateStatus.textContent = `更新をダウンロード中... ${percent}%`;
        } else {
          updateStatus.textContent = "更新をダウンロード中...";
        }
        return;
      }

      updateStatus.textContent = "更新を適用中...";
    });

    updateStatus.textContent = "更新を適用しました。アプリを再起動してください。";
  } catch (err) {
    updateStatus.textContent = `更新に失敗しました: ${String(err)}`;
  } finally {
    checkUpdateButton.disabled = false;
    isCheckingUpdate = false;
  }
});
