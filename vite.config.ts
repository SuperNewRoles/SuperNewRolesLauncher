import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => ({
  plugins: [react()],
  // Rust 側のエラーログを追いやすくするため、Vite 既定のクリアを無効化する。
  clearScreen: false,
  server: {
    strictPort: true,
    // Tauri 開発時は固定ホストを使い、通常ブラウザ起動時は false のままにする。
    host: host ?? false,
    port: 5173,
    hmr: host
      ? {
          // Rust 側で公開する HMR ポートに合わせる。
          protocol: "ws",
          host,
          port: 5183,
        }
      : undefined,
    watch: {
      // Tauri 側の生成物を監視対象から外して無駄な再ビルドを避ける。
      ignored: ["**/src-tauri/**"],
    },
  },
}));
