import type { MessageKey } from "../i18n";

// エラー値が空だった場合に使う代替メッセージ。
const UNKNOWN_IMPORT_ERROR_MESSAGE = "Unknown import error";

type Translator = (key: MessageKey, params?: Record<string, string | number>) => string;

interface RunImportOperationWithRetryPromptOptions {
  operation: () => Promise<unknown>;
  promptKey: MessageKey;
  t: Translator;
  markImportSkipped: (reason: string) => void;
  confirmDialog?: (message: string) => boolean | Promise<boolean>;
}

export function normalizeImportErrorMessage(error: unknown): string {
  // 例外オブジェクトの種別差を吸収し、表示用文字列へ正規化する。
  const message = String(error ?? "").trim();
  return message.length > 0 ? message : UNKNOWN_IMPORT_ERROR_MESSAGE;
}

export async function runImportOperationWithRetryPrompt({
  operation,
  promptKey,
  t,
  markImportSkipped,
  // 既定はブラウザ confirm を使うが、テストでは差し替え可能にしている。
  confirmDialog = (message) => window.confirm(message),
}: RunImportOperationWithRetryPromptOptions): Promise<boolean> {
  // ユーザーが中断を選ぶまで同じ操作を再試行できるようにする。
  while (true) {
    try {
      await operation();
      return true;
    } catch (importError) {
      const message = normalizeImportErrorMessage(importError);
      // 失敗理由を明示したダイアログで「再試行 or スキップ」を選ばせる。
      const shouldRetry = await confirmDialog(t(promptKey, { error: message }));
      if (!shouldRetry) {
        markImportSkipped(message);
        return false;
      }
    }
  }
}
