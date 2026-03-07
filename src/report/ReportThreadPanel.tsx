import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type { ReportMessage, ReportThread } from "../app/types";
import type { LocaleCode, createTranslator } from "../i18n";
import { isOwnReportMessage } from "./messageOwnership";
import { formatReportDateTime } from "./reportDateTime";

type Translator = ReturnType<typeof createTranslator>;

interface ReportThreadPanelProps {
  locale: LocaleCode;
  t: Translator;
  thread: ReportThread | null;
  messages: ReportMessage[];
  currentUserToken: string | null;
  isOpen: boolean;
  isFullscreen: boolean;
  isLoading: boolean;
  onClose: () => void;
  onToggleFullscreen: () => void;
  onSendReply: (content: string) => Promise<void>;
}

export function ReportThreadPanel({
  locale,
  t,
  thread,
  messages,
  currentUserToken,
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
    // firstMessage を通常メッセージ列の先頭に合成して表示を統一する。
    if (!thread || !thread.firstMessage) {
      return messages;
    }

    const firstMessage: ReportMessage = {
      messageType: "normal",
      messageId: `${thread.threadId}-first`,
      createdAt: thread.createdAt,
      content: thread.firstMessage,
      sender: currentUserToken ?? undefined,
    };

    return [firstMessage, ...messages];
  }, [thread, messages, currentUserToken]);

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
    if (!isOpen || normalizedMessages.length === 0) {
      return;
    }

    // 新着表示時は末尾へスクロールして最新発言を見せる。
    requestAnimationFrame(() => {
      const container = messagesContainerRef.current;
      if (!container) {
        return;
      }

      container.scrollTop = container.scrollHeight;
    });
  }, [isOpen, normalizedMessages]);

  const openExternal = useCallback(async (url: string): Promise<void> => {
    try {
      // Tauri 側の opener を優先し、失敗時のみブラウザ API にフォールバックする。
      await openUrl(url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);

  const handleSend = useCallback(async () => {
    // 空返信は送信しない。
    if (!replyText.trim()) return;

    setIsSending(true);
    try {
      // 送信成功後は入力欄をクリアする。
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
        {normalizedMessages.length === 0 ? (
          isLoading ? (
            // 取得中は output + aria-live で更新をスクリーンリーダーへ通知する。
            <output className="report-messages-loading" aria-live="polite">
              <div className="report-spinner" aria-hidden="true" />
              <span>{t("report.messagesLoading")}</span>
            </output>
          ) : (
            <div className="report-messages-empty">{t("report.messagesEmpty")}</div>
          )
        ) : (
          <div className="report-messages-list">
            {normalizedMessages.map((message) => {
              const isStatus = message.messageType === "status";
              const sender = message.sender;
              // sender と現在の報告トークンが一致するものだけ自分側に寄せる。
              const isOwnMessage = isOwnReportMessage(sender, currentUserToken);
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
                        {formatReportDateTime(message.createdAt, locale)}
                      </span>
                    </div>
                  )}
                  <div className="report-message-body">
                    {isStatus
                      ? t("report.statusChanged", { status: message.content })
                      : (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          rehypePlugins={[rehypeSanitize]}
                          components={{
                            a: ({ href, children }) => (
                              <a
                                href={href}
                                onClick={(event) => {
                                  event.preventDefault();
                                  if (!href) {
                                    return;
                                  }
                                  void openExternal(href);
                                }}
                              >
                                {children}
                              </a>
                            ),
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      )}
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
