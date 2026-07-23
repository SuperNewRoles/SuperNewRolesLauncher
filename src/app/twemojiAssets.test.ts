import { describe, expect, it } from "vitest";
import { getTwemojiSvgUrl } from "./twemojiAssets";

describe("getTwemojiSvgUrl", () => {
  it("maps onboarding emojis to Twemoji SVG URLs", () => {
    expect(getTwemojiSvgUrl("👋")).toContain("/svg/1f44b.svg");
    expect(getTwemojiSvgUrl("🚀")).toContain("/svg/1f680.svg");
    expect(getTwemojiSvgUrl("🐛")).toContain("/svg/1f41b.svg");
    expect(getTwemojiSvgUrl("💾")).toContain("/svg/1f4be.svg");
    expect(getTwemojiSvgUrl("📦")).toContain("/svg/1f4e6.svg");
    expect(getTwemojiSvgUrl("🎉")).toContain("/svg/1f389.svg");
    expect(getTwemojiSvgUrl("✅")).toContain("/svg/2705.svg");
    expect(getTwemojiSvgUrl("⏳")).toContain("/svg/23f3.svg");
    expect(getTwemojiSvgUrl("🖥️")).toContain("/svg/1f5a5.svg");
  });
});
