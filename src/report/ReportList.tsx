import type { ReportThread } from "../app/types";
import type { createTranslator } from "../i18n";

type Translator = ReturnType<typeof createTranslator>;

interface ReportListProps {
  t: Translator;
  threads: ReportThread[];
  selectedThread: ReportThread | null;
  onThreadSelect: (thread: ReportThread) => void;
  onNewReport: () => void;
  isReady: boolean;
  isLoading: boolean;
}

export function ReportList({
  t,
  threads,
  selectedThread,
  onThreadSelect,
  onNewReport,
  isReady,
  isLoading,
}: ReportListProps) {
  return (
    <div className="report-list-container">
      <div className="report-list-header">
        <button
          type="button"
          className="report-new-button"
          onClick={onNewReport}
          disabled={!isReady}
        >
          {t("report.newReport")}
        </button>
      </div>

      <div className="report-list-content">
        {isLoading ? (
          <div className="report-loading-container">
            <div className="report-spinner" />
            <span>{t("report.threadsLoading")}</span>
          </div>
        ) : threads.length === 0 ? (
          <div className="report-list-empty">
            {isReady ? t("report.threadsEmpty") : t("report.notReady")}
          </div>
        ) : (
          <div className="report-thread-list-vertical">
            {threads.map((thread) => (
              <button
                key={thread.threadId}
                type="button"
                className={`report-thread-item-vertical ${
                  selectedThread?.threadId === thread.threadId ? "active" : ""
                } ${thread.unread ? "unread" : ""}`}
                onClick={() => onThreadSelect(thread)}
              >
                <div className="report-thread-item-header">
                  <span className="report-thread-status">{thread.currentStatus.mark}</span>
                  <span className="report-thread-title">
                    {thread.title || t("report.untitled")}
                  </span>
                  {thread.unread && (
                    <span
                      className="report-thread-unread-badge"
                      aria-label={t("report.unreadSuffix")}
                    >
                      !
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
