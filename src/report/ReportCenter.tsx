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

const REPORT_THREADS_POLL_INTERVAL_MS = 180_000;
const REPORT_THREADS_REFRESH_GAP_MS = 30_000;
const PANEL_CLOSE_ANIMATION_MS = 300;

interface ReportCenterProps {
  t: Translator;
}

function formatActionError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/^Error invoking '[^']+':\s*/u, "").trim() || raw;
}

export function ReportCenter({ t }: ReportCenterProps) {
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
  const reportThreadsLastFetchAtRef = useRef(0);
  const reportThreadsLoadingRef = useRef(false);
  const messageCacheRef = useRef<Map<string, ReportMessage[]>>(new Map());
  const messageRequestIdRef = useRef(0);

  const clearClosePanelTimeout = useCallback(() => {
    if (closePanelTimeoutRef.current !== null) {
      window.clearTimeout(closePanelTimeoutRef.current);
      closePanelTimeoutRef.current = null;
    }
  }, []);

  const loadThreads = useCallback(async ({ force = false } = {}) => {
    const now = Date.now();
    if (!force && now - reportThreadsLastFetchAtRef.current < REPORT_THREADS_REFRESH_GAP_MS) {
      return;
    }

    if (reportThreadsLoadingRef.current) {
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

  const handleClosePanel = useCallback(() => {
    setIsPanelOpen(false);
    clearClosePanelTimeout();
    closePanelTimeoutRef.current = window.setTimeout(() => {
      closePanelTimeoutRef.current = null;
      setSelectedThread(null);
    }, PANEL_CLOSE_ANIMATION_MS);
  }, [clearClosePanelTimeout]);

  const handleToggleFullscreen = useCallback(() => {
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
        // Reload messages
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
