import React, { useState, useEffect } from 'react';
import {
  Inbox,
  Clock,
  CheckCircle2,
  AlertCircle,
  Phone,
  Mail,
  MapPin,
  Tag,
  RefreshCw,
  ShieldCheck,
  Check,
} from 'lucide-react';
import { ApiClient } from '../api';
import type { LeadOpportunity } from '../types';

interface LeadInboxViewProps {
  opportunities: LeadOpportunity[];
  onRefresh: () => void;
}

export const LeadInboxView: React.FC<LeadInboxViewProps> = ({ opportunities, onRefresh }) => {
  const [filter, setFilter] = useState<'pending' | 'accepted' | 'expired' | 'all'>('pending');
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [timers, setTimers] = useState<Record<string, number>>({});

  // Real-time ticking 1-second countdown clock for active opportunities
  useEffect(() => {
    const initialMap: Record<string, number> = {};
    opportunities.forEach((opp) => {
      if (opp.expires_at) {
        const diffSeconds = Math.max(
          0,
          Math.floor((new Date(opp.expires_at).getTime() - Date.now()) / 1000)
        );
        initialMap[opp.id] = diffSeconds;
      }
    });
    setTimers(initialMap);

    const interval = setInterval(() => {
      setTimers((prev) => {
        const next: Record<string, number> = {};
        let needsRefresh = false;
        Object.entries(prev).forEach(([id, sec]) => {
          const val = Math.max(0, sec - 1);
          next[id] = val;
          if (sec > 0 && val === 0) {
            needsRefresh = true;
          }
        });
        if (needsRefresh) {
          onRefresh();
        }
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [opportunities, onRefresh]);

  const handleAccept = async (oppId: string) => {
    setAcceptingId(oppId);
    setActionMessage(null);
    try {
      const res = await ApiClient.acceptOpportunity(oppId, 'Accepted via LBSC Franchise Inbox');
      if (res.success) {
        setActionMessage({
          type: 'success',
          text: 'Lead successfully accepted! Permanently linked to your franchise without fee deduction.',
        });
        onRefresh();
      } else {
        setActionMessage({
          type: 'error',
          text: res.error?.message || 'Failed to accept lead opportunity',
        });
      }
    } catch (err: any) {
      setActionMessage({
        type: 'error',
        text: err.message || 'Error occurred while accepting opportunity',
      });
    } finally {
      setAcceptingId(null);
    }
  };

  const filteredList = opportunities.filter((opp) => {
    if (filter === 'all') return true;
    return opp.status === filter;
  });

  const formatCountdown = (totalSeconds?: number) => {
    if (totalSeconds === undefined || totalSeconds <= 0) {
      return { label: 'Expired', urgent: true };
    }
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const str = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    return { label: str, urgent: totalSeconds < 600 };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Inbox className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Lead Opportunity Inbox</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Accept qualified incoming leads for your territory. Each opportunity has a strict 1-hour window before automatic re-distribution.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {/* Status Filter */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-medium text-slate-600">
            {(['pending', 'accepted', 'expired', 'all'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-3 py-1.5 rounded-md capitalize transition-colors ${
                  filter === s ? 'bg-white text-indigo-700 font-semibold shadow-2xs' : 'hover:text-slate-900'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <button
            onClick={onRefresh}
            className="p-2 text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs"
            title="Refresh inbox"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-4 rounded-xl text-xs flex items-center gap-2.5 border ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          {actionMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Opportunities List */}
      {filteredList.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200/80 p-12 text-center shadow-xs">
          <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
            <Inbox className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-semibold text-slate-800">No opportunities in '{filter}'</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            When new leads arrive in locations matching your active campaigns, they will be delivered here instantly.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredList.map((opp) => {
            const timeLeft = timers[opp.id] !== undefined ? timers[opp.id] : opp.seconds_remaining;
            const timer = formatCountdown(timeLeft);
            const isPending = opp.status === 'pending';
            const isAccepting = acceptingId === opp.id;

            return (
              <div
                key={opp.id}
                className={`bg-white rounded-xl border transition-all p-5 shadow-xs ${
                  isPending
                    ? 'border-indigo-200/70 hover:border-indigo-300'
                    : 'border-slate-200/80 opacity-90'
                }`}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  {/* Customer & Service Info */}
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-sm text-slate-900">{opp.customer_name}</span>
                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-600 border border-slate-200">
                        {opp.lead_number}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          opp.status === 'pending'
                            ? 'bg-amber-100 text-amber-800 border border-amber-200'
                            : opp.status === 'accepted'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}
                      >
                        {opp.status}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-y-1 gap-x-4 text-xs text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Tag className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="font-medium text-slate-800">{opp.service_name || 'Service'}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>{opp.city}, {opp.district}, {opp.state}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        <span>{opp.customer_phone}</span>
                      </div>
                      {opp.customer_email && (
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span>{opp.customer_email}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right side: Countdown & Actions */}
                  <div className="flex items-center gap-4 shrink-0 justify-between md:justify-end border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                    {isPending ? (
                      <>
                        <div className="text-right">
                          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                            Time Remaining
                          </div>
                          <div
                            className={`flex items-center gap-1.5 font-mono text-sm font-bold ${
                              timer.urgent ? 'text-rose-600 animate-pulse' : 'text-amber-700'
                            }`}
                          >
                            <Clock className="w-3.5 h-3.5" />
                            <span>{timer.label}</span>
                          </div>
                        </div>

                        <button
                          onClick={() => handleAccept(opp.id)}
                          disabled={isAccepting || (timeLeft !== undefined && timeLeft <= 0)}
                          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors"
                        >
                          {isAccepting ? (
                            <span>Accepting...</span>
                          ) : (
                            <>
                              <Check className="w-3.5 h-3.5" />
                              <span>Accept Lead</span>
                            </>
                          )}
                        </button>
                      </>
                    ) : opp.status === 'accepted' ? (
                      <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg border border-emerald-200">
                        <ShieldCheck className="w-4 h-4 text-emerald-600" />
                        <span>Assigned to Franchise</span>
                      </div>
                    ) : (
                      <div className="text-xs text-slate-400 italic">
                        Offer window expired and re-routed
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
