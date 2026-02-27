import { useState, useCallback, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';
import SEO from '../components/SEO';

// --- Types ---
interface UserSummary {
  id: string;
  email: string;
  name?: string | null;
  company?: string | null;
  role: string;
  provider?: string | null;
  createdAt: string;
  subscriptionTier: string;
  subscriptionStatus: string;
  interviewsUsed: number;
  resumeMatchesUsed: number;
  topUpBalance: number;
  currentPeriodEnd?: string | null;
  trialEnd?: string | null;
}

interface AdjustmentRecord {
  id: string;
  type: string;
  amount?: number | null;
  oldValue?: string | null;
  newValue?: string | null;
  reason: string;
  createdAt: string;
  admin: { id: string; email: string; name?: string | null };
}

interface SystemStats {
  totalUsers: number;
  usersByTier: Record<string, number>;
  activeSubscriptions: number;
  totalRevenue: number;
  newUsersThisMonth: number;
  totalInterviewsUsed: number;
  totalMatchesUsed: number;
}

// --- Helpers ---
async function adminFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api/v1/admin${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

async function authFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api/auth${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const PLAN_LIMITS: Record<string, { interviews: number; matches: number }> = {
  free: { interviews: 0, matches: 0 },
  starter: { interviews: 15, matches: 30 },
  growth: { interviews: 120, matches: 240 },
  business: { interviews: 280, matches: 500 },
  custom: { interviews: Infinity, matches: Infinity },
};

const TABS = ['Overview', 'Users', 'Pricing', 'Settings'] as const;
type Tab = (typeof TABS)[number];

// --- Badge helpers ---
function tierBadge(tier: string) {
  const colors: Record<string, string> = {
    free: 'bg-gray-100 text-gray-700',
    starter: 'bg-blue-100 text-blue-700',
    growth: 'bg-emerald-100 text-emerald-700',
    business: 'bg-purple-100 text-purple-700',
    custom: 'bg-amber-100 text-amber-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[tier] || colors.free}`}>
      {tier}
    </span>
  );
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    trialing: 'bg-blue-100 text-blue-700',
    past_due: 'bg-red-100 text-red-700',
    canceled: 'bg-gray-100 text-gray-700',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || colors.active}`}>
      {status}
    </span>
  );
}

// ========== TAB COMPONENTS ==========

function OverviewTab() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    adminFetch('/stats')
      .then((data) => setStats(data.data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-sm text-gray-500 p-6">Loading stats...</p>;
  if (error) return <p className="text-sm text-red-600 p-6">{error}</p>;
  if (!stats) return null;

  const cards = [
    { label: 'Total Users', value: stats.totalUsers, color: 'bg-indigo-50 text-indigo-700' },
    { label: 'Active Subscriptions', value: stats.activeSubscriptions, color: 'bg-green-50 text-green-700' },
    { label: 'New This Month', value: stats.newUsersThisMonth, color: 'bg-blue-50 text-blue-700' },
    { label: 'Total Revenue', value: `$${stats.totalRevenue.toFixed(2)}`, color: 'bg-emerald-50 text-emerald-700' },
    { label: 'Interviews Used', value: stats.totalInterviewsUsed, color: 'bg-purple-50 text-purple-700' },
    { label: 'Matches Used', value: stats.totalMatchesUsed, color: 'bg-amber-50 text-amber-700' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        {cards.map((c) => (
          <div key={c.label} className={`rounded-xl p-5 ${c.color}`}>
            <p className="text-xs font-medium opacity-70 mb-1">{c.label}</p>
            <p className="text-2xl font-bold">{c.value}</p>
          </div>
        ))}
      </div>

      {/* Users by tier */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-4">Users by Plan</h3>
        <div className="space-y-2">
          {Object.entries(stats.usersByTier).map(([tier, count]) => (
            <div key={tier} className="flex items-center gap-3">
              <div className="w-20">{tierBadge(tier)}</div>
              <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-400 rounded-full transition-all"
                  style={{ width: `${stats.totalUsers > 0 ? (count / stats.totalUsers) * 100 : 0}%` }}
                />
              </div>
              <span className="text-sm font-medium text-gray-700 w-10 text-right">{count}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function UsersTab() {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [page, setPage] = useState(1);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState('');

  const [selectedUser, setSelectedUser] = useState<UserSummary | null>(null);
  const [adjustments, setAdjustments] = useState<AdjustmentRecord[]>([]);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  // Action form state
  const [actionType, setActionType] = useState<'balance' | 'usage' | 'subscription' | 'reset' | 'cancel_sub' | 'disable' | 'enable' | 'set_role' | ''>('');
  const [actionAmount, setActionAmount] = useState('');
  const [actionUsageType, setActionUsageType] = useState<'interview' | 'match'>('interview');
  const [actionTier, setActionTier] = useState('starter');
  const [actionStatus, setActionStatus] = useState('active');
  const [actionRole, setActionRole] = useState('user');
  const [actionImmediate, setActionImmediate] = useState(false);
  const [actionReason, setActionReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  const searchUsers = useCallback(async (searchTerm: string, pageNum: number) => {
    setIsSearching(true);
    setSearchError('');
    try {
      const data = await adminFetch(`/users?search=${encodeURIComponent(searchTerm)}&page=${pageNum}&limit=20`);
      setUsers(data.data.users);
      setTotalUsers(data.data.pagination.total);
      setPage(pageNum);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setIsSearching(false);
    }
  }, []);

  const loadUserDetail = async (userId: string) => {
    setIsLoadingDetail(true);
    try {
      const data = await adminFetch(`/users/${userId}`);
      setSelectedUser(data.data.user);
      setAdjustments(data.data.adjustments);
      setActionType('');
      setActionMessage('');
      setActionError('');
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Failed to load user');
    } finally {
      setIsLoadingDetail(false);
    }
  };

  const handleAction = async () => {
    if (!selectedUser || !actionType || !actionReason.trim()) return;
    setIsSubmitting(true);
    setActionMessage('');
    setActionError('');

    try {
      let data;
      if (actionType === 'balance') {
        const amount = parseFloat(actionAmount);
        if (isNaN(amount) || amount === 0) throw new Error('Enter a non-zero amount');
        data = await adminFetch(`/users/${selectedUser.id}/adjust-balance`, {
          method: 'POST',
          body: JSON.stringify({ amount, reason: actionReason.trim() }),
        });
        setActionMessage(`Balance adjusted: $${data.data.oldBalance.toFixed(2)} → $${data.data.newBalance.toFixed(2)}`);
      } else if (actionType === 'usage') {
        const amount = parseInt(actionAmount);
        if (isNaN(amount) || amount === 0) throw new Error('Enter a non-zero amount');
        data = await adminFetch(`/users/${selectedUser.id}/adjust-usage`, {
          method: 'POST',
          body: JSON.stringify({ action: actionUsageType, amount, reason: actionReason.trim() }),
        });
        setActionMessage(`${actionUsageType} usage: ${data.data.oldValue} → ${data.data.newValue}`);
      } else if (actionType === 'subscription') {
        data = await adminFetch(`/users/${selectedUser.id}/set-subscription`, {
          method: 'POST',
          body: JSON.stringify({ tier: actionTier, status: actionStatus, reason: actionReason.trim() }),
        });
        setActionMessage(`Subscription: ${data.data.oldTier}/${data.data.oldStatus} → ${data.data.newTier}/${data.data.newStatus}`);
      } else if (actionType === 'reset') {
        data = await adminFetch(`/users/${selectedUser.id}/reset-usage`, {
          method: 'POST',
          body: JSON.stringify({ reason: actionReason.trim() }),
        });
        setActionMessage(`Usage reset: interviews ${data.data.oldInterviews}→0, matches ${data.data.oldMatches}→0`);
      } else if (actionType === 'cancel_sub') {
        data = await adminFetch(`/users/${selectedUser.id}/cancel-subscription`, {
          method: 'POST',
          body: JSON.stringify({ reason: actionReason.trim(), immediate: actionImmediate }),
        });
        setActionMessage(data.data?.message || 'Subscription cancelled');
      } else if (actionType === 'disable') {
        data = await adminFetch(`/users/${selectedUser.id}/disable`, {
          method: 'POST',
          body: JSON.stringify({ reason: actionReason.trim() }),
        });
        setActionMessage('User disabled');
      } else if (actionType === 'enable') {
        data = await adminFetch(`/users/${selectedUser.id}/enable`, {
          method: 'POST',
          body: JSON.stringify({ reason: actionReason.trim() }),
        });
        setActionMessage('User enabled');
      } else if (actionType === 'set_role') {
        data = await adminFetch(`/users/${selectedUser.id}/set-role`, {
          method: 'POST',
          body: JSON.stringify({ role: actionRole, reason: actionReason.trim() }),
        });
        setActionMessage(`Role changed to ${actionRole}`);
      }

      await loadUserDetail(selectedUser.id);
      setActionAmount('');
      setActionReason('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">User Management</h2>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search by email, name, or company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchUsers(search, 1)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
          <button
            onClick={() => searchUsers(search, 1)}
            disabled={isSearching}
            className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {isSearching ? 'Searching...' : 'Search'}
          </button>
        </div>
        {searchError && <p className="mt-2 text-sm text-red-600">{searchError}</p>}

        {/* User list */}
        {users.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left text-gray-500">
                  <th className="pb-2 font-medium">Email</th>
                  <th className="pb-2 font-medium">Name</th>
                  <th className="pb-2 font-medium">Role</th>
                  <th className="pb-2 font-medium">Plan</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Balance</th>
                  <th className="pb-2 font-medium">Interviews</th>
                  <th className="pb-2 font-medium">Matches</th>
                  <th className="pb-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const limits = PLAN_LIMITS[u.subscriptionTier] || PLAN_LIMITS.free;
                  return (
                    <tr
                      key={u.id}
                      className={`border-b border-gray-100 hover:bg-gray-50 cursor-pointer ${
                        selectedUser?.id === u.id ? 'bg-indigo-50' : ''
                      }`}
                      onClick={() => loadUserDetail(u.id)}
                    >
                      <td className="py-2.5 text-gray-900">{u.email}</td>
                      <td className="py-2.5 text-gray-600">{u.name || '-'}</td>
                      <td className="py-2.5">
                        {u.role === 'admin' ? (
                          <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-700">admin</span>
                        ) : (
                          <span className="text-gray-400 text-xs">user</span>
                        )}
                      </td>
                      <td className="py-2.5">{tierBadge(u.subscriptionTier)}</td>
                      <td className="py-2.5">{statusBadge(u.subscriptionStatus)}</td>
                      <td className="py-2.5 text-gray-900 font-mono">${u.topUpBalance.toFixed(2)}</td>
                      <td className="py-2.5 text-gray-600">
                        {u.interviewsUsed}/{limits.interviews === Infinity ? '∞' : limits.interviews}
                      </td>
                      <td className="py-2.5 text-gray-600">
                        {u.resumeMatchesUsed}/{limits.matches === Infinity ? '∞' : limits.matches}
                      </td>
                      <td className="py-2.5">
                        <button className="text-indigo-600 hover:text-indigo-800 text-xs font-medium">View</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-3 flex items-center justify-between text-sm text-gray-500">
              <span>{totalUsers} user{totalUsers !== 1 ? 's' : ''} found</span>
              <div className="flex gap-2">
                <button
                  disabled={page <= 1}
                  onClick={() => searchUsers(search, page - 1)}
                  className="px-3 py-1 border border-gray-300 rounded text-xs disabled:opacity-40 hover:bg-gray-50"
                >
                  Prev
                </button>
                <span className="px-2 py-1 text-xs">Page {page}</span>
                <button
                  disabled={page * 20 >= totalUsers}
                  onClick={() => searchUsers(search, page + 1)}
                  className="px-3 py-1 border border-gray-300 rounded text-xs disabled:opacity-40 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* User Detail + Actions */}
      {selectedUser && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          {isLoadingDetail ? (
            <p className="text-sm text-gray-500">Loading...</p>
          ) : (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {selectedUser.name || selectedUser.email}
                  </h3>
                  <p className="text-sm text-gray-500">{selectedUser.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  {tierBadge(selectedUser.subscriptionTier)}
                  {statusBadge(selectedUser.subscriptionStatus)}
                  {selectedUser.role === 'admin' && (
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-700">admin</span>
                  )}
                </div>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Balance</p>
                  <p className="text-lg font-semibold text-gray-900 font-mono">${selectedUser.topUpBalance.toFixed(2)}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Interviews Used</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {selectedUser.interviewsUsed}
                    <span className="text-sm text-gray-400 font-normal">
                      /{(PLAN_LIMITS[selectedUser.subscriptionTier] || PLAN_LIMITS.free).interviews === Infinity
                        ? '∞'
                        : (PLAN_LIMITS[selectedUser.subscriptionTier] || PLAN_LIMITS.free).interviews}
                    </span>
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Matches Used</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {selectedUser.resumeMatchesUsed}
                    <span className="text-sm text-gray-400 font-normal">
                      /{(PLAN_LIMITS[selectedUser.subscriptionTier] || PLAN_LIMITS.free).matches === Infinity
                        ? '∞'
                        : (PLAN_LIMITS[selectedUser.subscriptionTier] || PLAN_LIMITS.free).matches}
                    </span>
                  </p>
                </div>
                <div className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-1">Joined</p>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(selectedUser.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              {/* Action selector */}
              <div className="border-t border-gray-200 pt-4 mb-4">
                <p className="text-sm font-medium text-gray-700 mb-3">Admin Actions</p>
                <div className="flex flex-wrap gap-2 mb-4">
                  {([
                    { key: 'balance', label: 'Adjust Balance' },
                    { key: 'usage', label: 'Adjust Usage' },
                    { key: 'subscription', label: 'Set Subscription' },
                    { key: 'reset', label: 'Reset Usage' },
                    { key: 'cancel_sub', label: 'Cancel Subscription' },
                    { key: 'disable', label: 'Disable User' },
                    { key: 'enable', label: 'Enable User' },
                    { key: 'set_role', label: 'Set Role' },
                  ] as const).map((a) => (
                    <button
                      key={a.key}
                      onClick={() => { setActionType(a.key); setActionMessage(''); setActionError(''); }}
                      className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${
                        actionType === a.key
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                          : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {a.label}
                    </button>
                  ))}
                </div>

                {/* Action forms */}
                {actionType && (
                  <div className="bg-gray-50 rounded-lg p-4 space-y-3">
                    {actionType === 'balance' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Amount (positive=credit, negative=debit)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          value={actionAmount}
                          onChange={(e) => setActionAmount(e.target.value)}
                          placeholder="e.g. 5.00 or -2.50"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        />
                      </div>
                    )}

                    {actionType === 'usage' && (
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Type</label>
                          <select
                            value={actionUsageType}
                            onChange={(e) => setActionUsageType(e.target.value as 'interview' | 'match')}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="interview">Interview</option>
                            <option value="match">Resume Match</option>
                          </select>
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Amount (positive=add, negative=credit back)
                          </label>
                          <input
                            type="number"
                            value={actionAmount}
                            onChange={(e) => setActionAmount(e.target.value)}
                            placeholder="e.g. -2 to credit back"
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          />
                        </div>
                      </div>
                    )}

                    {actionType === 'subscription' && (
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Tier</label>
                          <select
                            value={actionTier}
                            onChange={(e) => setActionTier(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="free">Free</option>
                            <option value="starter">Starter</option>
                            <option value="growth">Growth</option>
                            <option value="business">Business</option>
                            <option value="custom">Custom (Unlimited)</option>
                          </select>
                        </div>
                        <div className="flex-1">
                          <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
                          <select
                            value={actionStatus}
                            onChange={(e) => setActionStatus(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                          >
                            <option value="active">Active</option>
                            <option value="trialing">Trialing</option>
                            <option value="past_due">Past Due</option>
                            <option value="canceled">Canceled</option>
                          </select>
                        </div>
                      </div>
                    )}

                    {actionType === 'reset' && (
                      <p className="text-sm text-gray-600">
                        This will reset both interview and match usage counters to 0.
                      </p>
                    )}

                    {actionType === 'cancel_sub' && (
                      <div>
                        <p className="text-sm text-gray-600 mb-2">
                          Cancel this user's Stripe subscription.
                        </p>
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={actionImmediate}
                            onChange={(e) => setActionImmediate(e.target.checked)}
                            className="rounded border-gray-300"
                          />
                          Cancel immediately (otherwise cancels at period end)
                        </label>
                      </div>
                    )}

                    {actionType === 'disable' && (
                      <p className="text-sm text-gray-600">
                        Disable this user account. Their subscription will be cancelled and status set to canceled.
                      </p>
                    )}

                    {actionType === 'enable' && (
                      <p className="text-sm text-gray-600">
                        Re-enable this user account. Their subscription status will be set back to active.
                      </p>
                    )}

                    {actionType === 'set_role' && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                        <select
                          value={actionRole}
                          onChange={(e) => setActionRole(e.target.value)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                        >
                          <option value="user">User</option>
                          <option value="admin">Admin</option>
                        </select>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Reason (required)</label>
                      <input
                        type="text"
                        value={actionReason}
                        onChange={(e) => setActionReason(e.target.value)}
                        placeholder="Reason for this action..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                      />
                    </div>

                    <button
                      onClick={handleAction}
                      disabled={isSubmitting || !actionReason.trim()}
                      className={`px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 ${
                        ['disable', 'cancel_sub'].includes(actionType)
                          ? 'bg-red-600 hover:bg-red-700'
                          : 'bg-indigo-600 hover:bg-indigo-700'
                      }`}
                    >
                      {isSubmitting ? 'Applying...' : 'Apply'}
                    </button>

                    {actionMessage && <p className="text-sm text-green-600 font-medium">{actionMessage}</p>}
                    {actionError && <p className="text-sm text-red-600">{actionError}</p>}
                  </div>
                )}
              </div>

              {/* Audit log */}
              {adjustments.length > 0 && (
                <div className="border-t border-gray-200 pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-3">Adjustment History</p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {adjustments.map((adj) => (
                      <div key={adj.id} className="flex items-start gap-3 text-sm py-2 border-b border-gray-100">
                        <div className="flex-1">
                          <span className="font-medium text-gray-900">{adj.type}</span>
                          {adj.amount != null && (
                            <span className={`ml-2 font-mono ${adj.amount > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {adj.amount > 0 ? '+' : ''}{adj.type === 'balance' ? `$${adj.amount.toFixed(2)}` : adj.amount}
                            </span>
                          )}
                          {adj.oldValue && adj.newValue && (
                            <span className="ml-2 text-gray-400">
                              {adj.oldValue} &rarr; {adj.newValue}
                            </span>
                          )}
                          <p className="text-gray-500 mt-0.5">{adj.reason}</p>
                        </div>
                        <div className="text-right text-xs text-gray-400 whitespace-nowrap">
                          <p>{new Date(adj.createdAt).toLocaleDateString()}</p>
                          <p>{adj.admin.name || adj.admin.email}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PricingTab() {
  const [prices, setPrices] = useState({ starter: '', growth: '', business: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    adminFetch('/config')
      .then((data) => {
        const configs: { key: string; value: string }[] = data.data || [];
        const p = { starter: '29', growth: '199', business: '399' };
        for (const c of configs) {
          if (c.key === 'price_starter_monthly') p.starter = c.value;
          if (c.key === 'price_growth_monthly') p.growth = c.value;
          if (c.key === 'price_business_monthly') p.business = c.value;
        }
        setPrices(p);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage('');
    setError('');
    try {
      const body: Record<string, number> = {};
      if (prices.starter) body.starter = parseInt(prices.starter);
      if (prices.growth) body.growth = parseInt(prices.growth);
      if (prices.business) body.business = parseInt(prices.business);

      await adminFetch('/config/pricing', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setMessage('Prices updated successfully. New subscribers will see the updated prices.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update prices');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-gray-500 p-6">Loading pricing config...</p>;

  return (
    <div className="max-w-xl">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Subscription Pricing</h3>
        <p className="text-sm text-gray-500 mb-6">
          Set monthly prices for each plan. Changes apply to new subscribers and renewals. Existing subscribers keep their current pricing until their next billing cycle.
        </p>

        <div className="space-y-4">
          {([
            { key: 'starter' as const, label: 'Starter', color: 'border-l-blue-400' },
            { key: 'growth' as const, label: 'Growth', color: 'border-l-emerald-400' },
            { key: 'business' as const, label: 'Business', color: 'border-l-purple-400' },
          ]).map((plan) => (
            <div key={plan.key} className={`border-l-4 ${plan.color} pl-4`}>
              <label className="block text-sm font-medium text-gray-700 mb-1">{plan.label}</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                <input
                  type="number"
                  min="0"
                  value={prices[plan.key]}
                  onChange={(e) => setPrices({ ...prices, [plan.key]: e.target.value })}
                  className="w-full pl-7 pr-12 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">/mo</span>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Updating...' : 'Update Prices'}
          </button>
          {message && <p className="text-sm text-green-600 font-medium">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="mt-6 rounded-lg bg-amber-50 border border-amber-200 p-4">
          <p className="text-sm text-amber-800">
            <strong>Note:</strong> Stripe prices are immutable. Updating prices will create new Stripe Price objects and archive the old ones. Existing active subscriptions will continue at their current price until renewal.
          </p>
        </div>
      </div>
    </div>
  );
}

function SettingsTab() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleChangePassword = async () => {
    setMessage('');
    setError('');

    if (!currentPassword || !newPassword) {
      setError('All fields are required');
      return;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    setSaving(true);
    try {
      await authFetch('/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setMessage('Password changed successfully');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to change password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-md">
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-1">Change Password</h3>
        <p className="text-sm text-gray-500 mb-6">Update your admin account password.</p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Current Password</label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <button
            onClick={handleChangePassword}
            disabled={saving}
            className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Changing...' : 'Change Password'}
          </button>
          {message && <p className="text-sm text-green-600 font-medium">{message}</p>}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      </div>
    </div>
  );
}

// ========== MAIN COMPONENT ==========

export default function AdminDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('Overview');

  if (user?.role !== 'admin') {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <SEO title="Admin" noIndex />
      {/* Tab bar */}
      <div className="border-b border-gray-200">
        <nav className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === 'Overview' && <OverviewTab />}
      {activeTab === 'Users' && <UsersTab />}
      {activeTab === 'Pricing' && <PricingTab />}
      {activeTab === 'Settings' && <SettingsTab />}
    </div>
  );
}
