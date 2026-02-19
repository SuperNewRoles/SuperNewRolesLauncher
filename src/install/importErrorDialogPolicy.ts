import type { MessageKey } from "../i18n";

const UNKNOWN_IMPORT_ERROR_MESSAGE = "Unknown import error";

type Translator = (
  key: MessageKey,
  params?: Record<string, string | number>,
) => string;

interface RunImportOperationWithRetryPromptOptions {
  operation: () => Promise<unknown>;
  promptKey: MessageKey;
  t: Translator;
  markImportSkipped: (reason: string) => void;
  confirmDialog?: (message: string) => boolean | Promise<boolean>;
}

export function normalizeImportErrorMessage(error: unknown): string {
  const message = String(error ?? "").trim();
  return message.length > 0 ? message : UNKNOWN_IMPORT_ERROR_MESSAGE;
}

export async function runImportOperationWithRetryPrompt({
  operation,
  promptKey,
  t,
  markImportSkipped,
  confirmDialog = (message) => window.confirm(message),
}: RunImportOperationWithRetryPromptOptions): Promise<boolean> {
  while (true) {
    try {
      await operation();
      return true;
    } catch (importError) {
      const message = normalizeImportErrorMessage(importError);
      const shouldRetry = await confirmDialog(t(promptKey, { error: message }));
      if (!shouldRetry) {
        markImportSkipped(message);
        return false;
      }
    }
  }
}
