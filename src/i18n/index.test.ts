import { describe, expect, it } from "vitest";

import { createTranslator, normalizeLocale } from "./index";

describe("i18n", () => {
  it("normalizeLocale は ja-JP / EN を正規化できる", () => {
    expect(normalizeLocale("ja-JP")).toBe("ja");
    expect(normalizeLocale("EN")).toBe("en");
  });

  it("normalizeLocale は未対応ロケールを null にする", () => {
    expect(normalizeLocale("fr")).toBeNull();
    expect(normalizeLocale("")).toBeNull();
  });

  it("createTranslator はパラメータ置換を行う", () => {
    const t = createTranslator("ja");
    expect(t("install.done", { asset: "sample.zip" })).toContain("sample.zip");
  });

  it("createTranslator は未知キーでも文字列を返す", () => {
    const t = createTranslator("en");
    expect(t("not.exists.key" as never)).toBe("not.exists.key");
  });
});
