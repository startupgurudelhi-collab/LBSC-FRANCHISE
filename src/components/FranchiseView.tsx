import React from 'react';
import {
  Building2,
  MapPin,
  Phone,
  Mail,
  FileCheck,
  ShieldCheck,
  CheckCircle,
  Clock,
  Briefcase,
} from 'lucide-react';
import type { FranchiseApplication } from '../types';

interface FranchiseViewProps {
  applications: FranchiseApplication[];
  onRefresh: () => void;
}

export const FranchiseView: React.FC<FranchiseViewProps> = ({ applications }) => {
  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-600" />
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Franchise Network</h2>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Directory of legal franchise units, operating locations, and pending partner applications.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 font-semibold rounded-lg">
            <ShieldCheck className="w-4 h-4" />
            <span>Multi-Tenant Architecture</span>
          </span>
        </div>
      </div>

      {/* Applications / Franchise Units Table */}
      <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-xs font-semibold text-slate-800">Franchise Applications & Partners</h3>
          <span className="text-xs text-slate-400 font-mono">{applications.length} Records</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              <tr>
                <th className="px-5 py-3">App / Code #</th>
                <th className="px-5 py-3">Business Name</th>
                <th className="px-5 py-3">Contact Person</th>
                <th className="px-5 py-3">Location</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Registered Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {applications.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-400">
                    No franchise records available.
                  </td>
                </tr>
              ) : (
                applications.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-3.5 font-mono font-medium text-indigo-700">
                      {app.application_number}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900">{app.business_name}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-medium text-slate-800">{app.contact_name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{app.contact_email} · {app.contact_phone}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="flex items-center gap-1 text-slate-700">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        {app.city}, {app.district} ({app.pin})
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                          app.status === 'activated' || app.status === 'approved'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-amber-50 text-amber-700 border border-amber-200'
                        }`}
                      >
                        {app.status}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 font-mono text-slate-400 text-[11px]">
                      {new Date(app.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
