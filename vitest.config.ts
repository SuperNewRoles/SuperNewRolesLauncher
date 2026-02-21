import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // DOM API を使うフロントエンドテストのため jsdom を使う。
    environment: "jsdom",
    // テスト対象は src 配下の unit test ファイルに限定する。
    include: ["src/**/*.test.ts"],
    // 共通セットアップで環境差分を吸収する。
    setupFiles: ["src/test/setup.ts"],
    // テストファイル側で明示 import する方針に合わせて false を維持する。
    globals: false,
  },
});
