import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ApiClient } from '../../api';
import type { InAppNotification } from '../../types';
import {
  Bell,
  Check,
  CheckCheck,
  Clock,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  X,
  AlertTriangle,
  DollarSign,
  Users,
  ShieldAlert,
  Hourglass,
  Inbox,
  FileCheck,
  Megaphone,
} from 'lucide-react';

interface NotificationBellProps {
  onNavigate?: (tabName: string) => void;
  isAdmin?: boolean;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({
  onNavigate,
  isAdmin = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<InAppNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [filterRead, setFilterRead] = useState<'all' | 'unread'>('all');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const limit = 6;

  // 1. Fetch unread count badge
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await ApiClient.getUnreadNotificationCount();
      if (res?.success && typeof res.data?.unreadCount === 'number') {
        setUnreadCount(res.data.unreadCount);
      }
    } catch {
      // ignore
    }
  }, []);

  // 2. Fetch notifications list
  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const offset = (page - 1) * limit;
      const res = await ApiClient.getNotifications({
        is_read: filterRead === 'unread' ? false : undefined,
        limit,
        offset,
      });

      if (res?.success && res.data) {
        setNotifications(res.data.notifications || []);
        setTotal(res.data.total || 0);
        setUnreadCount(res.data.unreadCount || 0);
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [page, filterRead, limit]);

  // Initial count load & polling every 30s
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Load list when panel opens or filters change
  useEffect(() => {
    if (isOpen) {
      fetchNotifications();
    }
  }, [isOpen, fetchNotifications]);

  // Close panel on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // 3. Mark individual notification as read
  const handleMarkAsRead = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      await ApiClient.markNotificationAsRead(id);
    } catch (err) {
      console.error('Failed to mark notification as read:', err);
    }
  };

  // 4. Mark all as read
  const handleMarkAllAsRead = async () => {
    setMarkingAll(true);
    try {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
      );
      setUnreadCount(0);

      await ApiClient.markAllNotificationsAsRead();
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    } finally {
      setMarkingAll(false);
    }
  };

  // 5. Navigate to relevant module when clicked
  const handleNotificationClick = async (notif: InAppNotification) => {
    if (!notif.is_read) {
      await handleMarkAsRead(notif.id);
    }

    if (!onNavigate) {
      return;
    }

    setIsOpen(false);

    const type = notif.type;
    const entityType = notif.entity_type;

    if (isAdmin) {
      // Super Admin module routing
      if (entityType === 'campaign' || type.includes('campaign')) {
        onNavigate('admin-campaigns');
      } else if (entityType === 'service_application' || type.includes('sla')) {
        onNavigate('admin-work-queue');
      } else if (entityType === 'lead' || type.includes('lead')) {
        onNavigate('admin-leads');
      } else if (entityType === 'advertisement_request' || type.includes('advertisement')) {
        onNavigate('admin-advertisements');
      } else if (entityType === 'ticket' || type.includes('ticket')) {
        onNavigate('admin-tickets');
      } else {
        onNavigate('admin-dashboard');
      }
    } else {
      // Franchise module routing
      if (entityType === 'campaign' || type.includes('campaign')) {
        onNavigate('campaigns');
      } else if (type === 'lead_opportunity' || (entityType === 'lead' && type === 'opportunity_expired')) {
        onNavigate('inbox');
      } else if (type === 'lead_unassigned') {
        onNavigate('own-leads');
      } else if (entityType === 'lead') {
        onNavigate('leads');
      } else if (entityType === 'service_application' || type.includes('sla')) {
        onNavigate('service-applications');
      } else if (entityType === 'advertisement_request' || type.includes('advertisement')) {
        onNavigate('advertisement-requests');
      } else if (entityType === 'commission' || type.includes('commission')) {
        onNavigate('commissions');
      } else {
        onNavigate('dashboard');
      }
    }
  };

  // Helper icon by type
  const getNotificationIcon = (type: string, isRead: boolean) => {
    const iconClass = isRead ? 'text-slate-400' : 'text-indigo-600';
    switch (type) {
      case 'campaign_charge':
        return <DollarSign className={`w-4 h-4 ${isRead ? 'text-slate-400' : 'text-emerald-600'}`} />;
      case 'campaign_paused':
        return <AlertTriangle className="w-4 h-4 text-rose-600" />;
      case 'lead_opportunity':
        return <Users className={`w-4 h-4 ${isRead ? 'text-slate-400' : 'text-indigo-600'}`} />;
      case 'opportunity_expired':
        return <Clock className="w-4 h-4 text-amber-600" />;
      case 'lead_unassigned':
        return <Inbox className="w-4 h-4 text-purple-600" />;
      case 'sla_breached':
        return <ShieldAlert className="w-4 h-4 text-rose-600 animate-pulse" />;
      case 'sla_approaching':
        return <Hourglass className="w-4 h-4 text-amber-600" />;
      default:
        return <Bell className={`w-4 h-4 ${iconClass}`} />;
    }
  };

  // Time formatter
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (60 * 1000));
      const diffHours = Math.floor(diffMs / (3600 * 1000));
      const diffDays = Math.floor(diffMs / (86400 * 1000));

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins}m ago`;
      if (diffHours < 24) return `${diffHours}h ago`;
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString('en-IN', { month: 'short', day: 'numeric' });
    } catch {
      return isoString;
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  return (
    <div className="relative inline-block" ref={panelRef}>
      {/* Bell Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`relative flex items-center justify-center p-2 rounded-lg transition-colors border ${
          unreadCount > 0
            ? 'bg-amber-50/80 border-amber-200 text-amber-900 hover:bg-amber-100/90'
            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900'
        }`}
        title={`${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}`}
        aria-label="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 min-w-4 h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center shadow-xs">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-xl shadow-2xl border border-slate-200 z-50 overflow-hidden flex flex-col text-slate-800 animate-in fade-in-50 duration-150">
          {/* Header */}
          <div className="p-3.5 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs text-slate-900 tracking-tight">Notifications</span>
              {unreadCount > 0 && (
                <span className="text-[10px] font-semibold text-amber-800 bg-amber-100/80 px-1.5 py-0.2 rounded-md">
                  {unreadCount} unread
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllAsRead}
                  disabled={markingAll}
                  className="flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 px-2 py-0.5 rounded hover:bg-indigo-50 transition-colors disabled:opacity-50"
                  title="Mark all notifications as read"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                  <span>Mark all read</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-md hover:bg-slate-100"
                aria-label="Close"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center justify-between px-3.5 py-1.5 border-b border-slate-100 bg-white text-[11px]">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setFilterRead('all');
                  setPage(1);
                }}
                className={`font-semibold pb-0.5 transition-colors ${
                  filterRead === 'all'
                    ? 'text-indigo-600 border-b-2 border-indigo-600'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => {
                  setFilterRead('unread');
                  setPage(1);
                }}
                className={`font-semibold pb-0.5 transition-colors ${
                  filterRead === 'unread'
                    ? 'text-indigo-600 border-b-2 border-indigo-600'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Unread
              </button>
            </div>

            <span className="text-slate-400 text-[10px]">
              {total > 0 ? `${total} item${total === 1 ? '' : 's'}` : '0 items'}
            </span>
          </div>

          {/* Notifications List */}
          <div className="max-h-84 overflow-y-auto divide-y divide-slate-100">
            {loading ? (
              <div className="py-8 text-center text-xs text-slate-400">Loading notifications...</div>
            ) : notifications.length === 0 ? (
              <div className="py-10 px-4 text-center">
                <Bell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">No notifications found</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  {filterRead === 'unread' ? 'You have read all your alerts.' : 'New activity will appear here.'}
                </p>
              </div>
            ) : (
              notifications.map((notif) => (
                <div
                  key={notif.id}
                  onClick={() => handleNotificationClick(notif)}
                  className={`p-3 transition-colors cursor-pointer group flex items-start gap-2.5 ${
                    notif.is_read ? 'bg-white hover:bg-slate-50/70' : 'bg-indigo-50/30 hover:bg-indigo-50/50'
                  }`}
                >
                  {/* Type Icon */}
                  <div className="mt-0.5 shrink-0 p-1.5 rounded-lg bg-slate-100 group-hover:bg-white border border-slate-200/60 shadow-2xs">
                    {getNotificationIcon(notif.type, notif.is_read)}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <p
                        className={`text-xs truncate ${
                          notif.is_read ? 'font-medium text-slate-800' : 'font-bold text-slate-950'
                        }`}
                      >
                        {notif.title}
                      </p>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {formatTime(notif.created_at)}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5 leading-snug">
                      {notif.message}
                    </p>

                    <div className="flex items-center justify-between mt-1 text-[10px] text-slate-400">
                      <span className="uppercase tracking-wider font-mono text-[9px] text-slate-500">
                        {notif.entity_type ? notif.entity_type.replace('_', ' ') : notif.type.replace('_', ' ')}
                      </span>

                      <div className="flex items-center gap-1.5 opacity-80 group-hover:opacity-100">
                        {!notif.is_read && (
                          <button
                            type="button"
                            onClick={(e) => handleMarkAsRead(notif.id, e)}
                            className="text-slate-400 hover:text-indigo-600 p-0.5 rounded"
                            title="Mark as read"
                          >
                            <Check className="w-3 h-3" />
                          </button>
                        )}
                        {onNavigate && (
                          <span className="flex items-center gap-0.5 text-indigo-600 font-semibold group-hover:underline">
                            Open <ExternalLink className="w-2.5 h-2.5" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="p-2.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between text-xs text-slate-500">
              <span className="text-[11px]">
                Page {page} of {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="p-1 rounded border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
