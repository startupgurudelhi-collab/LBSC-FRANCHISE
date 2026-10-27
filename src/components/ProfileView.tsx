import React from 'react';
import {
  User,
  ShieldCheck,
  Building2,
  Mail,
  Phone,
  MapPin,
  BadgeCheck,
  CreditCard,
  Lock,
  Layers,
  CheckCircle2,
} from 'lucide-react';
import type { User as AuthUser, FranchiseProfile } from '../types';

interface ProfileViewProps {
  user: AuthUser | null;
  franchiseProfile: FranchiseProfile | null;
}

export const ProfileView: React.FC<ProfileViewProps> = ({ user, franchiseProfile }) => {
  const isSuperAdmin = user?.roles.includes('super_admin');
  const roleName = isSuperAdmin
    ? 'Super Administrator'
    : user?.roles.includes('franchise_owner')
    ? 'Franchise Owner'
    : 'Franchise Staff';

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header Banner */}
      <div className="bg-white p-6 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-xl shadow-sm">
              {user?.firstName?.[0] || 'F'}
              {user?.lastName?.[0] || 'P'}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-slate-900 tracking-tight">
                  {user?.firstName} {user?.lastName}
                </h2>
                {franchiseProfile?.franchise_code && (
                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                    {franchiseProfile.franchise_code}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {franchiseProfile?.operating_name || 'LBSC Franchise Partner'} · {user?.email}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  {roleName}
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <BadgeCheck className="w-3.5 h-3.5" />
                  Active Franchise Account
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="px-3.5 py-2 rounded-lg bg-slate-50 border border-slate-200 text-right">
              <span className="text-[10px] text-slate-400 uppercase font-semibold block">Territory</span>
              <span className="text-xs font-bold text-slate-800">
                {franchiseProfile?.city || 'Salem'}, {franchiseProfile?.district || 'Salem'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Franchise Organization Card */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-600" />
              <span>Franchise Organization Details</span>
            </h3>

            <div className="space-y-3.5 text-xs">
              <div>
                <span className="text-slate-400 font-medium block">Operating Brand Name:</span>
                <span className="text-slate-900 font-bold text-sm mt-0.5 block">
                  {franchiseProfile?.operating_name || 'Salem Legal & Business Services Center'}
                </span>
              </div>

              <div>
                <span className="text-slate-400 font-medium block">Legal Entity Name:</span>
                <span className="text-slate-800 font-medium mt-0.5 block">
                  {franchiseProfile?.legal_name || 'Salem Legal Solutions Pvt Ltd'}
                </span>
              </div>

              <div>
                <span className="text-slate-400 font-medium block">Franchise Code:</span>
                <span className="font-mono text-indigo-700 font-bold mt-0.5 block">
                  {franchiseProfile?.franchise_code || 'FRAN-SALEM-001'}
                </span>
              </div>

              <div>
                <span className="text-slate-400 font-medium block">Territory & Jurisdiction:</span>
                <div className="flex items-start gap-1.5 text-slate-800 mt-0.5">
                  <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                  <span>
                    {franchiseProfile?.city || 'Salem'}, {franchiseProfile?.district || 'Salem'},{' '}
                    {franchiseProfile?.state || 'Tamil Nadu'}
                    {franchiseProfile?.pin ? ` - ${franchiseProfile.pin}` : ' - 636001'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <span className="text-slate-400 font-medium block">Primary Phone:</span>
                  <span className="text-slate-800 mt-0.5 block">
                    {franchiseProfile?.contact_phone || '+91 98765 43210'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 font-medium block">Primary Email:</span>
                  <span className="text-slate-800 mt-0.5 block truncate">
                    {franchiseProfile?.contact_email || user?.email}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>Verified Franchise Partner</span>
            </span>
            <span className="font-mono text-slate-400">Org ID: {user?.organizationId?.slice(0, 12)}...</span>
          </div>
        </div>

        {/* User Identity & Security Card */}
        <div className="bg-white rounded-xl border border-slate-200/80 shadow-xs p-6 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 mb-4 pb-2 border-b border-slate-100 flex items-center gap-2">
              <User className="w-4 h-4 text-indigo-600" />
              <span>Identity & Security Scope</span>
            </h3>

            <div className="space-y-3.5 text-xs">
              <div>
                <span className="text-slate-400 font-medium block">Authenticated User:</span>
                <span className="text-slate-900 font-bold text-sm mt-0.5 block">
                  {user?.firstName} {user?.lastName}
                </span>
              </div>

              <div>
                <span className="text-slate-400 font-medium block">Login Email:</span>
                <span className="text-slate-800 font-medium mt-0.5 block">{user?.email}</span>
              </div>

              <div>
                <span className="text-slate-400 font-medium block">Assigned Role:</span>
                <div className="flex flex-wrap gap-1 mt-1">
                  {user?.roles.map((r) => (
                    <span
                      key={r}
                      className="px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 font-semibold text-[10px] border border-indigo-200"
                    >
                      {r.replace('_', ' ').toUpperCase()}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <span className="text-slate-400 font-medium block">Data Isolation Boundary:</span>
                <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 mt-1">
                  <div className="flex items-start gap-2">
                    <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span className="text-[11px] leading-relaxed font-medium">
                      Multi-Tenant Isolation Active: Your portal operations, leads, opportunities, commissions, and clients are strictly partitioned to your franchise organization.
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-3 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
            <span className="flex items-center gap-1 text-slate-500">
              <Lock className="w-3.5 h-3.5 text-slate-400" />
              <span>RBAC Session Protected</span>
            </span>
            <span className="font-mono text-slate-400">UID: {user?.id?.slice(0, 10)}...</span>
          </div>
        </div>
      </div>
    </div>
  );
};
