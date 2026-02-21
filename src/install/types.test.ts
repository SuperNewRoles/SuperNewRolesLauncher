import { describe, expect, it } from "vitest";
import { STEP_ORDER } from "./types";

describe("install step order", () => {
  // 遷移アニメーション方向判定の前提となる順序を検証する。
  it("places import step between version and confirm", () => {
    // ImportStep がウィザード順序の中間に配置されていることを保証する。
    expect(STEP_ORDER.import).toBeGreaterThan(STEP_ORDER.version);
    expect(STEP_ORDER.import).toBeLessThan(STEP_ORDER.confirm);
  });
});
