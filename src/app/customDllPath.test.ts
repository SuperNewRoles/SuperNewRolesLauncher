import { describe, expect, it } from "vitest";

import { hasExpectedCustomDllFileName, pathBasename } from "./customDllPath";

describe("custom DLL path helpers", () => {
  it("Windows とスラッシュ区切りの両方からファイル名を取り出す", () => {
    expect(pathBasename("C:\\mods\\SuperNewRoles.dll")).toBe("SuperNewRoles.dll");
    expect(pathBasename("BepInEx/plugins/SuperNewRoles.dll")).toBe("SuperNewRoles.dll");
  });

  it("設定された置換先と同名のDLLを大文字小文字を区別せず受け付ける", () => {
    expect(
      hasExpectedCustomDllFileName(
        "C:\\mods\\SUPERNEWROLES.DLL",
        "BepInEx/plugins/SuperNewRoles.dll",
      ),
    ).toBe(true);
  });

  it("別名のDLLを拒否する", () => {
    expect(
      hasExpectedCustomDllFileName("C:\\mods\\Different.dll", "BepInEx/plugins/SuperNewRoles.dll"),
    ).toBe(false);
  });
});
