import { describe, expect, it } from "vitest";
import { STEP_ORDER } from "./types";

describe("install step order", () => {
  it("places import step between version and confirm", () => {
    expect(STEP_ORDER.import).toBeGreaterThan(STEP_ORDER.version);
    expect(STEP_ORDER.import).toBeLessThan(STEP_ORDER.confirm);
  });
});
