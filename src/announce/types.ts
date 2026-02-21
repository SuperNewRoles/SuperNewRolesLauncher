// お知らせに付与されるタグ情報。
export interface AnnounceTag {
  id: string;
  name: string;
  lang: string;
  color: string;
}

// 一覧表示に必要な最小記事情報。
export interface AnnounceArticleMinimal {
  id: string;
  title: string;
  url: string;
  tags: AnnounceTag[];
  lang: string;
  // requested_lang はクライアントが指定した言語。
  requested_lang: string;
  is_fallback: boolean;
  created_at: string;
  updated_at: string;
}

// 詳細表示向けに本文を含めた記事情報。
export interface AnnounceArticle extends AnnounceArticleMinimal {
  body: string;
}

// お知らせ一覧 API のレスポンス形式。
export interface AnnounceArticlesResponse {
  items: AnnounceArticleMinimal[];
  page: number;
  page_size: number;
  total: number;
}
