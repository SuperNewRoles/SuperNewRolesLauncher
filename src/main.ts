import { invoke } from "@tauri-apps/api/core";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app not found");

app.innerHTML = `
  <main style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; padding: 16px;">
    <h1 style="margin: 0 0 12px;">SuperNewRolesLauncher</h1>
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

if (!form || !nameInput || !result) throw new Error("UI elements not found");

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

