import { useCallback, useEffect, useState } from "react";
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

interface ReportCenterProps {
  t: Translator;
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

  // Load threads
  const loadThreads = useCallback(async () => {
    setIsLoadingThreads(true);
    try {
      const result = await reportingThreadsList();
      setThreads(result);
    } catch (e) {
      console.error("Failed to load threads:", e);
    } finally {
      setIsLoadingThreads(false);
    }
  }, []);

  // Initialize
  useEffect(() => {
    const init = async () => {
      try {
        const result = await reportingPrepare();
        if (result.ready) {
          setIsReady(true);
          if (result.githubId) {
            setCurrentUserId(result.githubId);
          }
          await loadThreads();
        }
      } catch (e) {
        console.error("Failed to prepare reporting:", e);
      }
    };
    void init();
  }, [loadThreads]);

  // Load messages when thread is selected
  useEffect(() => {
    if (!selectedThread) {
      setMessages([]);
      return;
    }

    const loadMessages = async () => {
      setIsLoadingMessages(true);
      try {
        const result = await reportingMessagesList(selectedThread.threadId);
        setMessages(result);
      } catch (e) {
        console.error("Failed to load messages:", e);
      } finally {
        setIsLoadingMessages(false);
      }
    };

    void loadMessages();
  }, [selectedThread]);

  const handleThreadSelect = useCallback((thread: ReportThread) => {
    setSelectedThread(thread);
    setIsPanelOpen(true);
  }, []);

  const handleClosePanel = useCallback(() => {
    setIsPanelOpen(false);
    setTimeout(() => {
      setSelectedThread(null);
    }, 300);
  }, []);

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
        setStatusMessage(t("report.sent"));
        await loadThreads();
        setIsNewReportModalOpen(false);
      } catch (e) {
        console.error("Failed to send report:", e);
        setStatusMessage(t("report.sendFailed", { error: String(e) }));
      }
    },
    [t, loadThreads],
  );

  const handleSendReply = useCallback(
    async (content: string) => {
      if (!selectedThread) return;

      try {
        await reportingMessageSend(selectedThread.threadId, content);
        // Reload messages
        const result = await reportingMessagesList(selectedThread.threadId);
        setMessages(result);
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
