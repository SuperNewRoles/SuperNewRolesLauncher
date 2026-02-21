import type { MessageKey } from "../i18n";

// エラー値が空だった場合に使う代替メッセージ。
const UNKNOWN_IMPORT_ERROR_MESSAGE = "Unknown import error";
const LONG_SEGMENT_PATTERN = /\S{69,}/g;
const LONG_SEGMENT_HEAD_LENGTH = 42;
const LONG_SEGMENT_TAIL_LENGTH = 23;

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
  const normalized = message.length > 0 ? message : UNKNOWN_IMPORT_ERROR_MESSAGE;
  // ネイティブ confirm ダイアログで長大なパスが横にはみ出さないよう中間省略する。
  return normalized.replace(LONG_SEGMENT_PATTERN, (segment) => {
    if (segment.length <= LONG_SEGMENT_HEAD_LENGTH + LONG_SEGMENT_TAIL_LENGTH + 3) {
      return segment;
    }

    const head = segment.slice(0, LONG_SEGMENT_HEAD_LENGTH);
    const tail = segment.slice(-LONG_SEGMENT_TAIL_LENGTH);
    return `${head}...${tail}`;
  });
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
