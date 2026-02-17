import { describe, expect, it } from "vitest";

import { OFFICIAL_LINKS } from "./constants";
import { SOCIAL_ICON_SPECS } from "./socialBrandIcons";

describe("social brand icons", () => {
  it("contains all supported brand icon specs", () => {
    expect(Object.keys(SOCIAL_ICON_SPECS).sort()).toEqual([
      "discord",
      "fanbox",
      "github",
      "x",
      "youtube",
    ]);
  });

  it("uses a bold F svg icon for FANBOX", () => {
    const fanboxIcon = SOCIAL_ICON_SPECS.fanbox;
    expect(fanboxIcon.kind).toBe("svg-path");
    if (fanboxIcon.kind === "svg-path") {
      expect(fanboxIcon.pathD).toContain("h16v4");
    }
  });

  it("wires OFFICIAL_LINKS FANBOX to the shared FANBOX icon source", () => {
    const fanboxLink = OFFICIAL_LINKS.find((link) => link.label === "FANBOX");
    expect(fanboxLink).toBeDefined();
    expect(fanboxLink?.icon.kind).toBe("svg-path");
  });
});
