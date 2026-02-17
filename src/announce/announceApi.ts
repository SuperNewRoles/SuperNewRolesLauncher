import { ANNOUNCE_API_BASE_URL } from "../app/constants";
import type { LocaleCode } from "../i18n";
import type { AnnounceArticle, AnnounceArticleMinimal, AnnounceArticlesResponse } from "./types";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;
const DEFAULT_FALLBACK = "true";

function buildApiUrl(path: string, params: Record<string, string | number | undefined>): URL {
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
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const message = await readErrorMessage(response);
    throw new Error(`${message} (${response.status})`);
  }

  return (await response.json()) as T;
}

export async function announceListArticles(locale: LocaleCode): Promise<AnnounceArticlesResponse> {
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
  const url = buildApiUrl(`articles/${encodeURIComponent(articleId)}`, {
    lang: locale,
    fallback: DEFAULT_FALLBACK,
  });
  return requestJson<AnnounceArticle>(url);
}

export type { AnnounceArticleMinimal };
