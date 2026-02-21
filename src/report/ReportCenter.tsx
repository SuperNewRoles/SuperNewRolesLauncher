import { useCallback, useEffect, useRef, useState } from "react";
import {
  reportingMessageSend,
  reportingMessagesList,
  reportingPrepare,
  reportingReportSend,
  reportingThreadsList,
} from "../app/services/tauriClient";
import type { ReportMessage, ReportThread } from "../app/types";
import type { createTranslator } from "../i18n";
import { NewReportModal } from "./NewReportModal";
import { ReportList } from "./ReportList";
import { ReportThreadPanel } from "./ReportThreadPanel";

type Translator = ReturnType<typeof createTranslator>;

// スレッド一覧の定期更新間隔と、手動更新時の最短再取得間隔。
const REPORT_THREADS_POLL_INTERVAL_MS = 180_000;
const REPORT_THREADS_REFRESH_GAP_MS = 30_000;
const PANEL_CLOSE_ANIMATION_MS = 300;

interface ReportCenterProps {
  t: Translator;
  openThreadId?: string | null;
  onOpenThreadHandled?: (threadId: string) => void;
}

function formatActionError(error: unknown): string {
  // Tauri invoke の先頭装飾を除去してユーザー向け文言に整える。
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking '[^']+':\s*/u, "").trim() || raw;
}

