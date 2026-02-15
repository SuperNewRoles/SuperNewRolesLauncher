export interface AnnounceTag {
  id: string;
  name: string;
  lang: string;
  color: string;
}

export interface AnnounceArticleMinimal {
  id: string;
  title: string;
  url: string;
  tags: AnnounceTag[];
  lang: string;
  requested_lang: string;
  is_fallback: boolean;
  created_at: string;
  updated_at: string;
}

export interface AnnounceArticle extends AnnounceArticleMinimal {
  body: string;
}

export interface AnnounceArticlesResponse {
  items: AnnounceArticleMinimal[];
  page: number;
  page_size: number;
  total: number;
}
