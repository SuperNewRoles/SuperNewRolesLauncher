import { ANNOUNCE_API_BASE_URL } from "../app/constants";
import type { LocaleCode } from "../i18n";
import type { AnnounceArticle, AnnounceArticleMinimal, AnnounceArticlesResponse } from "./types";

// 一覧取得の既定ページング設定。
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
// API 側のフォールバック言語を有効化する既定値。
const DEFAULT_FALLBACK = "true";

function buildApiUrl(path: string, params: Record<string, string | number | undefined>): URL {
  // ベース URL とパスを結合し、未定義パラメータは送らない。
  const url = new URL(path.replace(/^\//, ""), ANNOUNCE_API_BASE_URL);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url;
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    // API エラー形式があれば message を優先利用する。
    const body = (await response.json()) as {
      error?: {
        message?: string;
      };
    };
    const message = body.error?.message?.trim();
    if (message) {
      return message;
    }
  } catch {
    // ignore parse errors
  }
  return `Request failed with status ${response.status}`;
}

async function requestJson<T>(url: URL): Promise<T> {
  // 認証不要の読み取り API を GET + JSON で統一する。
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    // 呼び出し元で通知しやすいよう、HTTP ステータス込みで例外化する。
    const message = await readErrorMessage(response);
    throw new Error(`${message} (${response.status})`);
  }

  return (await response.json()) as T;
}

export async function announceListArticles(locale: LocaleCode): Promise<AnnounceArticlesResponse> {
  // 一覧は固定サイズで取得し、UI 側の表示と整合させる。
  const url = buildApiUrl("articles", {
    lang: locale,
    fallback: DEFAULT_FALLBACK,
    page: DEFAULT_PAGE,
    page_size: DEFAULT_PAGE_SIZE,
  });
  return requestJson<AnnounceArticlesResponse>(url);
}

export async function announceGetArticle(
  articleId: string,
  locale: LocaleCode,
): Promise<AnnounceArticle> {
  // ID は URL 安全化してから詳細 API を呼ぶ。
  const url = buildApiUrl(`articles/${encodeURIComponent(articleId)}`, {
    lang: locale,
    fallback: DEFAULT_FALLBACK,
  });
  return requestJson<AnnounceArticle>(url);
}

export type { AnnounceArticleMinimal };
