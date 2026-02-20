import { describe, expect, it, vi } from "vitest";
import type { MessageKey } from "../i18n";
import {
  normalizeImportErrorMessage,
  runImportOperationWithRetryPrompt,
} from "./importErrorDialogPolicy";

const t = (key: MessageKey, params?: Record<string, string | number>) =>
  `${String(key)}:${String(params?.error ?? "")}`;

describe("import error dialog policy", () => {
  it("normalizes empty errors to fallback message", () => {
    expect(normalizeImportErrorMessage("")).toBe("Unknown import error");
    expect(normalizeImportErrorMessage("   ")).toBe("Unknown import error");
    expect(normalizeImportErrorMessage(undefined)).toBe("Unknown import error");
    expect(normalizeImportErrorMessage("  abc  ")).toBe("abc");
  });

  it("shows prompt again when retry fails with the same message", async () => {
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
