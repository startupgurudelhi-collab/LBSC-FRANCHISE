import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  Plus,
  Search,
  Filter,
  Edit2,
  Trash2,
  Eye,
  CheckCircle2,
  Clock,
  Archive,
  Layers,
  X,
  FileText,
  Tag,
  ArrowUpDown,
  RefreshCw,
  ExternalLink,
  ShieldAlert,
  AlertCircle,
} from 'lucide-react';
import { ApiClient } from '../../api';
import type { KbArticle, KbArticleDetail, KbCategory, KbStats, KbArticleStatus } from '../../types';

export const AdminKnowledgebaseView: React.FC = () => {
  // Articles and filters state
  const [articles, setArticles] = useState<KbArticle[]>([]);
  const [categories, setCategories] = useState<KbCategory[]>([]);
  const [stats, setStats] = useState<KbStats>({
    totalArticles: 0,
    publishedArticles: 0,
    draftArticles: 0,
    archivedArticles: 0,
    totalCategories: 0,
    totalViews: 0,
  });
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Article Modal State (Create / Edit)
  const [showArticleModal, setShowArticleModal] = useState(false);
  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [articleForm, setArticleForm] = useState({
    category_id: '',
    title: '',
    slug: '',
    summary: '',
    content: '',
    status: 'draft' as KbArticleStatus,
    tags: '',
  });
  const [submittingArticle, setSubmittingArticle] = useState(false);
  const [articleError, setArticleError] = useState<string | null>(null);

  // Category Management Modal State
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [categoryForm, setCategoryForm] = useState({
    id: '',
    name: '',
    slug: '',
    description: '',
    icon: 'BookOpen',
    display_order: 0,
  });
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [submittingCategory, setSubmittingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);

  // Article Preview Modal State
  const [previewArticle, setPreviewArticle] = useState<KbArticleDetail | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Load Categories & Stats
  const loadCategories = useCallback(async () => {
    try {
      const res = await ApiClient.getKbCategories();
      if (res?.data) {
        setCategories(res.data);
      }
    } catch (err) {
      console.error('Failed to load KB categories:', err);
    }
  }, []);

  const loadStats = useCallback(async () => {
    try {
      const res = await ApiClient.getKbStats();
      if (res?.data) {
        setStats(res.data);
      }
    } catch (err) {
      console.error('Failed to load KB stats:', err);
    }
  }, []);

  // Load Articles
  const loadArticles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ApiClient.getKbArticles({
        category_id: categoryFilter !== 'all' ? categoryFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        search: search.trim() || undefined,
        limit: 100,
      });
      if (res?.data) {
        setArticles(res.data);
      }
    } catch (err) {
      console.error('Failed to load KB articles:', err);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, statusFilter, search]);

  useEffect(() => {
    loadCategories();
    loadStats();
  }, [loadCategories, loadStats]);

  useEffect(() => {
    loadArticles();
  }, [loadArticles]);

  // Open Create Article Modal
  const handleOpenCreateArticle = () => {
    setEditingArticleId(null);
    setArticleForm({
      category_id: categories[0]?.id || '',
      title: '',
      slug: '',
      summary: '',
      content: '',
      status: 'draft',
      tags: '',
    });
    setArticleError(null);
    setShowArticleModal(true);
  };

  // Open Edit Article Modal
  const handleOpenEditArticle = (article: KbArticle) => {
    setEditingArticleId(article.id);
    const tagsStr = Array.isArray(article.tags) ? article.tags.join(', ') : article.tags || '';
    setArticleForm({
      category_id: article.category_id,
      title: article.title,
      slug: article.slug,
      summary: article.summary,
      content: article.content,
      status: article.status,
      tags: tagsStr,
    });
    setArticleError(null);
    setShowArticleModal(true);
  };

  // Save Article (Create or Update)
  const handleSaveArticle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!articleForm.title.trim() || !articleForm.summary.trim() || !articleForm.content.trim() || !articleForm.category_id) {
      setArticleError('Please provide a title, category, summary, and article content.');
      return;
    }

    setSubmittingArticle(true);
    setArticleError(null);
    try {
      if (editingArticleId) {
        await ApiClient.updateKbArticle(editingArticleId, {
          category_id: articleForm.category_id,
          title: articleForm.title.trim(),
          slug: articleForm.slug.trim() || undefined,
          summary: articleForm.summary.trim(),
          content: articleForm.content.trim(),
          status: articleForm.status,
          tags: articleForm.tags,
        });
      } else {
        await ApiClient.createKbArticle({
          category_id: articleForm.category_id,
          title: articleForm.title.trim(),
          slug: articleForm.slug.trim() || undefined,
          summary: articleForm.summary.trim(),
          content: articleForm.content.trim(),
          status: articleForm.status,
          tags: articleForm.tags,
        });
      }

      setShowArticleModal(false);
      loadArticles();
      loadStats();
      loadCategories();
    } catch (err: any) {
      setArticleError(err.message || 'Failed to save knowledgebase article.');
    } finally {
      setSubmittingArticle(false);
    }
  };

  // Quick Toggle Status (Publish <-> Draft)
  const handleToggleStatus = async (article: KbArticle) => {
    const newStatus: KbArticleStatus = article.status === 'published' ? 'draft' : 'published';
    try {
      await ApiClient.updateKbArticle(article.id, { status: newStatus });
      loadArticles();
      loadStats();
      loadCategories();
    } catch (err: any) {
      alert(err.message || 'Failed to update article status');
    }
  };

  // Delete Article
  const handleDeleteArticle = async (article: KbArticle) => {
    if (!window.confirm(`Are you sure you want to delete article "${article.title}"? This cannot be undone.`)) {
      return;
    }

    try {
      await ApiClient.deleteKbArticle(article.id);
      loadArticles();
      loadStats();
      loadCategories();
    } catch (err: any) {
      alert(err.message || 'Failed to delete article');
    }
  };

  // Preview Article
  const handlePreviewArticle = async (article: KbArticle) => {
    setLoadingPreview(true);
    try {
      const res = await ApiClient.getKbArticleById(article.id);
      if (res?.data) {
        setPreviewArticle(res.data);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to load preview');
    } finally {
      setLoadingPreview(false);
    }
  };

  // Category Actions
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryForm.name.trim()) {
      setCategoryError('Category name is required');
      return;
    }

    setSubmittingCategory(true);
    setCategoryError(null);
    try {
      if (editingCategoryId) {
        await ApiClient.updateKbCategory(editingCategoryId, {
          name: categoryForm.name.trim(),
          slug: categoryForm.slug.trim() || undefined,
          description: categoryForm.description.trim() || null,
          display_order: Number(categoryForm.display_order || 0),
        });
      } else {
        await ApiClient.createKbCategory({
          name: categoryForm.name.trim(),
          slug: categoryForm.slug.trim() || undefined,
          description: categoryForm.description.trim() || null,
          display_order: Number(categoryForm.display_order || 0),
        });
      }

      setCategoryForm({ id: '', name: '', slug: '', description: '', icon: 'BookOpen', display_order: 0 });
      setEditingCategoryId(null);
      loadCategories();
      loadStats();
    } catch (err: any) {
      setCategoryError(err.message || 'Failed to save category');
    } finally {
      setSubmittingCategory(false);
    }
  };

  const handleEditCategory = (cat: KbCategory) => {
    setEditingCategoryId(cat.id);
    setCategoryForm({
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description || '',
      icon: cat.icon || 'BookOpen',
      display_order: cat.display_order || 0,
    });
    setCategoryError(null);
  };

  const handleDeleteCategory = async (cat: KbCategory) => {
    if (!window.confirm(`Delete category "${cat.name}"?`)) return;
    try {
      await ApiClient.deleteKbCategory(cat.id);
      loadCategories();
      loadStats();
    } catch (err: any) {
      alert(err.message || 'Failed to delete category');
    }
  };

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
              Knowledgebase Management
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              HQ Compliance Desk
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Author, organize, and publish standard operating procedures, legal guidelines, and training materials for franchise partners.
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={() => {
              setEditingCategoryId(null);
              setCategoryForm({ id: '', name: '', slug: '', description: '', icon: 'BookOpen', display_order: 0 });
              setCategoryError(null);
              setShowCategoryModal(true);
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl transition-colors shadow-2xs"
          >
            <Layers className="w-3.5 h-3.5 text-slate-500" />
            <span>Manage Categories</span>
          </button>

          <button
            onClick={handleOpenCreateArticle}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Create Article</span>
          </button>
        </div>
      </div>

      {/* KPI Counters Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5">
        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Articles</p>
          <p className="text-2xl font-extrabold text-slate-900 mt-1">{stats.totalArticles}</p>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">Published</p>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <p className="text-2xl font-extrabold text-emerald-700 mt-1">{stats.publishedArticles}</p>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Drafts</p>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-extrabold text-amber-700 mt-1">{stats.draftArticles}</p>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs">
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Categories</p>
          <p className="text-2xl font-extrabold text-indigo-700 mt-1">{stats.totalCategories}</p>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Total Views</p>
            <Eye className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-extrabold text-slate-800 mt-1">{stats.totalViews}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white border border-slate-200/80 rounded-xl p-4 shadow-2xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search articles by title, content, tags..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 text-xs text-slate-800 rounded-lg border border-slate-200 focus:outline-hidden focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center gap-2.5 w-full md:w-auto">
          {/* Category Dropdown */}
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 text-xs text-slate-700 rounded-lg border border-slate-200 focus:outline-hidden"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name} ({cat.article_count || 0})
              </option>
            ))}
          </select>

          {/* Status Dropdown */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 bg-slate-50 text-xs text-slate-700 rounded-lg border border-slate-200 focus:outline-hidden"
          >
            <option value="all">All Statuses</option>
            <option value="published">Published</option>
            <option value="draft">Drafts Only</option>
            <option value="archived">Archived</option>
          </select>

          <button
            onClick={() => {
              loadArticles();
              loadStats();
            }}
            className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg transition-colors"
            title="Refresh List"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Articles Table */}
      <div className="bg-white border border-slate-200/80 rounded-xl shadow-2xs overflow-hidden">
        {loading ? (
          <div className="py-16 text-center text-slate-400">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-xs">Loading articles...</p>
          </div>
        ) : articles.length === 0 ? (
          <div className="py-16 text-center text-slate-400 space-y-2">
            <FileText className="w-10 h-10 mx-auto text-slate-300" />
            <p className="text-sm font-semibold text-slate-700">No Knowledgebase Articles Found</p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Get started by clicking &quot;Create Article&quot; to publish guides and procedures for franchise partners.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Article Title & Slug</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Views</th>
                  <th className="py-3 px-4">Author</th>
                  <th className="py-3 px-4">Last Updated</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {articles.map((article) => {
                  const isPublished = article.status === 'published';
                  return (
                    <tr key={article.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <div className="max-w-md">
                          <p className="font-semibold text-slate-900 line-clamp-1">{article.title}</p>
                          <p className="text-[10px] text-slate-400 font-mono">/{article.slug}</p>
                          <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{article.summary}</p>
                        </div>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          {article.category_name || 'Standard'}
                        </span>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap">
                        <button
                          onClick={() => handleToggleStatus(article)}
                          title={`Click to switch to ${isPublished ? 'Draft' : 'Published'}`}
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold border transition-all ${
                            isPublished
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              : article.status === 'draft'
                              ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                              : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {isPublished ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          <span className="capitalize">{article.status}</span>
                        </button>
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap text-slate-600 font-mono">
                        {article.view_count || 0}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap text-slate-600">
                        {article.author_name || 'HQ Admin'}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                        {new Date(article.updated_at).toLocaleDateString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>

                      <td className="py-3 px-4 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handlePreviewArticle(article)}
                            className="p-1 text-slate-500 hover:text-indigo-600 rounded hover:bg-slate-100"
                            title="Preview Article"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenEditArticle(article)}
                            className="p-1 text-slate-500 hover:text-slate-800 rounded hover:bg-slate-100"
                            title="Edit Article"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteArticle(article)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-rose-50"
                            title="Delete Article"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create / Edit Article Modal */}
      {showArticleModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">
                  {editingArticleId ? 'Edit Knowledgebase Article' : 'Create Knowledgebase Article'}
                </h3>
              </div>
              <button
                onClick={() => setShowArticleModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveArticle} className="p-6 overflow-y-auto space-y-4 text-xs">
              {articleError && (
                <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 flex items-center gap-2 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{articleError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Title */}
                <div className="col-span-2">
                  <label className="block text-slate-700 font-semibold mb-1">Article Title *</label>
                  <input
                    type="text"
                    required
                    value={articleForm.title}
                    onChange={(e) => setArticleForm({ ...articleForm, title: e.target.value })}
                    placeholder="e.g., GST Registration Standard Operating Procedure (SOP)"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>

                {/* Category Selection */}
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Category *</label>
                  <select
                    required
                    value={articleForm.category_id}
                    onChange={(e) => setArticleForm({ ...articleForm, category_id: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                  >
                    <option value="" disabled>
                      Select a category
                    </option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Status Selection */}
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Publishing Status *</label>
                  <select
                    value={articleForm.status}
                    onChange={(e) => setArticleForm({ ...articleForm, status: e.target.value as KbArticleStatus })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                  >
                    <option value="draft">Draft (Hidden from franchise partners)</option>
                    <option value="published">Published (Visible to all franchises)</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>

                {/* Custom Slug (Optional) */}
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    URL Slug <span className="text-slate-400 font-normal">(optional, auto-generated)</span>
                  </label>
                  <input
                    type="text"
                    value={articleForm.slug}
                    onChange={(e) => setArticleForm({ ...articleForm, slug: e.target.value })}
                    placeholder="e.g., gst-registration-sop"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">
                    Tags <span className="text-slate-400 font-normal">(comma-separated)</span>
                  </label>
                  <input
                    type="text"
                    value={articleForm.tags}
                    onChange={(e) => setArticleForm({ ...articleForm, tags: e.target.value })}
                    placeholder="e.g., GST, Registration, SOP, Compliance"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>
              </div>

              {/* Summary */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Executive Summary * <span className="text-slate-400 font-normal">(displayed in cards & previews)</span>
                </label>
                <textarea
                  rows={2}
                  required
                  value={articleForm.summary}
                  onChange={(e) => setArticleForm({ ...articleForm, summary: e.target.value })}
                  placeholder="Provide a concise 1-2 sentence overview of what this procedure covers..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              {/* Content Body */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Detailed Article Content *
                </label>
                <textarea
                  rows={8}
                  required
                  value={articleForm.content}
                  onChange={(e) => setArticleForm({ ...articleForm, content: e.target.value })}
                  placeholder="Draft full operational steps, statutory prerequisites, document checklists, turnaround timelines, and escalation paths..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-sans leading-relaxed focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              {/* Form Footer */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <p className="text-[11px] text-slate-400">
                  {articleForm.status === 'published'
                    ? '✓ Will be instantly visible in Franchise Portal'
                    : '🔒 Draft mode: only visible to Super Admin'}
                </p>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowArticleModal(false)}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-semibold"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={submittingArticle}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold flex items-center gap-1.5 disabled:opacity-50"
                  >
                    {submittingArticle && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                    <span>{editingArticleId ? 'Save Changes' : 'Create Article'}</span>
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Management Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">Knowledgebase Categories</h3>
              </div>
              <button
                onClick={() => setShowCategoryModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 text-xs">
              {/* Category Form */}
              <form onSubmit={handleSaveCategory} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <h4 className="font-bold text-slate-900 text-xs">
                  {editingCategoryId ? 'Edit Category' : 'Add New Category'}
                </h4>

                {categoryError && (
                  <p className="text-rose-600 text-xs">{categoryError}</p>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-600 text-[11px] mb-1 font-medium">Category Name *</label>
                    <input
                      type="text"
                      required
                      value={categoryForm.name}
                      onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                      placeholder="e.g. Legal Compliances"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 text-[11px] mb-1 font-medium">Display Order</label>
                    <input
                      type="number"
                      value={categoryForm.display_order}
                      onChange={(e) => setCategoryForm({ ...categoryForm, display_order: parseInt(e.target.value, 10) || 0 })}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-slate-600 text-[11px] mb-1 font-medium">Description</label>
                  <input
                    type="text"
                    value={categoryForm.description}
                    onChange={(e) => setCategoryForm({ ...categoryForm, description: e.target.value })}
                    placeholder="Short description of this knowledge category..."
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  {editingCategoryId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCategoryId(null);
                        setCategoryForm({ id: '', name: '', slug: '', description: '', icon: 'BookOpen', display_order: 0 });
                      }}
                      className="px-2.5 py-1 text-slate-600 bg-slate-200 rounded-lg text-xs font-medium"
                    >
                      Cancel Edit
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={submittingCategory}
                    className="px-3 py-1 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700"
                  >
                    {editingCategoryId ? 'Update Category' : 'Add Category'}
                  </button>
                </div>
              </form>

              {/* Categories List */}
              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                  Existing Categories ({categories.length})
                </p>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden bg-white">
                  {categories.map((cat) => (
                    <div key={cat.id} className="p-3 flex items-center justify-between text-xs hover:bg-slate-50/50">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-900">{cat.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">#{cat.display_order}</span>
                          <span className="text-[10px] px-1.5 py-0.2 bg-slate-100 text-slate-600 rounded-full">
                            {cat.article_count || 0} articles
                          </span>
                        </div>
                        {cat.description && (
                          <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{cat.description}</p>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleEditCategory(cat)}
                          className="p-1 text-slate-500 hover:text-slate-800"
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(cat)}
                          className="p-1 text-slate-400 hover:text-rose-600"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Article Preview Modal */}
      {previewArticle && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
            <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between bg-slate-50/50">
              <div>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {previewArticle.category_name}
                  </span>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                      previewArticle.status === 'published'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {previewArticle.status}
                  </span>
                </div>
                <h2 className="text-lg md:text-xl font-bold text-slate-900 leading-tight">
                  {previewArticle.title}
                </h2>
              </div>
              <button
                onClick={() => setPreviewArticle(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 md:p-8 overflow-y-auto space-y-4 flex-1 text-slate-700 text-xs md:text-sm">
              <div className="p-4 bg-indigo-50/70 border border-indigo-100 rounded-xl">
                <span className="font-bold text-indigo-900 block mb-1">Summary</span>
                {previewArticle.summary}
              </div>

              <div className="whitespace-pre-wrap leading-relaxed font-sans">
                {previewArticle.content}
              </div>
            </div>

            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button
                onClick={() => setPreviewArticle(null)}
                className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg text-xs"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
