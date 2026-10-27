import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireRoles } from '../auth/authMiddleware.js';
import { SYSTEM_ROLES } from '../auth/roles.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { BadRequestError } from '../errors/AppError.js';
import { KbService } from '../knowledgebase/kbService.js';
import type { ApiResponse } from '../types/index.js';
import type {
  KbCategory,
  KbArticle,
  KbArticleDetail,
  KbStats,
} from '../knowledgebase/types.js';

export const kbRouter = Router();

// All knowledgebase endpoints require authentication
kbRouter.use(authenticate);

// ==========================================
// VALIDATION SCHEMAS
// ==========================================
const createCategorySchema = z.object({
  name: z.string().min(2, 'Category name must be at least 2 characters').max(100),
  slug: z.string().min(2).max(100).optional(),
  description: z.string().max(1000).optional().nullable(),
  icon: z.string().max(64).optional().nullable(),
  display_order: z.number().int().optional().default(0),
  is_active: z.boolean().optional().default(true),
});

const updateCategorySchema = z.object({
  name: z.string().min(2).max(100).optional(),
  slug: z.string().min(2).max(100).optional(),
  description: z.string().max(1000).optional().nullable(),
  icon: z.string().max(64).optional().nullable(),
  display_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

const createArticleSchema = z.object({
  category_id: z.string().min(1, 'Category is required'),
  title: z.string().min(3, 'Title must be at least 3 characters').max(255),
  slug: z.string().min(3).max(255).optional(),
  summary: z.string().min(5, 'Summary must be at least 5 characters').max(2000),
  content: z.string().min(10, 'Content must be at least 10 characters'),
  status: z.enum(['draft', 'published', 'archived']).optional().default('draft'),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
});

const updateArticleSchema = z.object({
  category_id: z.string().min(1).optional(),
  title: z.string().min(3).max(255).optional(),
  slug: z.string().min(3).max(255).optional(),
  summary: z.string().min(5).max(2000).optional(),
  content: z.string().min(10).optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional(),
});

// ==========================================
// CATEGORY ENDPOINTS
// ==========================================

/**
 * 1. GET /api/v1/knowledgebase/categories
 * List categories (Franchise users get active categories with published count; Admins get all)
 */
kbRouter.get(
  '/categories',
  asyncHandler(async (req, res) => {
    const categories = await KbService.listCategories(req.user!);
    const response: ApiResponse<KbCategory[]> = {
      success: true,
      data: categories,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 2. POST /api/v1/knowledgebase/categories
 * Create new category (Super Admin only)
 */
kbRouter.post(
  '/categories',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const parseResult = createCategorySchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid category data');
    }

    const category = await KbService.createCategory(parseResult.data, req.user!);
    const response: ApiResponse<KbCategory> = {
      success: true,
      data: category,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.status(201).json(response);
  })
);

/**
 * 3. PATCH /api/v1/knowledgebase/categories/:id
 * Update category (Super Admin only)
 */
kbRouter.patch(
  '/categories/:id',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const parseResult = updateCategorySchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid category data');
    }

    const category = await KbService.updateCategory(req.params.id, parseResult.data, req.user!);
    const response: ApiResponse<KbCategory> = {
      success: true,
      data: category,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 4. DELETE /api/v1/knowledgebase/categories/:id
 * Delete category (Super Admin only)
 */
kbRouter.delete(
  '/categories/:id',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    await KbService.deleteCategory(req.params.id, req.user!);
    const response: ApiResponse<{ deleted: boolean }> = {
      success: true,
      data: { deleted: true },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

// ==========================================
// ARTICLE ENDPOINTS
// ==========================================

/**
 * 5. GET /api/v1/knowledgebase/articles
 * List articles with filtering, search, and strict published/draft isolation
 */
kbRouter.get(
  '/articles',
  asyncHandler(async (req, res) => {
    const criteria = {
      category_id: typeof req.query.category_id === 'string' ? req.query.category_id : undefined,
      category_slug: typeof req.query.category_slug === 'string' ? req.query.category_slug : undefined,
      status: typeof req.query.status === 'string' ? req.query.status : undefined,
      search: typeof req.query.search === 'string' ? req.query.search : undefined,
      tag: typeof req.query.tag === 'string' ? req.query.tag : undefined,
      page: req.query.page ? parseInt(req.query.page as string, 10) : 1,
      limit: req.query.limit ? parseInt(req.query.limit as string, 10) : 50,
    };

    const result = await KbService.listArticles(criteria, req.user!);
    const response: ApiResponse<KbArticle[]> = {
      success: true,
      data: result.articles,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        pagination: {
          page: result.page,
          limit: result.limit,
          total: result.total,
          totalPages: result.totalPages,
        },
      },
    };
    res.json(response);
  })
);

/**
 * 6. GET /api/v1/knowledgebase/articles/stats
 * Overview counts for knowledgebase
 */
kbRouter.get(
  '/articles/stats',
  asyncHandler(async (req, res) => {
    const stats = await KbService.getStats(req.user!);
    const response: ApiResponse<KbStats> = {
      success: true,
      data: stats,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 7. GET /api/v1/knowledgebase/articles/:id
 * Get single article detail by ID or slug (Drafts strictly blocked from franchise)
 */
kbRouter.get(
  '/articles/:id',
  asyncHandler(async (req, res) => {
    const article = await KbService.getArticleByIdOrSlug(req.params.id, req.user!, true);
    const response: ApiResponse<KbArticleDetail> = {
      success: true,
      data: article,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 8. POST /api/v1/knowledgebase/articles
 * Create new article (Super Admin only)
 */
kbRouter.post(
  '/articles',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const parseResult = createArticleSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid article data');
    }

    const article = await KbService.createArticle(parseResult.data, req.user!);
    const response: ApiResponse<KbArticle> = {
      success: true,
      data: article,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.status(201).json(response);
  })
);

/**
 * 9. PATCH /api/v1/knowledgebase/articles/:id
 * Update article (Super Admin only)
 */
kbRouter.patch(
  '/articles/:id',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    const parseResult = updateArticleSchema.safeParse(req.body);
    if (!parseResult.success) {
      throw new BadRequestError(parseResult.error.issues?.[0]?.message || 'Invalid article update data');
    }

    const article = await KbService.updateArticle(req.params.id, parseResult.data, req.user!);
    const response: ApiResponse<KbArticle> = {
      success: true,
      data: article,
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);

/**
 * 10. DELETE /api/v1/knowledgebase/articles/:id
 * Delete article (Super Admin only)
 */
kbRouter.delete(
  '/articles/:id',
  requireRoles(SYSTEM_ROLES.SUPER_ADMIN),
  asyncHandler(async (req, res) => {
    await KbService.deleteArticle(req.params.id, req.user!);
    const response: ApiResponse<{ deleted: boolean }> = {
      success: true,
      data: { deleted: true },
      meta: {
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
    };
    res.json(response);
  })
);
