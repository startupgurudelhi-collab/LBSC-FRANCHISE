import React, { useState, useEffect, useCallback } from 'react';
import {
  BookOpen,
  Search,
  Filter,
  Tag,
  Clock,
  Eye,
  Calendar,
  ChevronRight,
  X,
  FileText,
  ShieldCheck,
  Building2,
  Receipt,
  HelpCircle,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { ApiClient } from '../api';
import type { KbArticle, KbArticleDetail, KbCategory } from '../types';

export const KnowledgebaseView: React.FC = () => {
  const [categories, setCategories] = useState<KbCategory[]>([]);
  const [articles, setArticles] = useState<KbArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string>('all');
  const [selectedArticleId, setSelectedArticleId] = useState<string | null>(null);
  const [articleDetail, setArticleDetail] = useState<KbArticleDetail | null>(null);

  // Load categories
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

  // Load articles
  const loadArticles = useCallback(async () => {
    setLoading(true);
    try {
      const res = await ApiClient.getKbArticles({
        category_slug: selectedCategorySlug !== 'all' ? selectedCategorySlug : undefined,
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
  }, [selectedCategorySlug, search]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    loadArticles();
  }, [loadArticles]);

  // Load single article detail
  const loadDetail = async (idOrSlug: string) => {
    setLoadingDetail(true);
    try {
      const res = await ApiClient.getKbArticleById(idOrSlug);
      if (res?.data) {
        setArticleDetail(res.data);
        setSelectedArticleId(res.data.id);
      }
    } catch (err: any) {
      console.error('Failed to load article detail:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleCloseDetail = () => {
    setSelectedArticleId(null);
    setArticleDetail(null);
  };

  const getCategoryIcon = (iconName?: string | null) => {
    switch (iconName) {
      case 'ShieldCheck':
        return <ShieldCheck className="w-4 h-4 text-emerald-600" />;
      case 'Receipt':
        return <Receipt className="w-4 h-4 text-indigo-600" />;
      case 'Building2':
        return <Building2 className="w-4 h-4 text-blue-600" />;
      case 'FileText':
        return <FileText className="w-4 h-4 text-amber-600" />;
      default:
        return <BookOpen className="w-4 h-4 text-indigo-600" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 rounded-2xl p-6 md:p-8 text-white shadow-sm relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-indigo-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-indigo-500/20 text-indigo-200 border border-indigo-400/30 text-xs font-semibold mb-3">
            <BookOpen className="w-3.5 h-3.5" />
            <span>LBSC Knowledge & SOP Repository</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white mb-2">
            Operations & Compliance Knowledgebase
          </h1>
          <p className="text-sm text-indigo-100/90 leading-relaxed">
            Official operational procedures, statutory compliance guides, GST & corporate filing
            protocols, and platform guidelines for franchise partners.
          </p>

          {/* Quick Search inside banner */}
          <div className="mt-5 relative max-w-lg">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search guides, SOPs, GST filing rules, checklists..."
              className="w-full pl-10 pr-4 py-2.5 bg-white text-slate-900 placeholder:text-slate-400 text-sm rounded-xl border border-white/20 shadow-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-400"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Category Pills Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        <button
          onClick={() => setSelectedCategorySlug('all')}
          className={`px-3.5 py-2 rounded-xl font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
            selectedCategorySlug === 'all'
              ? 'bg-indigo-600 text-white shadow-xs font-semibold'
              : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
          }`}
        >
          <BookOpen className="w-3.5 h-3.5" />
          <span>All Topics</span>
        </button>

        {categories.map((cat) => {
          const isSelected = selectedCategorySlug === cat.slug;
          return (
            <button
              key={cat.id}
              onClick={() => setSelectedCategorySlug(cat.slug)}
              className={`px-3.5 py-2 rounded-xl font-medium transition-all whitespace-nowrap flex items-center gap-1.5 ${
                isSelected
                  ? 'bg-indigo-600 text-white shadow-xs font-semibold'
                  : 'bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {getCategoryIcon(cat.icon)}
              <span>{cat.name}</span>
              {typeof cat.article_count === 'number' && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                    isSelected ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'
                  }`}
                >
                  {cat.article_count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-400">
            <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-xs font-medium">Loading knowledgebase articles...</p>
          </div>
        ) : articles.length === 0 ? (
          <div className="col-span-full bg-white border border-slate-200/80 rounded-2xl p-12 text-center shadow-2xs">
            <div className="w-12 h-12 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-3">
              <BookOpen className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 mb-1">No Published Articles Found</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              {search
                ? `No articles matched your search query "${search}". Try searching with different keywords.`
                : 'There are currently no published articles in this category. Super Admin articles will appear here once published.'}
            </p>
            {search && (
              <button
                onClick={() => setSearch('')}
                className="mt-4 px-3 py-1.5 text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg transition-colors"
              >
                Clear Search Filter
              </button>
            )}
          </div>
        ) : (
          articles.map((article) => {
            const tags = Array.isArray(article.tags) ? article.tags : [];
            const readTimeMin = Math.max(1, Math.ceil((article.content?.length || 0) / 800));

            return (
              <div
                key={article.id}
                onClick={() => loadDetail(article.slug || article.id)}
                className="group bg-white border border-slate-200/80 hover:border-indigo-300 rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between"
              >
                <div>
                  {/* Category & Stats Header */}
                  <div className="flex items-center justify-between gap-2 mb-2.5">
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                      {article.category_name || 'Standard Guideline'}
                    </span>
                    <div className="flex items-center gap-2 text-[11px] text-slate-400">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {readTimeMin} min read
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        {article.view_count || 0}
                      </span>
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2 leading-snug mb-2">
                    {article.title}
                  </h3>

                  {/* Summary */}
                  <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed mb-4">
                    {article.summary}
                  </p>
                </div>

                {/* Footer Meta & Tags */}
                <div className="pt-3 border-t border-slate-100 mt-2">
                  {tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mb-2.5">
                      {tags.slice(0, 3).map((tag, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-md bg-slate-50 text-slate-600 text-[10px] font-medium border border-slate-100"
                        >
                          #{tag}
                        </span>
                      ))}
                      {tags.length > 3 && (
                        <span className="text-[10px] text-slate-400 font-medium self-center">
                          +{tags.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {article.published_at
                        ? new Date(article.published_at).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })
                        : 'Published'}
                    </span>
                    <span className="text-indigo-600 font-semibold flex items-center gap-0.5 group-hover:translate-x-0.5 transition-transform">
                      Read Article <ChevronRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Article Detail Drawer / Reading Modal */}
      {(selectedArticleId || loadingDetail) && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {loadingDetail ? (
              <div className="py-24 text-center text-slate-400">
                <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-xs font-medium">Opening article...</p>
              </div>
            ) : articleDetail ? (
              <>
                {/* Modal Header */}
                <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4 bg-slate-50/50">
                  <div>
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        {articleDetail.category_name}
                      </span>
                      <span className="text-xs text-slate-400">•</span>
                      <span className="text-xs text-slate-500 font-medium">
                        {articleDetail.published_at
                          ? new Date(articleDetail.published_at).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })
                          : 'Official Guideline'}
                      </span>
                    </div>
                    <h2 className="text-lg md:text-xl font-bold text-slate-900 leading-tight">
                      {articleDetail.title}
                    </h2>
                  </div>

                  <button
                    onClick={handleCloseDetail}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 transition-colors shrink-0"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Modal Body / Article Content */}
                <div className="p-6 md:p-8 overflow-y-auto space-y-6 flex-1 text-slate-700">
                  {/* Summary Callout */}
                  <div className="p-4 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs md:text-sm text-indigo-950 font-medium leading-relaxed">
                    <span className="font-bold block text-indigo-900 mb-1">Executive Summary</span>
                    {articleDetail.summary}
                  </div>

                  {/* Body Content */}
                  <div className="prose prose-slate max-w-none text-xs md:text-sm leading-relaxed whitespace-pre-wrap font-sans">
                    {articleDetail.content}
                  </div>

                  {/* Tags */}
                  {Array.isArray(articleDetail.tags) && articleDetail.tags.length > 0 && (
                    <div className="pt-4 border-t border-slate-100">
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                        Topics & Tags
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {articleDetail.tags.map((t, idx) => (
                          <span
                            key={idx}
                            className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200"
                          >
                            #{t}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Related Articles */}
                  {articleDetail.related_articles && articleDetail.related_articles.length > 0 && (
                    <div className="pt-4 border-t border-slate-100">
                      <p className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2.5">
                        Related Articles in {articleDetail.category_name}
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {articleDetail.related_articles.map((rel) => (
                          <div
                            key={rel.id}
                            onClick={() => loadDetail(rel.slug || rel.id)}
                            className="p-3 bg-slate-50 hover:bg-indigo-50/50 border border-slate-200/80 rounded-xl cursor-pointer transition-colors"
                          >
                            <p className="text-xs font-bold text-slate-900 line-clamp-1 mb-1 hover:text-indigo-600">
                              {rel.title}
                            </p>
                            <p className="text-[11px] text-slate-500 line-clamp-2">{rel.summary}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-xs text-slate-500">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" />
                      {articleDetail.view_count} views
                    </span>
                    <span>•</span>
                    <span>Published by HQ Compliance Desk</span>
                  </div>
                  <button
                    onClick={handleCloseDetail}
                    className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-semibold rounded-lg transition-colors text-xs"
                  >
                    Close
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
