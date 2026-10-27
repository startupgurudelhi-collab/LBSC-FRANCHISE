export type KbArticleStatus = 'draft' | 'published' | 'archived';

export interface KbCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  display_order: number;
  is_active: number;
  created_at: string;
  updated_at: string;
  article_count?: number;
}

export interface KbArticle {
  id: string;
  category_id: string;
  category_name?: string;
  category_slug?: string;
  title: string;
  slug: string;
  summary: string;
  content: string;
  status: KbArticleStatus;
  author_user_id: string;
  author_name?: string;
  author_email?: string;
  published_at: string | null;
  tags: string[] | string | null;
  view_count: number;
  created_at: string;
  updated_at: string;
}

export interface KbArticleDetail extends KbArticle {
  related_articles?: Array<{
    id: string;
    title: string;
    slug: string;
    summary: string;
  }>;
}

export interface CreateCategoryInput {
  name: string;
  slug?: string;
  description?: string | null;
  icon?: string | null;
  display_order?: number;
  is_active?: boolean;
}

export interface UpdateCategoryInput {
  name?: string;
  slug?: string;
  description?: string | null;
  icon?: string | null;
  display_order?: number;
  is_active?: boolean;
}

export interface CreateArticleInput {
  category_id: string;
  title: string;
  slug?: string;
  summary: string;
  content: string;
  status?: KbArticleStatus;
  tags?: string[] | string;
}

export interface UpdateArticleInput {
  category_id?: string;
  title?: string;
  slug?: string;
  summary?: string;
  content?: string;
  status?: KbArticleStatus;
  tags?: string[] | string;
}

export interface ArticleFilterCriteria {
  category_id?: string;
  category_slug?: string;
  status?: string;
  search?: string;
  tag?: string;
  page?: number;
  limit?: number;
}

export interface KbStats {
  totalArticles: number;
  publishedArticles: number;
  draftArticles: number;
  archivedArticles: number;
  totalCategories: number;
  totalViews: number;
}