export function ReportCenter({ t, openThreadId, onOpenThreadHandled }: ReportCenterProps) {
  const [isReady, setIsReady] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [threads, setThreads] = useState<ReportThread[]>([]);
  const [isLoadingThreads, setIsLoadingThreads] = useState(false);
  const [selectedThread, setSelectedThread] = useState<ReportThread | null>(null);
  const [messages, setMessages] = useState<ReportMessage[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState(false);
  const [isPanelOpen, setIsPanelOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isNewReportModalOpen, setIsNewReportModalOpen] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const isMountedRef = useRef(false);
  const closePanelTimeoutRef = useRef<number | null>(null);
  // スレッド一覧の過剰再取得を抑えるため最終取得時刻を保持する。
  const reportThreadsLastFetchAtRef = useRef(0);
  const reportThreadsLoadingRef = useRef(false);
  const messageCacheRef = useRef<Map<string, ReportMessage[]>>(new Map());
  const messageRequestIdRef = useRef(0);
  const openThreadReloadRequestedRef = useRef<string | null>(null);
  const handledOpenThreadIdRef = useRef<string | null>(null);

  const clearClosePanelTimeout = useCallback(() => {
    // パネル開閉が連続しても古いタイマーを残さない。
    if (closePanelTimeoutRef.current !== null) {
      window.clearTimeout(closePanelTimeoutRef.current);
      closePanelTimeoutRef.current = null;
    }
  }, []);

  const loadThreads = useCallback(async ({ force = false } = {}) => {
    const now = Date.now();
    // 連続再取得を抑制して API 負荷を避ける。
    if (!force && now - reportThreadsLastFetchAtRef.current < REPORT_THREADS_REFRESH_GAP_MS) {
      return;
    }

    if (reportThreadsLoadingRef.current) {
      // 同時実行を防止する。
      return;
    }

    reportThreadsLoadingRef.current = true;
    setIsLoadingThreads(true);
    try {
      const result = await reportingThreadsList();
      reportThreadsLastFetchAtRef.current = Date.now();
      if (isMountedRef.current) {
        setThreads(result);
      }
    } catch (e) {
      console.error("Failed to load threads:", e);
    } finally {
      reportThreadsLoadingRef.current = false;
      reportThreadsLastFetchAtRef.current = Math.max(
        reportThreadsLastFetchAtRef.current,
        Date.now(),
      );
      if (isMountedRef.current) {
        setIsLoadingThreads(false);
      }
    }
  }, []);

  // Initialize
  useEffect(() => {
    // 初期化時に reporting の準備とスレッド初回取得を行う。
    isMountedRef.current = true;

    const init = async () => {
      try {
        const result = await reportingPrepare();
        if (result.ready) {
          setIsReady(true);
          if (result.githubId) {
            setCurrentUserId(result.githubId);
          }
          await loadThreads({ force: true });
        }
      } catch (e) {
        console.error("Failed to prepare reporting:", e);
      }
    };
    void init();

    return () => {
      isMountedRef.current = false;
      clearClosePanelTimeout();
    };
  }, [loadThreads, clearClosePanelTimeout]);

  useEffect(() => {
    // 一覧は定期ポーリングで更新し、初回も即時取得する。
    const timer = window.setInterval(() => {
      void loadThreads();
    }, REPORT_THREADS_POLL_INTERVAL_MS);

    void loadThreads();

    return () => {
      window.clearInterval(timer);
    };
  }, [loadThreads]);

  // Load messages when thread is selected
  useEffect(() => {
    if (!selectedThread) {
      // 選択解除時はメッセージ表示を完全リセットする。
      messageRequestIdRef.current += 1;
      setMessages([]);
      setIsLoadingMessages(false);
      return;
    }

    const threadId = selectedThread.threadId;
    const requestId = messageRequestIdRef.current + 1;
    messageRequestIdRef.current = requestId;
    const cachedMessages = messageCacheRef.current.get(threadId);

    if (cachedMessages) {
      // キャッシュがある場合は先に表示して体感レスポンスを上げる。
      setMessages(cachedMessages);
      setIsLoadingMessages(false);
    } else {
      setMessages([]);
      setIsLoadingMessages(true);
    }

    const loadMessages = async () => {
      try {
        const result = await reportingMessagesList(threadId);
        if (!isMountedRef.current || requestId !== messageRequestIdRef.current) {
          // 古いリクエスト結果で表示を上書きしない。
          return;
        }
        messageCacheRef.current.set(threadId, result);
        setMessages(result);
      } catch (e) {
        if (requestId === messageRequestIdRef.current) {
          console.error("Failed to load messages:", e);
        }
      } finally {
        if (!cachedMessages && isMountedRef.current && requestId === messageRequestIdRef.current) {
          setIsLoadingMessages(false);
        }
      }
    };

    void loadMessages();
  }, [selectedThread]);

  const handleThreadSelect = useCallback(
    (thread: ReportThread) => {
      clearClosePanelTimeout();

      // スレッド選択時にローカル上の未読フラグを即時解除する。
      const normalizedThread = thread.unread
        ? {
            ...thread,
            unread: false,
          }
        : thread;

      setSelectedThread(normalizedThread);
      setIsPanelOpen(true);
      setThreads((currentThreads) =>
        currentThreads.map((item) =>
          item.threadId === thread.threadId && item.unread
            ? {
                ...item,
                unread: false,
              }
            : item,
        ),
      );
    },
    [clearClosePanelTimeout],
  );

  useEffect(() => {
    if (!openThreadId) {
      // deep-link 指定が外れたら処理状態を初期化する。
      openThreadReloadRequestedRef.current = null;
      handledOpenThreadIdRef.current = null;
      return;
    }
    if (handledOpenThreadIdRef.current === openThreadId) {
      return;
    }

    const targetThread = threads.find((thread) => thread.threadId === openThreadId);
    if (targetThread) {
      openThreadReloadRequestedRef.current = null;
      handledOpenThreadIdRef.current = openThreadId;
      handleThreadSelect(targetThread);
      onOpenThreadHandled?.(openThreadId);
      return;
    }

    if (openThreadReloadRequestedRef.current === openThreadId) {
      return;
    }
    // 一覧未取得の場合は一度だけ強制再取得して対象スレッドを探す。
    openThreadReloadRequestedRef.current = openThreadId;
    void loadThreads({ force: true });
  }, [handleThreadSelect, loadThreads, onOpenThreadHandled, openThreadId, threads]);

  const handleClosePanel = useCallback(() => {
    // 閉じアニメーション後に selectedThread を破棄する。
    setIsPanelOpen(false);
    clearClosePanelTimeout();
    closePanelTimeoutRef.current = window.setTimeout(() => {
      closePanelTimeoutRef.current = null;
      setSelectedThread(null);
    }, PANEL_CLOSE_ANIMATION_MS);
  }, [clearClosePanelTimeout]);

  const handleToggleFullscreen = useCallback(() => {
    // パネル表示サイズをトグルする。
    setIsFullscreen((prev) => !prev);
  }, []);

  const handleNewReport = useCallback(() => {
    setIsNewReportModalOpen(true);
  }, []);

  const handleCloseNewReportModal = useCallback(() => {
    setIsNewReportModalOpen(false);
  }, []);

  const handleSubmitReport = useCallback(
    async (reportData: {
      reportType: "Bug" | "Question" | "Request" | "Thanks" | "Other";
      title: string;
      description: string;
      map?: string;
      role?: string;
      timing?: string;
    }) => {
      try {
        // 送信成功後は一覧を再取得し、新規スレッドを即反映する。
        await reportingReportSend(reportData);
        setStatusMessage("");
        void loadThreads({ force: true });
      } catch (e) {
        const message = formatActionError(e);
        console.error("Failed to send report:", e);
        setStatusMessage("");
        throw new Error(message);
      }
    },
    [loadThreads],
  );

  const handleSendReply = useCallback(
    async (content: string) => {
      if (!selectedThread) return;

      try {
        await reportingMessageSend(selectedThread.threadId, content);
        // 返信後は最新メッセージを再取得してキャッシュも更新する。
        const result = await reportingMessagesList(selectedThread.threadId);
        if (isMountedRef.current) {
          messageCacheRef.current.set(selectedThread.threadId, result);
          setMessages(result);
        }
      } catch (e) {
        console.error("Failed to send reply:", e);
      }
    },
    [selectedThread],
  );

  return (
    <div className="report-center-container">
      <ReportList
        t={t}
        threads={threads}
        selectedThread={selectedThread}
        onThreadSelect={handleThreadSelect}
        onNewReport={handleNewReport}
        isReady={isReady}
        isLoading={isLoadingThreads}
      />

      <ReportThreadPanel
        t={t}
        thread={selectedThread}
        messages={messages}
        currentUserId={currentUserId}
        isOpen={isPanelOpen}
        isFullscreen={isFullscreen}
        isLoading={isLoadingMessages}
        onClose={handleClosePanel}
        onToggleFullscreen={handleToggleFullscreen}
        onSendReply={handleSendReply}
      />

      <NewReportModal
        t={t}
        isOpen={isNewReportModalOpen}
        onClose={handleCloseNewReportModal}
        onSubmit={handleSubmitReport}
      />

      {statusMessage && (
        <div className="report-status-toast">
          {statusMessage}
          <button
            type="button"
            className="report-status-toast-close"
            onClick={() => setStatusMessage("")}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}
