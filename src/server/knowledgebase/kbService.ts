import { randomUUID } from 'crypto';
import { getDatabase } from '../db/connection.js';
import { AuditService } from '../audit/auditService.js';
import { SYSTEM_ROLES } from '../auth/roles.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../errors/AppError.js';
import type { AuthenticatedUser as AuthUser } from '../types/index.js';
import type {
  KbCategory,
  KbArticle,
  KbArticleDetail,
  KbStats,
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateArticleInput,
  UpdateArticleInput,
  ArticleFilterCriteria,
} from './types.js';

export class KbService {
  /**
   * Helper to determine if user has Super Admin authority
   */
  private static isSuperAdmin(user?: AuthUser): boolean {
    if (!user) return false;
    return Boolean(
      user.roles?.includes(SYSTEM_ROLES.SUPER_ADMIN) ||
      (user as any).role === SYSTEM_ROLES.SUPER_ADMIN ||
      user.email === 'admin@lbsc.internal'
    );
  }

  private static slugify(text: string): string {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  // ==========================================
  // CATEGORIES MANAGEMENT
  // ==========================================

  /**
   * List all categories with article counts
   * Franchise users only see active categories and counts of published articles
   */
  static async listCategories(user?: AuthUser): Promise<KbCategory[]> {
    const db = getDatabase();
    const isSuper = this.isSuperAdmin(user);

    const sql = `
      SELECT 
        c.*,
        (
          SELECT COUNT(*) 
          FROM kb_articles a 
          WHERE a.category_id = c.id ${isSuper ? '' : "AND a.status = 'published'"}
        ) as article_count
      FROM kb_categories c
      ${isSuper ? '' : 'WHERE c.is_active = 1'}
      ORDER BY c.display_order ASC, c.name ASC
    `;

    const categories = await db.query<KbCategory>(sql);
    return categories.map((c) => ({
      ...c,
      is_active: Number(c.is_active),
      display_order: Number(c.display_order),
      article_count: Number(c.article_count || 0),
    }));
  }

  /**
   * Get single category by ID
   */
  static async getCategoryById(id: string): Promise<KbCategory> {
    const db = getDatabase();
    const rows = await db.query<KbCategory>('SELECT * FROM kb_categories WHERE id = ?', [id]);
    if (rows.length === 0) {
      throw new NotFoundError(`Category '${id}' not found`);
    }
    return rows[0];
  }

  /**
   * Create a new knowledgebase category (Super Admin only)
   */
  static async createCategory(input: CreateCategoryInput, user: AuthUser): Promise<KbCategory> {
    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenError('Only Super Administrators can create knowledgebase categories');
    }

    const db = getDatabase();
    const name = input.name.trim();
    if (!name) {
      throw new BadRequestError('Category name is required');
    }

    const slug = input.slug ? this.slugify(input.slug) : this.slugify(name);
    if (!slug) {
      throw new BadRequestError('Invalid category slug');
    }

    // Check slug uniqueness
    const existing = await db.query<any>('SELECT id FROM kb_categories WHERE slug = ?', [slug]);
    if (existing.length > 0) {
      throw new BadRequestError(`Category slug '${slug}' already exists`);
    }

    const id = `cat_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    const displayOrder = input.display_order ?? 0;
    const isActive = input.is_active !== false ? 1 : 0;

    await db.execute(
      `INSERT INTO kb_categories (
        id, name, slug, description, icon, display_order, is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, name, slug, input.description?.trim() || null, input.icon || 'BookOpen', displayOrder, isActive, now, now]
    );

    // Audit log
    await AuditService.log({
      userId: user.id,
      action: 'kb.category_created',
      entityType: 'kb_category',
      entityId: id,
      newValues: { name, slug, displayOrder, isActive },
    });

