import { describe, expect, it, vi } from "vitest";
import type { MessageKey } from "../i18n";
import {
  normalizeImportErrorMessage,
  runImportOperationWithRetryPrompt,
} from "./importErrorDialogPolicy";

// テスト用翻訳関数は key と error を可視化できる最小実装にする。
const t = (key: MessageKey, params?: Record<string, string | number>) =>
  `${String(key)}:${String(params?.error ?? "")}`;

describe("import error dialog policy", () => {
  it("normalizes empty errors to fallback message", () => {
    // 空文字や undefined は既定の文言へ置き換える。
    expect(normalizeImportErrorMessage("")).toBe("Unknown import error");
    expect(normalizeImportErrorMessage("   ")).toBe("Unknown import error");
    expect(normalizeImportErrorMessage(undefined)).toBe("Unknown import error");
    expect(normalizeImportErrorMessage("  abc  ")).toBe("abc");
  });

  it("shows prompt again when retry fails with the same message", async () => {
    // 同一エラーが連続しても確認ダイアログが都度表示されることを確認する。
    const markImportSkipped = vi.fn();
    const confirmDialog = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const operation = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce("same error")
      .mockRejectedValueOnce("same error");

    const result = await runImportOperationWithRetryPrompt({
      operation,
      promptKey: "installFlow.importRetrySkipPromptMigration",
      t,
      markImportSkipped,
      confirmDialog,
    });

    expect(result).toBe(false);
    expect(operation).toHaveBeenCalledTimes(2);
    expect(confirmDialog).toHaveBeenCalledTimes(2);
    expect(markImportSkipped).toHaveBeenCalledWith("same error");
  });

  it("shows prompt on each different failure until cancelled", async () => {
    // エラー内容が変わっても最後の失敗理由でスキップ記録されることを確認する。
    const markImportSkipped = vi.fn();
    const confirmDialog = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const operation = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce("error A")
      .mockRejectedValueOnce("error B");

    const result = await runImportOperationWithRetryPrompt({
      operation,
      promptKey: "installFlow.importRetrySkipPromptMigration",
      t,
      markImportSkipped,
      confirmDialog,
    });

    expect(result).toBe(false);
    expect(operation).toHaveBeenCalledTimes(2);
    expect(confirmDialog).toHaveBeenCalledTimes(2);
    expect(markImportSkipped).toHaveBeenCalledWith("error B");
  });

  it("returns true when retry succeeds", async () => {
    // 再試行成功時はスキップ扱いにしない。
    const markImportSkipped = vi.fn();
    const confirmDialog = vi.fn().mockResolvedValue(true);
    const operation = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce("recoverable")
      .mockResolvedValueOnce(undefined);

    const result = await runImportOperationWithRetryPrompt({
      operation,
      promptKey: "installFlow.importRetrySkipPrompt",
      t,
      markImportSkipped,
      confirmDialog,
    });

    expect(result).toBe(true);
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(markImportSkipped).not.toHaveBeenCalled();
  });

  it("returns false when user cancels", async () => {
    // ユーザーがキャンセルした時点で false を返して処理を打ち切る。
    const markImportSkipped = vi.fn();
    const confirmDialog = vi.fn().mockResolvedValue(false);
    const operation = vi.fn<() => Promise<void>>().mockRejectedValueOnce("stop");

    const result = await runImportOperationWithRetryPrompt({
      operation,
      promptKey: "installFlow.importRetrySkipPromptSaveDataPresetMerge",
      t,
      markImportSkipped,
      confirmDialog,
    });

    expect(result).toBe(false);
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(markImportSkipped).toHaveBeenCalledWith("stop");
  });
});
