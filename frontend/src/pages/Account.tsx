import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';
import SEO from '../components/SEO';

const PLAN_LIMITS: Record<string, { interviews: number; matches: number }> = {
  free: { interviews: 0, matches: 0 },
  starter: { interviews: 15, matches: 30 },
  growth: { interviews: 120, matches: 240 },
  business: { interviews: 280, matches: 500 },
  custom: { interviews: Infinity, matches: Infinity },
};

const TOPUP_PRESETS = [10, 25, 50, 100];

interface BillingItem {
  id: string;
  amount: number;
  currency: string;
  status: string;
  description: string;
  date: string | null;
  invoiceUrl?: string | null;
  pdfUrl?: string | null;
  receiptUrl?: string | null;
  type: 'invoice' | 'charge';
}

function authFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });
}

export default function Account() {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Profile state
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profileCompany, setProfileCompany] = useState(user?.company || '');
  const [profileAvatar, setProfileAvatar] = useState(user?.avatar || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Password state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [passwordMsg, setPasswordMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Top-up state
  const [topupLoading, setTopupLoading] = useState<number | null>(null);
  const [topupMsg, setTopupMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [customAmount, setCustomAmount] = useState('');

  // Sync state
  const [syncing, setSyncing] = useState(false);

  // Billing history state
  const [billingItems, setBillingItems] = useState<BillingItem[]>([]);
  const [billingLoading, setBillingLoading] = useState(true);

  // Sync profile fields when user changes
  useEffect(() => {
    if (user) {
      setProfileName(user.name || '');
      setProfileCompany(user.company || '');
      setProfileAvatar(user.avatar || '');
    }
  }, [user]);

  // Handle top-up success redirect — poll for balance update
  useEffect(() => {
    if (searchParams.get('topup') !== 'success') return;
    setSearchParams({}, { replace: true });
    setTopupMsg({ type: 'success', text: t('account.topup.updating', 'Payment received! Updating your balance...') });

    let cancelled = false;
    const poll = async () => {
      const MAX_ATTEMPTS = 8;
      const INTERVAL_MS = 2000;
      for (let i = 0; i < MAX_ATTEMPTS; i++) {
        if (cancelled) return;
        try {
          const res = await authFetch('/api/v1/topup/status');
          const data = await res.json();
          if (data.success && data.data?.latestTopup?.status === 'completed') {
            await refreshUser();
            if (!cancelled) {
              setTopupMsg({ type: 'success', text: t('account.topup.success', 'Top-up successful! Your balance has been updated.') });
            }
            return;
          }
        } catch {
          // Ignore polling errors
        }
        await new Promise(r => setTimeout(r, INTERVAL_MS));
      }
      // Timed out — refresh anyway (webhook may have landed)
      await refreshUser();
      if (!cancelled) {
        setTopupMsg({ type: 'success', text: t('account.topup.successDelayed', 'Payment received! Your balance may take a moment to update.') });
      }
    };
    poll();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-sync with Stripe on mount to ensure balance is accurate
  useEffect(() => {
    authFetch('/api/v1/sync', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.success && (data.data?.synced?.topups > 0 || data.data?.synced?.subscription)) {
          refreshUser();
        }
      })
      .catch(() => {}); // Silently fail
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fetch billing history
  useEffect(() => {
    const fetchBilling = async () => {
      setBillingLoading(true);
      try {
        const res = await authFetch('/api/v1/billing-history');
        const data = await res.json();
        if (data.success) {
          const invoices: BillingItem[] = (data.data.invoices || []).map((inv: any) => ({ ...inv, type: 'invoice' }));
          const charges: BillingItem[] = (data.data.charges || []).map((ch: any) => ({ ...ch, type: 'charge' }));
          const combined = [...invoices, ...charges].sort(
            (a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime()
          );
          setBillingItems(combined);
        }
      } catch {
        // Silently fail — billing may not be configured
      } finally {
        setBillingLoading(false);
      }
    };
    fetchBilling();
  }, []);

  const handleProfileSave = async () => {
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      const res = await authFetch('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({ name: profileName, company: profileCompany, avatar: profileAvatar }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Update failed');
      await refreshUser();
      setProfileMsg({ type: 'success', text: t('account.profile.saved', 'Profile updated successfully') });
    } catch (err) {
      setProfileMsg({ type: 'error', text: err instanceof Error ? err.message : 'Update failed' });
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordChange = async () => {
    setPasswordMsg(null);
    if (newPassword !== confirmPassword) {
      setPasswordMsg({ type: 'error', text: t('account.security.mismatch', 'Passwords do not match') });
      return;
    }
    setPasswordSaving(true);
    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Password change failed');
      setPasswordMsg({ type: 'success', text: t('account.security.changed', 'Password changed successfully') });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setPasswordMsg({ type: 'error', text: err instanceof Error ? err.message : 'Password change failed' });
    } finally {
      setPasswordSaving(false);
    }
  };

  const handleTopup = async (dollars: number) => {
    const cents = Math.round(dollars * 100);
    if (cents < 1000 || cents > 100000) {
      setTopupMsg({ type: 'error', text: t('account.topup.invalidAmount', 'Amount must be between $10 and $1,000.') });
      return;
    }
    setTopupLoading(cents);
    setTopupMsg(null);
    try {
      const res = await authFetch('/api/v1/topup', {
        method: 'POST',
        body: JSON.stringify({ amount: cents }),
      });
      const data = await res.json();
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
      } else {
        throw new Error(data.error || 'Failed to create top-up session');
      }
    } catch (err) {
      setTopupMsg({ type: 'error', text: err instanceof Error ? err.message : 'Top-up failed' });
      setTopupLoading(null);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await authFetch('/api/v1/sync', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        await refreshUser();
        const { topups, subscription } = data.data.synced;
        if (topups > 0 || subscription) {
          setTopupMsg({ type: 'success', text: t('account.sync.updated', 'Account synced with payment provider.') });
        }
      }
    } catch {
      // Silently fail
    } finally {
      setSyncing(false);
    }
  };

  const tier = user?.subscriptionTier || 'free';
  const limits = PLAN_LIMITS[tier] || PLAN_LIMITS.free;

  const tierLabel: Record<string, string> = {
    free: 'Free',
    starter: 'Starter',
    growth: 'Growth',
    business: 'Business',
    custom: 'Custom',
  };

  const statusColors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700',
    trialing: 'bg-blue-100 text-blue-700',
    past_due: 'bg-amber-100 text-amber-700',
    canceled: 'bg-red-100 text-red-700',
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <SEO title="Account" noIndex />
      {/* Profile Section */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('account.profile.title', 'Profile')}</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('account.profile.name', 'Name')}</label>
            <input
              type="text"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('account.profile.company', 'Company')}</label>
            <input
              type="text"
              value={profileCompany}
              onChange={(e) => setProfileCompany(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">{t('account.profile.avatar', 'Avatar URL')}</label>
            <input
              type="text"
              value={profileAvatar}
              onChange={(e) => setProfileAvatar(e.target.value)}
              placeholder="https://..."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
            />
          </div>
          {profileMsg && (
            <p className={`text-sm ${profileMsg.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
              {profileMsg.text}
            </p>
          )}
          <button
            onClick={handleProfileSave}
            disabled={profileSaving}
            className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
          >
            {profileSaving ? t('account.profile.saving', 'Saving...') : t('account.profile.save', 'Save Changes')}
          </button>
        </div>
      </section>

      {/* Security Section */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('account.security.title', 'Security')}</h2>
        {user?.provider && user.provider !== 'email' ? (
          <p className="text-sm text-gray-500">{t('account.security.oauthNote', 'Password change is not available for social login accounts.')}</p>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('account.security.currentPassword', 'Current Password')}</label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('account.security.newPassword', 'New Password')}</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{t('account.security.confirmPassword', 'Confirm New Password')}</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
            {passwordMsg && (
              <p className={`text-sm ${passwordMsg.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                {passwordMsg.text}
              </p>
            )}
            <button
              onClick={handlePasswordChange}
              disabled={passwordSaving || !currentPassword || !newPassword}
              className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-60 transition-colors"
            >
              {passwordSaving ? t('account.security.changing', 'Changing...') : t('account.security.change', 'Change Password')}
            </button>
          </div>
        )}
      </section>

      {/* Subscription Section */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900">{t('account.subscription.title', 'Subscription')}</h2>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            title={t('account.sync.title', 'Sync with Stripe')}
          >
            <svg className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {syncing ? t('account.sync.syncing', 'Syncing...') : t('account.sync.button', 'Sync')}
          </button>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-600">{t('account.subscription.currentPlan', 'Current Plan')}:</span>
            <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-indigo-100 text-indigo-700">
              {tierLabel[tier] || tier}
            </span>
            {user?.subscriptionStatus && (
              <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${statusColors[user.subscriptionStatus] || 'bg-gray-100 text-gray-700'}`}>
                {user.subscriptionStatus}
              </span>
            )}
          </div>

          {user?.subscriptionStatus === 'trialing' && user?.trialEnd && (
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
              <svg className="w-4 h-4 text-blue-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-blue-700">
                {t('account.subscription.trialEnds', 'Free trial ends on')} {new Date(user.trialEnd).toLocaleDateString()}
              </p>
            </div>
          )}

          {user?.currentPeriodEnd && user?.subscriptionStatus !== 'trialing' && (
            <p className="text-sm text-gray-500">
              {t('account.subscription.renewsOn', 'Renews on')}: {new Date(user.currentPeriodEnd).toLocaleDateString()}
            </p>
          )}

          {/* Usage */}
          <div className="space-y-3 pt-2">
            <p className="text-sm font-medium text-gray-700">{t('account.subscription.usage', 'Usage')}</p>

            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{t('account.subscription.interviews', 'Interviews')}</span>
                <span>
                  {user?.interviewsUsed ?? 0} {t('account.subscription.of', 'of')} {limits.interviews === Infinity ? '∞' : limits.interviews}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`rounded-full h-2 transition-all ${(user?.interviewsUsed ?? 0) >= limits.interviews && limits.interviews !== Infinity ? 'bg-amber-500' : 'bg-indigo-600'}`}
                  style={{ width: `${limits.interviews === Infinity ? 0 : Math.min(100, ((user?.interviewsUsed ?? 0) / limits.interviews) * 100)}%` }}
                />
              </div>
              {(user?.interviewsUsed ?? 0) >= limits.interviews && limits.interviews !== Infinity && (
                <p className="text-xs text-amber-600 mt-1">
                  {t('account.subscription.overLimit', 'Plan limit reached. Additional usage billed at ${{price}} each from your top-up balance.', { price: '2.00' })}
                </p>
              )}
            </div>

            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{t('account.subscription.matches', 'Resume Matches')}</span>
                <span>
                  {user?.resumeMatchesUsed ?? 0} {t('account.subscription.of', 'of')} {limits.matches === Infinity ? '∞' : limits.matches}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`rounded-full h-2 transition-all ${(user?.resumeMatchesUsed ?? 0) >= limits.matches && limits.matches !== Infinity ? 'bg-amber-500' : 'bg-indigo-600'}`}
                  style={{ width: `${limits.matches === Infinity ? 0 : Math.min(100, ((user?.resumeMatchesUsed ?? 0) / limits.matches) * 100)}%` }}
                />
              </div>
              {(user?.resumeMatchesUsed ?? 0) >= limits.matches && limits.matches !== Infinity && (
                <p className="text-xs text-amber-600 mt-1">
                  {t('account.subscription.overLimit', 'Plan limit reached. Additional usage billed at ${{price}} each from your top-up balance.', { price: '0.40' })}
                </p>
              )}
            </div>
          </div>

          <button
            onClick={() => navigate('/pricing')}
            className="px-4 py-2 border border-indigo-600 text-indigo-600 text-sm font-medium rounded-lg hover:bg-indigo-50 transition-colors"
          >
            {t('account.subscription.changePlan', 'Change Plan')}
          </button>
        </div>
      </section>

      {/* Purchase Credits Section */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-1">{t('account.topup.title', 'Purchase Credits')}</h2>
        <p className="text-sm text-gray-500 mb-5">
          {t('account.topup.currentBalance', 'Current Balance')}: <span className="font-semibold text-gray-900">${(user?.topUpBalance ?? 0).toFixed(2)}</span>
        </p>

        <div className="space-y-4">
          {/* Quick amount presets */}
          <div className="flex flex-wrap gap-2">
            {TOPUP_PRESETS.map((dollars) => (
              <button
                key={dollars}
                onClick={() => setCustomAmount(String(dollars))}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                  customAmount === String(dollars)
                    ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                ${dollars}
              </button>
            ))}
          </div>

          {/* Amount input */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3.5">
              <span className="text-sm font-medium text-gray-700">{t('account.topup.amount', 'Amount')}</span>
              <div className="flex items-center">
                <span className="text-sm text-gray-400 mr-1">$</span>
                <input
                  type="number"
                  min="10"
                  max="1000"
                  step="1"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="10"
                  className="w-20 text-right text-base font-medium text-gray-900 outline-none bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
          </div>

          {/* Purchase button */}
          <button
            onClick={() => {
              const val = parseFloat(customAmount);
              if (!val || val < 10 || val > 1000) {
                setTopupMsg({ type: 'error', text: t('account.topup.invalidAmount', 'Amount must be between $10 and $1,000.') });
                return;
              }
              handleTopup(val);
            }}
            disabled={topupLoading !== null || !customAmount || parseFloat(customAmount) < 10}
            className="w-full py-3 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {topupLoading !== null ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {t('account.topup.processing', 'Processing...')}
              </span>
            ) : (
              t('account.topup.purchase', 'Purchase')
            )}
          </button>

          {topupMsg && (
            <p className={`text-sm ${topupMsg.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
              {topupMsg.text}
            </p>
          )}
        </div>
      </section>

      {/* Billing History Section */}
      <section className="bg-white rounded-2xl border border-gray-200 p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{t('account.billing.title', 'Billing History')}</h2>

        {billingLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : billingItems.length === 0 ? (
          <p className="text-sm text-gray-500">{t('account.billing.empty', 'No billing history yet.')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="pb-2 font-medium text-gray-500">{t('account.billing.date', 'Date')}</th>
                  <th className="pb-2 font-medium text-gray-500">{t('account.billing.description', 'Description')}</th>
                  <th className="pb-2 font-medium text-gray-500">{t('account.billing.amount', 'Amount')}</th>
                  <th className="pb-2 font-medium text-gray-500">{t('account.billing.status', 'Status')}</th>
                  <th className="pb-2 font-medium text-gray-500">{t('account.billing.action', 'Receipt')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {billingItems.map((item) => {
                  const link = item.type === 'invoice' ? item.invoiceUrl : item.receiptUrl;
                  return (
                    <tr key={item.id} className="text-gray-700">
                      <td className="py-2.5">{item.date ? new Date(item.date).toLocaleDateString() : '—'}</td>
                      <td className="py-2.5">{item.description}</td>
                      <td className="py-2.5 font-medium">${item.amount.toFixed(2)}</td>
                      <td className="py-2.5">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                          item.status === 'paid' || item.status === 'succeeded'
                            ? 'bg-emerald-100 text-emerald-700'
                            : item.status === 'open' || item.status === 'pending'
                              ? 'bg-amber-100 text-amber-700'
                              : 'bg-gray-100 text-gray-600'
                        }`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="py-2.5">
                        {link ? (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-800 text-xs font-medium"
                          >
                            {item.type === 'invoice'
                              ? t('account.billing.viewInvoice', 'View')
                              : t('account.billing.viewReceipt', 'Receipt')}
                          </a>
                        ) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
