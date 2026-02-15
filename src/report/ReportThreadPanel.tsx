import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { ReportMessage, ReportThread } from "../app/types";
import type { createTranslator } from "../i18n";

type Translator = ReturnType<typeof createTranslator>;

interface ReportThreadPanelProps {
  t: Translator;
  thread: ReportThread | null;
  messages: ReportMessage[];
  currentUserId: string | null;
  isOpen: boolean;
  isFullscreen: boolean;
  isLoading: boolean;
  onClose: () => void;
  onToggleFullscreen: () => void;
  onSendReply: (content: string) => Promise<void>;
}

export function ReportThreadPanel({
  t,
  thread,
  messages,
  currentUserId,
  isOpen,
  isFullscreen,
  isLoading,
  onClose,
  onToggleFullscreen,
  onSendReply,
}: ReportThreadPanelProps) {
  const [replyText, setReplyText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const messagesContainerRef = useRef<HTMLDivElement | null>(null);

  const normalizedMessages = useMemo(() => {
    if (!thread || !thread.firstMessage) {
      return messages;
    }

    const firstMessage: ReportMessage = {
      messageType: "normal",
      messageId: `${thread.threadId}-first`,
      createdAt: thread.createdAt,
      content: thread.firstMessage,
      sender: undefined,
    };

    return [firstMessage, ...messages];
  }, [thread, messages]);

  // アニメーション用：DOMがマウントされてからopenクラスを適用
  useEffect(() => {
    if (isOpen) {
      // 次のフレームでopenクラスを適用してアニメーションを発火
      requestAnimationFrame(() => {
        setIsVisible(true);
      });
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || isLoading) {
      return;
    }

    requestAnimationFrame(() => {
      const container = messagesContainerRef.current;
      if (!container) {
        return;
      }

      container.scrollTop = container.scrollHeight;
    });
  }, [isOpen, isLoading, normalizedMessages]);

  const handleSend = useCallback(async () => {
    if (!replyText.trim()) return;

    setIsSending(true);
    try {
      await onSendReply(replyText.trim());
      setReplyText("");
    } finally {
      setIsSending(false);
    }
  }, [replyText, onSendReply]);

  if (!thread) return null;

  const panel = (
    <div
      className={`report-thread-panel ${isVisible ? "open" : ""} ${isFullscreen ? "fullscreen" : ""}`}
      aria-hidden={!isOpen}
    >
      <div className="report-thread-panel-header">
        <div className="report-thread-panel-title">
          <span className="report-thread-status">{thread.currentStatus.mark}</span>
          <span>{thread.title || t("report.untitled")}</span>
        </div>
        <div className="report-thread-panel-actions">
          <button
            type="button"
            className="report-panel-action-btn"
            onClick={onToggleFullscreen}
            title={isFullscreen ? "縮小表示に戻す" : "全画面表示にする"}
            aria-label={isFullscreen ? "縮小表示に戻す" : "全画面表示にする"}
          >
            {isFullscreen ? "🗗" : "⛶"}
          </button>
          <button
            type="button"
            className="report-panel-action-btn"
            onClick={onClose}
            title="閉じる"
          >
            ×
          </button>
        </div>
      </div>

      <div className="report-thread-panel-content" ref={messagesContainerRef}>
        {isLoading ? (
          <div className="report-messages-loading" role="status" aria-live="polite">
            <div className="report-spinner" aria-hidden="true" />
            <span>{t("report.messagesLoading")}</span>
          </div>
        ) : normalizedMessages.length === 0 ? (
          <div className="report-messages-empty">{t("report.messagesEmpty")}</div>
        ) : (
          <div className="report-messages-list">
            {normalizedMessages.map((message) => {
              const isStatus = message.messageType === "status";
              const sender = message.sender;
              const isOwnMessage = !sender?.startsWith("github:");
              const senderName = sender?.replace("github:", "") ?? t("report.untitled");

              return (
                <div
                  key={message.messageId}
                  className={`report-message-bubble ${isStatus ? "status" : ""} ${!isStatus && isOwnMessage ? "own" : !isStatus ? "other" : ""}`}
                >
                  {!isStatus && (
                    <div className="report-message-header">
                      <span className="report-message-sender">
                        {isOwnMessage ? t("report.you") : senderName}
                      </span>
                      <span className="report-message-time">
                        {new Date(message.createdAt).toLocaleString()}
                      </span>
                    </div>
                  )}
                  <div className="report-message-body">
                    {isStatus
                      ? t("report.statusChanged", { status: message.content })
                      : message.content}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="report-thread-panel-footer">
        <input
          type="text"
          className="report-reply-input"
          placeholder={t("report.replyPlaceholder")}
          value={replyText}
          onChange={(e) => setReplyText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSend();
            }
          }}
          disabled={isSending}
        />
        <button
          type="button"
          className="report-reply-button"
          onClick={handleSend}
          disabled={!replyText.trim() || isSending}
        >
          {isSending ? "..." : "→"}
        </button>
      </div>
    </div>
  );

  if (typeof document === "undefined") {
    return panel;
  }

  return createPortal(panel, document.body);
}
