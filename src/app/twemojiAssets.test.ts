import { describe, expect, it } from "vitest";
import { getTwemojiSvgUrl } from "./twemojiAssets";

describe("getTwemojiSvgUrl", () => {
  it("maps onboarding emojis to bundled Twemoji SVG URLs", () => {
    expect(getTwemojiSvgUrl("👋")).toContain("/twemoji/1f44b.svg");
    expect(getTwemojiSvgUrl("🚀")).toContain("/twemoji/1f680.svg");
    expect(getTwemojiSvgUrl("🐛")).toContain("/twemoji/1f41b.svg");
    expect(getTwemojiSvgUrl("💾")).toContain("/twemoji/1f4be.svg");
    expect(getTwemojiSvgUrl("📦")).toContain("/twemoji/1f4e6.svg");
    expect(getTwemojiSvgUrl("🎉")).toContain("/twemoji/1f389.svg");
    expect(getTwemojiSvgUrl("✅")).toContain("/twemoji/2705.svg");
    expect(getTwemojiSvgUrl("⏳")).toContain("/twemoji/23f3.svg");
    expect(getTwemojiSvgUrl("🖥️")).toContain("/twemoji/1f5a5.svg");
    expect(getTwemojiSvgUrl("👋")).not.toMatch(/^https?:/u);
  });

  it("rejects emoji assets that are not bundled", () => {
    expect(() => getTwemojiSvgUrl("😀")).toThrow("Twemoji asset is not bundled: 1f600");
  });
});
