import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import { ANNOUNCE_BADGE_READ_CREATED_AT_STORAGE_KEY } from "../app/constants";
import type { LocaleCode } from "../i18n";
import type { createTranslator } from "../i18n";
import { announceGetArticle, announceListArticles } from "./announceApi";
import type { AnnounceArticle, AnnounceArticleMinimal } from "./types";

const ANNOUNCE_POLL_INTERVAL_MS = 300_000;

type Translator = ReturnType<typeof createTranslator>;

interface AnnounceCenterProps {
  locale: LocaleCode;
  t: Translator;
  onArticlesUpdated?: (items: AnnounceArticleMinimal[]) => void;
  onArticleSelectedByUser?: (article: AnnounceArticleMinimal) => void;
}

function formatDateTime(value: string, locale: LocaleCode): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString(locale);
}

function parseAnnounceCreatedAt(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function getAnnounceReadCreatedAt(): number | null {
  try {
    const value = localStorage.getItem(ANNOUNCE_BADGE_READ_CREATED_AT_STORAGE_KEY);
    if (!value) {
      return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function AnnounceCenter({
  locale,
  t,
  onArticlesUpdated,
  onArticleSelectedByUser,
}: AnnounceCenterProps) {
  const readCreatedAt = getAnnounceReadCreatedAt();
  const [items, setItems] = useState<AnnounceArticleMinimal[]>([]);
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [selectedArticle, setSelectedArticle] = useState<AnnounceArticle | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const selectedArticleIdRef = useRef<string | null>(null);
  const articleCacheRef = useRef<Map<string, AnnounceArticle>>(new Map());
  const isMountedRef = useRef(false);

  useEffect(() => {
    selectedArticleIdRef.current = selectedArticleId;
  }, [selectedArticleId]);

  const openExternal = useCallback(async (url: string): Promise<void> => {
    try {
      await openUrl(url);
    } catch {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  }, []);

  const loadDetail = useCallback(
    async (articleId: string, force = false): Promise<void> => {
      if (!force) {
        const cached = articleCacheRef.current.get(articleId);
        if (cached) {
          setSelectedArticle(cached);
          setDetailError(null);
          return;
        }
      }

      setLoadingDetail(true);
      setDetailError(null);

      try {
        const detail = await announceGetArticle(articleId, locale);
        if (!isMountedRef.current) {
          return;
        }
        articleCacheRef.current.set(articleId, detail);
        setSelectedArticle(detail);
      } catch (error) {
        if (!isMountedRef.current) {
          return;
        }
        setDetailError(t("announce.detailLoadFailed", { error: String(error) }));
      } finally {
        if (isMountedRef.current) {
          setLoadingDetail(false);
        }
      }
    },
    [locale, t],
  );

  const refreshArticles = useCallback(
    async (manual = false): Promise<void> => {
      if (manual) {
        setStatusMessage(t("announce.loadingList"));
      }

      setLoadingList(true);
      setListError(null);

      try {
        const response = await announceListArticles(locale);
        if (!isMountedRef.current) {
          return;
        }

        const nextItems = response.items;
        setItems(nextItems);
        onArticlesUpdated?.(nextItems);

        if (nextItems.length === 0) {
          setSelectedArticleId(null);
          setSelectedArticle(null);
          setDetailError(null);
          if (manual) {
            setStatusMessage(t("announce.updated"));
          }
          return;
        }

        const preferredId = selectedArticleIdRef.current;
        const nextSelectedId =
          preferredId && nextItems.some((item) => item.id === preferredId)
            ? preferredId
            : nextItems[0].id;

        setSelectedArticleId(nextSelectedId);
        selectedArticleIdRef.current = nextSelectedId;
        await loadDetail(nextSelectedId, manual);

        if (manual) {
          setStatusMessage(t("announce.updated"));
        }
      } catch (error) {
        if (!isMountedRef.current) {
          return;
        }
        setListError(t("announce.listLoadFailed", { error: String(error) }));
        if (manual) {
          setStatusMessage("");
        }
      } finally {
        if (isMountedRef.current) {
          setLoadingList(false);
        }
      }
    },
    [loadDetail, locale, onArticlesUpdated, t],
  );

  useEffect(() => {
    isMountedRef.current = true;
    articleCacheRef.current.clear();
    void refreshArticles();

    const timer = window.setInterval(() => {
      void refreshArticles();
    }, ANNOUNCE_POLL_INTERVAL_MS);

    return () => {
      isMountedRef.current = false;
      window.clearInterval(timer);
    };
  }, [refreshArticles]);

  const handleSelectArticle = useCallback(
    (item: AnnounceArticleMinimal): void => {
      const articleId = item.id;
      setSelectedArticleId(articleId);
      selectedArticleIdRef.current = articleId;
      setStatusMessage("");
      onArticleSelectedByUser?.(item);
      void loadDetail(articleId);
    },
    [loadDetail, onArticleSelectedByUser],
  );

  const listHeaderMessage = loadingList ? t("announce.loadingList") : statusMessage;
  const detailStatusMessage = loadingDetail ? t("announce.loadingDetail") : "";

  return (
    <div className="announce-center-container">
      <div className="announce-layout">
        <section className="announce-list-pane">
          <header className="announce-list-header">
            <h2 className="announce-pane-title">{t("announce.tab")}</h2>
            <div className="announce-list-header-tools">
              {listHeaderMessage ? (
                <div className="announce-list-header-status" aria-live="polite">
                  {listHeaderMessage}
                </div>
              ) : null}
              <button
                type="button"
                className="announce-refresh-button"
                onClick={() => {
                  void refreshArticles(true);
                }}
                disabled={loadingList || loadingDetail}
              >
                {t("announce.refresh")}
              </button>
            </div>
          </header>

          {listError ? <div className="announce-error-line">{listError}</div> : null}
          {!loadingList && items.length === 0 ? (
            <div className="announce-list-empty">{t("announce.empty")}</div>
          ) : null}

          {items.length > 0 ? (
            <div className="announce-list" aria-label={t("announce.tab")}>
              {items.map((item) => {
                const selected = item.id === selectedArticleId;
                const itemCreatedAt = parseAnnounceCreatedAt(item.created_at);
                const unread = readCreatedAt === null || itemCreatedAt > readCreatedAt;
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`announce-list-item${selected ? " is-active" : ""}`}
                    onClick={() => {
                      handleSelectArticle(item);
                    }}
                    aria-pressed={selected}
                  >
                    <div className="announce-list-item-heading">
                      <div className="announce-list-item-title">{item.title}</div>
                      {unread ? (
                        <span className="announce-list-unread-badge" aria-hidden="true">
                          !
                        </span>
                      ) : null}
                    </div>
                    <div className="announce-list-item-meta">
                      {t("announce.updatedAt")}: {formatDateTime(item.updated_at, locale)}
                    </div>
                    {item.tags.length > 0 ? (
                      <div className="announce-tags">
                        {item.tags.map((tag) => (
                          <span
                            key={`${item.id}-${tag.id}`}
                            className="announce-tag"
                            style={{ borderColor: tag.color, color: tag.color }}
                          >
                            {tag.name}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>

        <section className="announce-detail-pane">
          <div
            className={`announce-detail-pane-status${detailStatusMessage ? " is-visible" : ""}`}
            aria-live="polite"
          >
            {detailStatusMessage}
          </div>
          {!selectedArticle ? (
            <div className="announce-detail-empty">{t("announce.selectPrompt")}</div>
          ) : (
            <>
              <header className="announce-detail-header">
                <h2 className="announce-detail-title">{selectedArticle.title}</h2>
                {selectedArticle.is_fallback ? (
                  <div className="announce-detail-meta">
                    <span className="announce-fallback-chip">{t("announce.fallback")}</span>
                  </div>
                ) : null}
                <div className="announce-detail-meta">
                  <span>
                    {t("announce.createdAt")}: {formatDateTime(selectedArticle.created_at, locale)}
                  </span>
                  <span>
                    {t("announce.updatedAt")}: {formatDateTime(selectedArticle.updated_at, locale)}
                  </span>
                </div>
                {selectedArticle.tags.length > 0 ? (
                  <div className="announce-tags">
                    {selectedArticle.tags.map((tag) => (
                      <span
                        key={`detail-${selectedArticle.id}-${tag.id}`}
                        className="announce-tag"
                        style={{ borderColor: tag.color, color: tag.color }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </header>

              {detailError ? <div className="announce-error-line">{detailError}</div> : null}

              <div className="announce-detail-body">
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
                  {selectedArticle.body}
                </ReactMarkdown>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