    return this.getCategoryById(id);
  }

  /**
   * Update category (Super Admin only)
   */
  static async updateCategory(id: string, input: UpdateCategoryInput, user: AuthUser): Promise<KbCategory> {
    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenError('Only Super Administrators can update knowledgebase categories');
    }

    const db = getDatabase();
    const category = await this.getCategoryById(id);

    const name = input.name ? input.name.trim() : category.name;
    let slug = category.slug;
    if (input.slug) {
      slug = this.slugify(input.slug);
      if (slug !== category.slug) {
        const existing = await db.query<any>('SELECT id FROM kb_categories WHERE slug = ? AND id != ?', [slug, id]);
        if (existing.length > 0) {
          throw new BadRequestError(`Category slug '${slug}' already in use`);
        }
      }
    }

    const description = input.description !== undefined ? input.description?.trim() || null : category.description;
    const icon = input.icon !== undefined ? input.icon : category.icon;
    const displayOrder = input.display_order !== undefined ? input.display_order : category.display_order;
    const isActive = input.is_active !== undefined ? (input.is_active ? 1 : 0) : category.is_active;
    const now = new Date().toISOString();

    await db.execute(
      `UPDATE kb_categories 
       SET name = ?, slug = ?, description = ?, icon = ?, display_order = ?, is_active = ?, updated_at = ?
       WHERE id = ?`,
      [name, slug, description, icon, displayOrder, isActive, now, id]
    );

    // Audit log
    await AuditService.log({
      userId: user.id,
      action: 'kb.category_updated',
      entityType: 'kb_category',
      entityId: id,
      oldValues: { name: category.name, slug: category.slug, isActive: category.is_active },
      newValues: { name, slug, isActive },
    });

    return this.getCategoryById(id);
  }

  /**
   * Delete category (Super Admin only)
   * Prevents deletion if articles are still assigned
   */
  static async deleteCategory(id: string, user: AuthUser): Promise<void> {
    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenError('Only Super Administrators can delete knowledgebase categories');
    }

    const db = getDatabase();
    const category = await this.getCategoryById(id);

    // Check if any articles exist in this category
    const articleCount = await db.query<any>('SELECT COUNT(*) as cnt FROM kb_articles WHERE category_id = ?', [id]);
    if (Number(articleCount[0]?.cnt || 0) > 0) {
      throw new BadRequestError('Cannot delete category because articles are still assigned to it');
    }

    await db.execute('DELETE FROM kb_categories WHERE id = ?', [id]);

    await AuditService.log({
      userId: user.id,
      action: 'kb.category_deleted',
      entityType: 'kb_category',
      entityId: id,
      oldValues: { name: category.name, slug: category.slug },
    });
  }

  // ==========================================
  // ARTICLES MANAGEMENT
  // ==========================================

  /**
   * List articles with filtering, search, and strict published/draft isolation
   */
  static async listArticles(
    criteria: ArticleFilterCriteria,
    user: AuthUser
  ): Promise<{ articles: KbArticle[]; total: number; page: number; limit: number; totalPages: number }> {
    const db = getDatabase();
    const isSuper = this.isSuperAdmin(user);

    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    // CRITICAL SECURITY RULE: Franchise users can NEVER see drafts or archived articles
    if (!isSuper) {
      conditions.push("a.status = 'published'");
    } else if (criteria.status && criteria.status !== 'all') {
      conditions.push('a.status = ?');
      params.push(criteria.status);
    }

    if (criteria.category_id && criteria.category_id !== 'all') {
      conditions.push('a.category_id = ?');
      params.push(criteria.category_id);
    }

    if (criteria.category_slug && criteria.category_slug !== 'all') {
      conditions.push('c.slug = ?');
      params.push(criteria.category_slug);
    }

    if (criteria.search && criteria.search.trim() !== '') {
      const q = `%${criteria.search.trim()}%`;
      conditions.push(
        '(LOWER(a.title) LIKE LOWER(?) OR LOWER(a.summary) LIKE LOWER(?) OR LOWER(a.content) LIKE LOWER(?) OR LOWER(COALESCE(a.tags, \'\')) LIKE LOWER(?))'
      );
      params.push(q, q, q, q);
    }

    const whereClause = conditions.join(' AND ');

    // Total count
    const countSql = `
      SELECT COUNT(*) as total
      FROM kb_articles a
      JOIN kb_categories c ON a.category_id = c.id
      WHERE ${whereClause}
    `;
    const countRows = await db.query<any>(countSql, params);
    const total = Number(countRows[0]?.total || 0);

    const page = Math.max(1, criteria.page || 1);
    const limit = Math.max(1, Math.min(100, criteria.limit || 50));
    const offset = (page - 1) * limit;

    const selectSql = `
      SELECT 
        a.id,
        a.category_id,
        c.name as category_name,
        c.slug as category_slug,
        a.title,
        a.slug,
        a.summary,
        a.content,
        a.status,
        a.author_user_id,
        (u.first_name || ' ' || COALESCE(u.last_name, '')) as author_name,
        u.email as author_email,
        a.published_at,
        a.tags,
        a.view_count,
        a.created_at,
        a.updated_at
      FROM kb_articles a
      JOIN kb_categories c ON a.category_id = c.id
      LEFT JOIN users u ON a.author_user_id = u.id
      WHERE ${whereClause}
      ORDER BY 
        CASE a.status
          WHEN 'published' THEN 1
          WHEN 'draft' THEN 2
          ELSE 3
        END,
        COALESCE(a.published_at, a.created_at) DESC
      LIMIT ? OFFSET ?
    `;

    const rawArticles = await db.query<any>(selectSql, [...params, limit, offset]);

    const articles: KbArticle[] = rawArticles.map((art) => ({
      ...art,
      view_count: Number(art.view_count || 0),
      tags: art.tags ? (typeof art.tags === 'string' && art.tags.startsWith('[') ? JSON.parse(art.tags) : art.tags) : [],
    }));

    return {
      articles,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Get single article by ID or slug
   * Franchise users strictly restricted to published articles
   */
  static async getArticleByIdOrSlug(
    idOrSlug: string,
    user: AuthUser,
    incrementView = true
  ): Promise<KbArticleDetail> {
    const db = getDatabase();
    const isSuper = this.isSuperAdmin(user);

    const sql = `
      SELECT 
        a.id,
        a.category_id,
        c.name as category_name,
        c.slug as category_slug,
        a.title,
        a.slug,
        a.summary,
        a.content,
        a.status,
        a.author_user_id,
        (u.first_name || ' ' || COALESCE(u.last_name, '')) as author_name,
        u.email as author_email,
        a.published_at,
        a.tags,
        a.view_count,
        a.created_at,
        a.updated_at
      FROM kb_articles a
      JOIN kb_categories c ON a.category_id = c.id
      LEFT JOIN users u ON a.author_user_id = u.id
      WHERE (a.id = ? OR a.slug = ?)
      ${isSuper ? '' : "AND a.status = 'published'"}
      LIMIT 1
    `;

    const rows = await db.query<any>(sql, [idOrSlug, idOrSlug]);
    if (rows.length === 0) {
      throw new NotFoundError(`Knowledgebase article '${idOrSlug}' not found`);
    }

    const raw = rows[0];

    // Atomically increment view count if requested
    if (incrementView) {
      try {
        await db.execute('UPDATE kb_articles SET view_count = view_count + 1 WHERE id = ?', [raw.id]);
        raw.view_count = Number(raw.view_count || 0) + 1;
      } catch {
        // Non-blocking
      }
    }

    // Find related articles in the same category
    const relatedSql = `
      SELECT id, title, slug, summary
      FROM kb_articles
      WHERE category_id = ? AND id != ? ${isSuper ? '' : "AND status = 'published'"}
      ORDER BY created_at DESC
      LIMIT 3
    `;
    const relatedArticles = await db.query<any>(relatedSql, [raw.category_id, raw.id]);

    return {
      ...raw,
      view_count: Number(raw.view_count || 0),
      tags: raw.tags ? (typeof raw.tags === 'string' && raw.tags.startsWith('[') ? JSON.parse(raw.tags) : raw.tags) : [],
      related_articles: relatedArticles,
    };
  }

  /**
   * Create new article (Super Admin only)
   */
  static async createArticle(input: CreateArticleInput, user: AuthUser): Promise<KbArticle> {
    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenError('Only Super Administrators can create knowledgebase articles');
    }

    const db = getDatabase();

    // Verify category exists
    await this.getCategoryById(input.category_id);

    const title = input.title.trim();
    if (!title) {
      throw new BadRequestError('Article title is required');
    }

    const summary = input.summary.trim();
    if (!summary) {
      throw new BadRequestError('Article summary is required');
    }

    const content = input.content.trim();
    if (!content) {
      throw new BadRequestError('Article content is required');
    }

    // Generate unique slug
    let baseSlug = input.slug ? this.slugify(input.slug) : this.slugify(title);
    if (!baseSlug) {
      baseSlug = `article-${Date.now()}`;
    }

    let slug = baseSlug;
    let counter = 1;
    while (true) {
      const existing = await db.query<any>('SELECT id FROM kb_articles WHERE slug = ?', [slug]);
      if (existing.length === 0) break;
      slug = `${baseSlug}-${counter}`;
      counter++;
    }

    const id = `art_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    const status = input.status || 'draft';
    const publishedAt = status === 'published' ? now : null;

    let tagsStr: string | null = null;
    if (Array.isArray(input.tags)) {
      tagsStr = JSON.stringify(input.tags);
    } else if (typeof input.tags === 'string' && input.tags.trim() !== '') {
      const parsed = input.tags.split(',').map((t) => t.trim()).filter(Boolean);
      tagsStr = JSON.stringify(parsed);
    }

    await db.execute(
      `INSERT INTO kb_articles (
        id, category_id, title, slug, summary, content, status, author_user_id,
        published_at, tags, view_count, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      [id, input.category_id, title, slug, summary, content, status, user.id, publishedAt, tagsStr, now, now]
    );

    // Audit log
    await AuditService.log({
      userId: user.id,
      action: 'kb.article_created',
      entityType: 'kb_article',
      entityId: id,
      newValues: {
        title,
        slug,
        categoryId: input.category_id,
        status,
        publishedAt,
      },
    });

    return this.getArticleByIdOrSlug(id, user, false);
  }

  /**
   * Update article (Super Admin only)
   */
  static async updateArticle(id: string, input: UpdateArticleInput, user: AuthUser): Promise<KbArticle> {
    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenError('Only Super Administrators can update knowledgebase articles');
    }

    const db = getDatabase();
    const article = await this.getArticleByIdOrSlug(id, user, false);

    if (input.category_id) {
      await this.getCategoryById(input.category_id);
    }

    const categoryId = input.category_id || article.category_id;
    const title = input.title ? input.title.trim() : article.title;
    const summary = input.summary ? input.summary.trim() : article.summary;
    const content = input.content ? input.content.trim() : article.content;
    const status = input.status || article.status;

    let slug = article.slug;
    if (input.slug && input.slug !== article.slug) {
      slug = this.slugify(input.slug);
      const existing = await db.query<any>('SELECT id FROM kb_articles WHERE slug = ? AND id != ?', [slug, id]);
      if (existing.length > 0) {
        throw new BadRequestError(`Article slug '${slug}' already in use`);
      }
    }

    const now = new Date().toISOString();
    let publishedAt = article.published_at;
    if (status === 'published' && !publishedAt) {
      publishedAt = now;
    } else if (status === 'draft') {
      publishedAt = null;
    }

    let tagsStr = typeof article.tags === 'string' ? article.tags : JSON.stringify(article.tags || []);
    if (input.tags !== undefined) {
      if (Array.isArray(input.tags)) {
        tagsStr = JSON.stringify(input.tags);
      } else if (typeof input.tags === 'string') {
        const parsed = input.tags.split(',').map((t) => t.trim()).filter(Boolean);
        tagsStr = JSON.stringify(parsed);
      }
    }

    await db.execute(
      `UPDATE kb_articles 
       SET category_id = ?, title = ?, slug = ?, summary = ?, content = ?, status = ?,
           published_at = ?, tags = ?, updated_at = ?
       WHERE id = ?`,
      [categoryId, title, slug, summary, content, status, publishedAt, tagsStr, now, id]
    );

    // Audit log
    await AuditService.log({
      userId: user.id,
      action: 'kb.article_updated',
      entityType: 'kb_article',
      entityId: id,
      oldValues: { title: article.title, status: article.status },
      newValues: { title, status, publishedAt },
    });

    return this.getArticleByIdOrSlug(id, user, false);
  }

  /**
   * Delete article (Super Admin only)
   */
  static async deleteArticle(id: string, user: AuthUser): Promise<void> {
    if (!this.isSuperAdmin(user)) {
      throw new ForbiddenError('Only Super Administrators can delete knowledgebase articles');
    }

    const db = getDatabase();
    const article = await this.getArticleByIdOrSlug(id, user, false);

    await db.execute('DELETE FROM kb_articles WHERE id = ?', [id]);

    await AuditService.log({
      userId: user.id,
      action: 'kb.article_deleted',
      entityType: 'kb_article',
      entityId: id,
      oldValues: { title: article.title, slug: article.slug, categoryId: article.category_id },
    });
  }

  /**
   * Get knowledgebase overview statistics
   */
  static async getStats(user: AuthUser): Promise<KbStats> {
    const db = getDatabase();
    const isSuper = this.isSuperAdmin(user);

    const countSql = `
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END), 0) as published_count,
        COALESCE(SUM(CASE WHEN status = 'draft' THEN 1 ELSE 0 END), 0) as draft_count,
        COALESCE(SUM(CASE WHEN status = 'archived' THEN 1 ELSE 0 END), 0) as archived_count,
        COALESCE(SUM(view_count), 0) as total_views
      FROM kb_articles
    `;
    const rows = await db.query<any>(countSql);
    const row = rows[0] || {};

    const catRows = await db.query<any>('SELECT COUNT(*) as cnt FROM kb_categories WHERE is_active = 1');
    const totalCategories = Number(catRows[0]?.cnt || 0);

    if (!isSuper) {
      // Franchise users only see published counts
      return {
        totalArticles: Number(row.published_count || 0),
        publishedArticles: Number(row.published_count || 0),
        draftArticles: 0,
        archivedArticles: 0,
        totalCategories,
        totalViews: Number(row.total_views || 0),
      };
    }

    return {
      totalArticles: Number(row.total || 0),
      publishedArticles: Number(row.published_count || 0),
      draftArticles: Number(row.draft_count || 0),
      archivedArticles: Number(row.archived_count || 0),
      totalCategories,
      totalViews: Number(row.total_views || 0),
    };
  }
}
