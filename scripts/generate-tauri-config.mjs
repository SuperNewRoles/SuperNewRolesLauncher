import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workspaceRoot = path.resolve(__dirname, "..");

const modConfigPath = path.join(workspaceRoot, "src", "shared", "mod.config.json");
const baseTauriConfigPath = path.join(workspaceRoot, "src-tauri", "tauri.conf.json");
const outputTauriConfigPath = path.join(workspaceRoot, "src-tauri", "tauri.generated.conf.json");

async function loadJson(filePath) {
  // 設定ファイルは UTF-8 固定で読み込む。
  const raw = await readFile(filePath, "utf8");
  return JSON.parse(raw);
}

function buildGeneratedConfig(baseConfig, modConfig) {
  // 元設定を破壊しないようにクローンしてから上書きする。
  const generated = structuredClone(baseConfig);
  generated.productName = modConfig.branding.launcherName;
  generated.identifier = modConfig.branding.identifier;

  if (generated.app?.windows && Array.isArray(generated.app.windows)) {
    // すべてのウィンドウタイトルをブランド設定へ寄せて表記ゆれを防ぐ。
    generated.app.windows = generated.app.windows.map((windowConfig) => ({
      ...windowConfig,
      title: modConfig.branding.windowTitle,
    }));
  }

  if (!generated.plugins) {
    generated.plugins = {};
  }
  if (!generated.plugins.updater) {
    generated.plugins.updater = {};
  }
  generated.plugins.updater = {
    ...generated.plugins.updater,
    endpoints: [modConfig.distribution.updaterLatestJsonUrl],
  };

  return generated;
}

async function main() {
  // 依存しない2ファイルは並列に読み込んで待ち時間を減らす。
  const [modConfig, baseTauriConfig] = await Promise.all([
    loadJson(modConfigPath),
    loadJson(baseTauriConfigPath),
  ]);

  const generated = buildGeneratedConfig(baseTauriConfig, modConfig);
  const output = `${JSON.stringify(generated, null, 2)}\n`;
  // 生成物の末尾改行を揃えて差分を安定させる。
  await writeFile(outputTauriConfigPath, output, "utf8");
  console.log(`Generated ${path.relative(workspaceRoot, outputTauriConfigPath)}`);
}

main().catch((error) => {
  console.error("Failed to generate Tauri config:", error);
  process.exitCode = 1;
});
