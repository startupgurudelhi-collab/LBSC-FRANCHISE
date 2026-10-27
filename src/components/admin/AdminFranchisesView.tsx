import React, { useState, useEffect } from 'react';
import {
  Building2,
  Search,
  Filter,
  RefreshCw,
  Edit2,
  ShieldAlert,
  Wallet,
  MapPin,
  Mail,
  Phone,
  CheckCircle2,
  AlertCircle,
  X,
  PowerOff,
} from 'lucide-react';
import { ApiClient } from '../../api';
import type { FranchiseCommissionAccountDetail, FranchiseProfile } from '../../types';

export const AdminFranchisesView: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const [accounts, setAccounts] = useState<FranchiseCommissionAccountDetail[]>([]);
  const [profiles, setProfiles] = useState<Record<string, FranchiseProfile>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [stateFilter, setStateFilter] = useState('');

  // Edit Profile Modal State
  const [editingProfile, setEditingProfile] = useState<{
    orgId: string;
    operatingName: string;
    legalName: string;
    taxId: string;
    contactEmail: string;
    contactPhone: string;
    city: string;
    district: string;
    state: string;
    pin: string;
    address: string;
  } | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);

  // Deactivate Modal State
  const [deactivatingId, setDeactivatingId] = useState<string | null>(null);
  const [deactivationReason, setDeactivationReason] = useState('');
  const [processingDeactivation, setProcessingDeactivation] = useState(false);

  const loadFranchises = async () => {
    try {
      setError(null);
      const accRes = await ApiClient.getCommissionAccounts();
      if (accRes.success) {
        const accList: FranchiseCommissionAccountDetail[] = accRes.data || [];
        setAccounts(accList);

        // Fetch detailed profile for each organization in parallel
        const profileMap: Record<string, FranchiseProfile> = {};
        await Promise.all(
          accList.map(async (acc) => {
            try {
              const pRes = await ApiClient.getFranchiseProfile(acc.organization_id);
              if (pRes.success && pRes.data) {
                profileMap[acc.organization_id] = pRes.data;
              }
            } catch (err) {
              // Ignore single profile lookup error
            }
          })
        );
        setProfiles(profileMap);
      } else {
        setError(accRes.error?.message || 'Failed to load franchise accounts');
      }
    } catch (err: any) {
      setError(err.message || 'Error loading franchise data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadFranchises();
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadFranchises();
  };

  const handleStartEdit = (orgId: string) => {
    const prof = profiles[orgId];
    const acc = accounts.find((a) => a.organization_id === orgId);

    setEditingProfile({
      orgId,
      operatingName: prof?.operating_name || acc?.operating_name || '',
      legalName: prof?.legal_name || acc?.operating_name || '',
      taxId: prof?.tax_id || '',
      contactEmail: prof?.contact_email || '',
      contactPhone: prof?.contact_phone || '',
      city: prof?.city || '',
      district: prof?.district || '',
      state: prof?.state || '',
      pin: prof?.pin || '',
      address: prof?.address || '',
    });
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProfile) return;

    setSavingProfile(true);
    setError(null);
    try {
      const res = await ApiClient.updateFranchiseProfile(editingProfile.orgId, {
        operatingName: editingProfile.operatingName,
        legalName: editingProfile.legalName,
        taxId: editingProfile.taxId || null,
        contactEmail: editingProfile.contactEmail,
        contactPhone: editingProfile.contactPhone,
        city: editingProfile.city,
        district: editingProfile.district,
        state: editingProfile.state,
        pin: editingProfile.pin,
        address: editingProfile.address || null,
      });

      if (res.success) {
        setSuccessMessage(`Franchise profile updated successfully.`);
        setEditingProfile(null);
        loadFranchises();
      } else {
        setError(res.error?.message || 'Failed to update franchise profile');
      }
    } catch (err: any) {
      setError(err.message || 'Error updating profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleDeactivate = async () => {
    if (!deactivatingId) return;
    setProcessingDeactivation(true);
    setError(null);
    try {
      const res = await ApiClient.deactivateFranchise(deactivatingId, deactivationReason);
      if (res.success) {
        setSuccessMessage('Franchise deactivated successfully.');
        setDeactivatingId(null);
        setDeactivationReason('');
        loadFranchises();
      } else {
        setError(res.error?.message || 'Failed to deactivate franchise');
      }
    } catch (err: any) {
      setError(err.message || 'Error deactivating franchise');
    } finally {
      setProcessingDeactivation(false);
    }
  };

  // Filtering
  const filteredAccounts = accounts.filter((acc) => {
    const prof = profiles[acc.organization_id];
    const textToMatch = `${acc.franchise_code || ''} ${acc.operating_name || ''} ${
      prof?.city || ''
    } ${prof?.district || ''} ${prof?.state || ''}`.toLowerCase();
    const matchesSearch = textToMatch.includes(searchQuery.toLowerCase());
    const matchesState = stateFilter ? prof?.state === stateFilter : true;
    return matchesSearch && matchesState;
  });

  const uniqueStates = Array.from(
    new Set(Object.values(profiles).map((p) => p.state).filter(Boolean))
  );

  return (
    <div className="p-6 md:p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
              Franchise Management
            </h1>
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
              {accounts.length} Active Centers
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Oversee active branch operations, locations, official profiles, and wallet statuses.
          </p>
        </div>

        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors shadow-2xs self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-rose-700 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-[11px] underline">Dismiss</button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-emerald-800 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>{successMessage}</span>
          </div>
          <button onClick={() => setSuccessMessage(null)} className="text-[11px] underline">Dismiss</button>
        </div>
      )}

      {/* Filter Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs flex flex-col sm:flex-row items-center gap-3">
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by franchise code, operating name, city..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto shrink-0">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={stateFilter}
            onChange={(e) => setStateFilter(e.target.value)}
            className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-slate-900"
          >
            <option value="">All States</option>
            {uniqueStates.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Franchise Cards / Table */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-32 bg-slate-100 animate-pulse rounded-xl"></div>
          ))}
        </div>
      ) : filteredAccounts.length === 0 ? (
        <div className="bg-white p-12 text-center rounded-xl border border-slate-200/80 shadow-2xs text-slate-400 text-xs">
          <Building2 className="w-10 h-10 mx-auto mb-2 opacity-50" />
          <p className="font-semibold text-slate-700">No franchises found</p>
          <p className="mt-1">Try adjusting your search query or state filter.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredAccounts.map((acc) => {
            const prof = profiles[acc.organization_id];
            return (
              <div
                key={acc.id}
                className="bg-white p-5 rounded-xl border border-slate-200/80 shadow-2xs space-y-4 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-slate-900 px-2 py-0.5 bg-slate-100 rounded border border-slate-200">
                          {acc.franchise_code || 'PROVISIONED'}
                        </span>
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Active
                        </span>
                      </div>
                      <h3 className="text-sm font-bold text-slate-900 mt-2">
                        {prof?.operating_name || acc.operating_name || 'Legal & Business Services Center'}
                      </h3>
                      {prof?.legal_name && prof.legal_name !== prof.operating_name && (
                        <p className="text-[11px] text-slate-500">{prof.legal_name}</p>
                      )}
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold block">
                        Wallet
                      </span>
                      <span className="text-sm font-bold text-slate-900">
                        ₹{acc.current_balance.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>

                  {/* Location & Contact Meta */}
                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">
                        {prof?.city || 'Salem'}, {prof?.district || 'Salem'}, {prof?.state || 'Tamil Nadu'}{' '}
                        {prof?.pin ? `• ${prof.pin}` : ''}
                      </span>
                    </div>

                    {prof?.contact_email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate font-mono text-[11px]">{prof.contact_email}</span>
                      </div>
                    )}

                    {prof?.contact_phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-mono text-[11px]">{prof.contact_phone}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions Footer */}
                <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-slate-400 truncate">
                    ID: {acc.organization_id}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleStartEdit(acc.organization_id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Edit Profile</span>
                    </button>

                    <button
                      onClick={() => setDeactivatingId(acc.organization_id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors"
                    >
                      <PowerOff className="w-3 h-3" />
                      <span>Deactivate</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Edit Profile Modal */}
      {editingProfile && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-900">Edit Franchise Profile</h3>
              <button
                onClick={() => setEditingProfile(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Operating Name</label>
                <input
                  type="text"
                  required
                  value={editingProfile.operatingName}
                  onChange={(e) =>
                    setEditingProfile({ ...editingProfile, operatingName: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Legal Name</label>
                  <input
                    type="text"
                    required
                    value={editingProfile.legalName}
                    onChange={(e) =>
                      setEditingProfile({ ...editingProfile, legalName: e.target.value })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tax ID / GSTIN</label>
                  <input
                    type="text"
                    value={editingProfile.taxId}
                    onChange={(e) =>
                      setEditingProfile({ ...editingProfile, taxId: e.target.value })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Email</label>
                  <input
                    type="email"
                    required
                    value={editingProfile.contactEmail}
                    onChange={(e) =>
                      setEditingProfile({ ...editingProfile, contactEmail: e.target.value })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Phone</label>
                  <input
                    type="tel"
                    required
                    value={editingProfile.contactPhone}
                    onChange={(e) =>
                      setEditingProfile({ ...editingProfile, contactPhone: e.target.value })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">City</label>
                  <input
                    type="text"
                    required
                    value={editingProfile.city}
                    onChange={(e) =>
                      setEditingProfile({ ...editingProfile, city: e.target.value })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">District</label>
                  <input
                    type="text"
                    required
                    value={editingProfile.district}
                    onChange={(e) =>
                      setEditingProfile({ ...editingProfile, district: e.target.value })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">PIN</label>
                  <input
                    type="text"
                    required
                    value={editingProfile.pin}
                    onChange={(e) =>
                      setEditingProfile({ ...editingProfile, pin: e.target.value })
                    }
                    className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">State</label>
                <input
                  type="text"
                  required
                  value={editingProfile.state}
                  onChange={(e) =>
                    setEditingProfile({ ...editingProfile, state: e.target.value })
                  }
                  className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-slate-900"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingProfile(null)}
                  className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingProfile}
                  className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  {savingProfile ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deactivate Confirmation Modal */}
      {deactivatingId && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <ShieldAlert className="w-6 h-6" />
              <h3 className="text-base font-bold text-slate-900">Deactivate Franchise Center</h3>
            </div>

            <p className="text-xs text-slate-600">
              Are you sure you want to deactivate this franchise center? They will no longer receive
              leads or be able to run active campaigns until reinstated.
            </p>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reason for Deactivation
              </label>
              <textarea
                rows={3}
                placeholder="Specify the operational or compliance reason..."
                value={deactivationReason}
                onChange={(e) => setDeactivationReason(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-rose-500"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button
                onClick={() => setDeactivatingId(null)}
                className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Cancel
              </button>
              <button
                onClick={handleDeactivate}
                disabled={processingDeactivation}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {processingDeactivation ? 'Deactivating...' : 'Confirm Deactivation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
