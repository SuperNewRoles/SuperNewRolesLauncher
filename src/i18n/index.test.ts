import { describe, expect, it } from "vitest";

import { createTranslator, normalizeLocale } from "./index";

describe("i18n", () => {
  it("normalizeLocale は ja-JP / EN を正規化できる", () => {
    // 言語タグ形式と大文字入力の両方を許容する。
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
    // 文言欠落時でも UI が空にならないよう、キー文字列フォールバックを期待する。
    const t = createTranslator("en");
    expect(t("not.exists.key" as never)).toBe("not.exists.key");
  });
});
