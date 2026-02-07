import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  clearScreen: false,
  server: {
    strictPort: true,
    host: host ?? false,
    port: 5173,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 5183
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"]
    }
  }
}));

