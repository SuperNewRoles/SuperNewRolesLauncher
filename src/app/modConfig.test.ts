import { describe, expect, it } from "vitest";
import { ensureRelativePath } from "./modConfig";

describe("ensureRelativePath", () => {
  it.each(["BepInEx/plugins/", "."])("rejects a path without a file name: %s", (value) => {
    expect(() => ensureRelativePath(value, "test.path")).toThrow(
      "Invalid mod config: 'test.path' must be a safe relative path.",
    );
  });

  it("normalizes a safe relative file path", () => {
    expect(ensureRelativePath("BepInEx\\plugins\\SuperNewRoles.dll", "test.path")).toBe(
      "BepInEx/plugins/SuperNewRoles.dll",
    );
  });
});
