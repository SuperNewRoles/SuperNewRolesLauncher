import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANNOUNCE_API_BASE_URL } from "../app/constants";
import { announceGetArticle, announceListArticles } from "./announceApi";

describe("announceApi", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses constant base URL and appends list query params", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          items: [],
          page: 1,
          page_size: 20,
          total: 0,
        }),
        { status: 200 },
      ),
    );

    await announceListArticles("ja");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl] = fetchMock.mock.calls[0] as [RequestInfo | URL];
    const url = new URL(String(requestUrl));

    expect(ANNOUNCE_API_BASE_URL).toBe("https://announce.supernewroles.com/api/v1/");
    expect(`${url.origin}${url.pathname}`).toBe("https://announce.supernewroles.com/api/v1/articles");
    expect(url.searchParams.get("lang")).toBe("ja");
    expect(url.searchParams.get("fallback")).toBe("true");
    expect(url.searchParams.get("page")).toBe("1");
    expect(url.searchParams.get("page_size")).toBe("20");
  });

  it("builds detail URL with fallback and lang", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "hello world",
          title: "title",
          body: "body",
          url: "https://example.test",
          tags: [],
          lang: "en",
          requested_lang: "en",
          is_fallback: false,
          created_at: "2026-01-01T00:00:00.000Z",
          updated_at: "2026-01-01T00:00:00.000Z",
        }),
        { status: 200 },
      ),
    );

    await announceGetArticle("hello world", "en");

    const [requestUrl] = fetchMock.mock.calls[0] as [RequestInfo | URL];
    const url = new URL(String(requestUrl));

    expect(url.pathname).toBe("/api/v1/articles/hello%20world");
    expect(url.searchParams.get("lang")).toBe("en");
    expect(url.searchParams.get("fallback")).toBe("true");
  });

  it("throws when HTTP status is not ok", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message: "invalid param",
          },
        }),
        { status: 400 },
      ),
    );

    await expect(announceListArticles("ja")).rejects.toThrow("invalid param (400)");
  });
});
