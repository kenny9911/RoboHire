import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import SEO from '../../components/SEO';
import {
  formatUsageLimit,
  getEffectiveInterviewLimit,
  getEffectiveMatchLimit,
  getUsagePercentage,
  isUsageExceeded,
} from '../../utils/usageLimits';

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

export default function Profile() {
  const { t, i18n } = useTranslation();
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Profile state
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profileEmail, setProfileEmail] = useState(user?.email || '');
  const [profilePhone, setProfilePhone] = useState(user?.phone || '');
  const [profileJobTitle, setProfileJobTitle] = useState(user?.jobTitle || '');
  const [profileCompany, setProfileCompany] = useState(user?.company || '');
  const [profileAvatar, setProfileAvatar] = useState(user?.avatar || '');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Top-up state
  const [topupLoading, setTopupLoading] = useState<number | null>(null);
  const [topupMsg, setTopupMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [customAmount, setCustomAmount] = useState('');
  const [topupPaymentModal, setTopupPaymentModal] = useState<number | null>(null);

  // Sync state
  const [syncing, setSyncing] = useState(false);

  // Billing history state
  const [billingItems, setBillingItems] = useState<BillingItem[]>([]);
  const [billingLoading, setBillingLoading] = useState(true);

  useEffect(() => {
    if (user) {
      setProfileName(user.name || '');
      setProfileEmail(user.email || '');
      setProfilePhone(user.phone || '');
      setProfileJobTitle(user.jobTitle || '');
      setProfileCompany(user.company || '');
      setProfileAvatar(user.avatar || '');
    }
  }, [user]);

  // Handle top-up success redirect
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
            if (!cancelled) setTopupMsg({ type: 'success', text: t('account.topup.success', 'Top-up successful! Your balance has been updated.') });
            return;
          }
        } catch { /* ignore */ }
        await new Promise(r => setTimeout(r, INTERVAL_MS));
      }
      await refreshUser();
      if (!cancelled) setTopupMsg({ type: 'success', text: t('account.topup.successDelayed', 'Payment received! Your balance may take a moment to update.') });
    };
    poll();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-sync with Stripe on mount
  useEffect(() => {
    authFetch('/api/v1/sync', { method: 'POST' })
      .then(res => res.json())
      .then(data => {
        if (data.success && (data.data?.synced?.topups > 0 || data.data?.synced?.subscription)) {
          refreshUser();
        }
      })
      .catch(() => {});
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
      } catch { /* billing may not be configured */ } finally {
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
        body: JSON.stringify({ name: profileName, email: profileEmail, phone: profilePhone, jobTitle: profileJobTitle, company: profileCompany, avatar: profileAvatar }),
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

  const handleTopup = async (dollars: number) => {
    if (i18n.language === 'zh') {
      setTopupPaymentModal(dollars);
      return;
    }
    await proceedStripeTopup(dollars);
  };

  const proceedStripeTopup = async (dollars: number) => {
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

  const proceedAlipayTopup = async (amount: number) => {
    setTopupPaymentModal(null);
    if (amount < 10 || amount > 10000) {
      setTopupMsg({ type: 'error', text: t('account.topup.invalidAmountCNY', 'Amount must be between ¥10 and ¥10,000.') });
      return;
    }
    setTopupLoading(amount);
    setTopupMsg(null);
    try {
      const res = await authFetch('/api/v1/topup/alipay', {
        method: 'POST',
        body: JSON.stringify({ amount }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        throw new Error(`Server error (${res.status})`);
      }
      const data = await res.json();
      if (data.success && data.data?.url) {
        window.location.href = data.data.url;
      } else {
        throw new Error(data.error || 'Failed to create Alipay top-up');
      }
    } catch (err) {
      setTopupMsg({ type: 'error', text: err instanceof Error ? err.message : 'Alipay top-up failed' });
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
    } catch { /* silently fail */ } finally {
      setSyncing(false);
    }
  };

  const tier = user?.subscriptionTier || 'free';
  const interviewLimit = getEffectiveInterviewLimit(user);
  const matchLimit = getEffectiveMatchLimit(user);

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
    <div className="space-y-6 max-w-2xl">
      <SEO title="Settings" noIndex />

      {/* Profile Section */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">{t('account.profile.title', 'Profile')}</h2>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {/* Avatar + basic info */}
          <div className="flex items-start gap-5 mb-5 pb-5 border-b border-slate-100">
            {user?.avatar ? (
              <img src={user.avatar} alt="" className="h-16 w-16 rounded-full" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-blue-100 flex-shrink-0">
                <span className="text-2xl font-bold text-blue-600">
                  {user?.name?.[0] || user?.email?.[0] || 'U'}
                </span>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-base font-semibold text-slate-900">{user?.name || 'User'}</p>
              <p className="text-sm text-slate-500">{user?.email}</p>
              <p className="mt-1 text-xs text-slate-400">
                {t('account.profile.joined', 'Joined')} {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : ''}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('account.profile.name', 'Name')}</label>
                <input
                  type="text"
                  value={profileName}
                  onChange={(e) => setProfileName(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('account.profile.jobTitle', 'Job Title')}</label>
                <input
                  type="text"
                  value={profileJobTitle}
                  onChange={(e) => setProfileJobTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('account.profile.company', 'Company')}</label>
                <input
                  type="text"
                  value={profileCompany}
                  onChange={(e) => setProfileCompany(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('account.profile.email', 'Email')}</label>
                <input
                  type="email"
                  value={profileEmail}
                  onChange={(e) => setProfileEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">{t('account.profile.phone', 'Phone')}</label>
                <input
                  type="tel"
                  value={profilePhone}
                  onChange={(e) => setProfilePhone(e.target.value)}
                  placeholder="+1 (555) 000-0000"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('account.profile.avatar', 'Avatar URL')}</label>
              <input
                type="text"
                value={profileAvatar}
                onChange={(e) => setProfileAvatar(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
              />
            </div>
            {profileMsg && (
              <p className={`text-sm ${profileMsg.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                {profileMsg.text}
              </p>
            )}
            <div className="flex justify-end">
              <button
                onClick={handleProfileSave}
                disabled={profileSaving}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
              >
                {profileSaving ? t('account.profile.saving', 'Saving...') : t('account.profile.save', 'Save Changes')}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Subscription Section */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-900">{t('account.subscription.title', 'Subscription')}</h2>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50 disabled:opacity-50 transition-colors"
            title={t('account.sync.title', 'Sync with Stripe')}
          >
            <svg className={`w-3.5 h-3.5 ${syncing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {syncing ? t('account.sync.syncing', 'Syncing...') : t('account.sync.button', 'Sync')}
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          {/* Plan + status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="text-sm text-slate-600">{t('account.subscription.currentPlan', 'Current Plan')}</span>
              <span className="px-2.5 py-0.5 text-xs font-semibold rounded-full bg-blue-100 text-blue-700">
                {tierLabel[tier] || tier}
              </span>
              {user?.subscriptionStatus && (
                <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${statusColors[user.subscriptionStatus] || 'bg-slate-100 text-slate-700'}`}>
                  {user.subscriptionStatus}
                </span>
              )}
            </div>
            <button
              onClick={() => navigate('/pricing')}
              className="px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
            >
              {t('account.subscription.changePlan', 'Change Plan')}
            </button>
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
            <p className="text-sm text-slate-500">
              {t('account.subscription.renewsOn', 'Renews on')}: {new Date(user.currentPeriodEnd).toLocaleDateString()}
            </p>
          )}

          {/* Usage bars */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <p className="text-sm font-medium text-slate-700">{t('account.subscription.usage', 'Usage')}</p>

            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>{t('account.subscription.interviews', 'Interviews')}</span>
                <span>
                  {user?.interviewsUsed ?? 0} {t('account.subscription.of', 'of')} {formatUsageLimit(interviewLimit)}
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div
                  className={`rounded-full h-1.5 transition-all ${isUsageExceeded(interviewLimit, user?.interviewsUsed ?? 0) ? 'bg-amber-500' : 'bg-blue-600'}`}
                  style={{ width: `${getUsagePercentage(interviewLimit, user?.interviewsUsed ?? 0)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>{t('account.subscription.matches', 'Resume Matches')}</span>
                <span>
                  {user?.resumeMatchesUsed ?? 0} {t('account.subscription.of', 'of')} {formatUsageLimit(matchLimit)}
                </span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div
                  className={`rounded-full h-1.5 transition-all ${isUsageExceeded(matchLimit, user?.resumeMatchesUsed ?? 0) ? 'bg-amber-500' : 'bg-blue-600'}`}
                  style={{ width: `${getUsagePercentage(matchLimit, user?.resumeMatchesUsed ?? 0)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Purchase Credits Section */}
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">{t('account.topup.title', 'Purchase Credits')}</h2>
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <p className="text-sm text-slate-600">
            {t('account.topup.currentBalance', 'Current Balance')}: <span className="font-semibold text-slate-900">${(user?.topUpBalance ?? 0).toFixed(2)}</span>
          </p>

          <div className="flex flex-wrap gap-2">
            {TOPUP_PRESETS.map((dollars) => (
              <button
                key={dollars}
                onClick={() => setCustomAmount(String(dollars))}
                className={`px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                  customAmount === String(dollars)
                    ? 'border-blue-600 bg-blue-50 text-blue-700'
                    : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                }`}
              >
                ${dollars}
              </button>
            ))}
          </div>

          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm font-medium text-slate-700">{t('account.topup.amount', 'Amount')}</span>
              <div className="flex items-center">
                <span className="text-sm text-slate-400 mr-1">$</span>
                <input
                  type="number"
                  min="10"
                  max="1000"
                  step="1"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  placeholder="10"
                  className="w-20 text-right text-base font-medium text-slate-900 outline-none bg-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
              </div>
            </div>
          </div>

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
            className="w-full py-2.5 bg-blue-600 text-white text-sm font-semibold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">{t('account.billing.title', 'Billing History')}</h2>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {billingLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-10 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : billingItems.length === 0 ? (
            <p className="text-sm text-slate-500">{t('account.billing.empty', 'No billing history yet.')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left">
                    <th className="pb-2 font-medium text-slate-500">{t('account.billing.date', 'Date')}</th>
                    <th className="pb-2 font-medium text-slate-500">{t('account.billing.description', 'Description')}</th>
                    <th className="pb-2 font-medium text-slate-500">{t('account.billing.amount', 'Amount')}</th>
                    <th className="pb-2 font-medium text-slate-500">{t('account.billing.status', 'Status')}</th>
                    <th className="pb-2 font-medium text-slate-500">{t('account.billing.action', 'Receipt')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {billingItems.map((item) => {
                    const link = item.type === 'invoice' ? item.invoiceUrl : item.receiptUrl;
                    return (
                      <tr key={item.id} className="text-slate-700">
                        <td className="py-2.5">{item.date ? new Date(item.date).toLocaleDateString() : '—'}</td>
                        <td className="py-2.5">{item.description}</td>
                        <td className="py-2.5 font-medium">${item.amount.toFixed(2)}</td>
                        <td className="py-2.5">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            item.status === 'paid' || item.status === 'succeeded'
                              ? 'bg-emerald-100 text-emerald-700'
                              : item.status === 'open' || item.status === 'pending'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-slate-100 text-slate-600'
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
                              className="text-blue-600 hover:text-blue-800 text-xs font-medium"
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
        </div>
      </section>

      {/* Alipay vs Stripe topup modal — zh users only */}
      {topupPaymentModal !== null && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setTopupPaymentModal(null)}>
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-slate-900 mb-1">{t('pricing.paymentModal.title', 'Select Payment Method')}</h3>
            <p className="text-sm text-slate-500 mb-6">{t('pricing.paymentModal.subtitle', 'Choose how you\'d like to complete your payment')}</p>
            <div className="space-y-3">
              <button
                onClick={() => proceedAlipayTopup(topupPaymentModal)}
                className="w-full flex items-center gap-4 p-4 border-2 border-[#00A0E9] rounded-xl hover:bg-blue-50 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-[#00A0E9] flex items-center justify-center flex-shrink-0">
                  <svg viewBox="0 0 24 24" className="w-6 h-6 fill-white" xmlns="http://www.w3.org/2000/svg">
                    <path d="M21.422 15.358c-3.83-1.153-6.055-1.84-6.055-1.84.805-1.4 1.347-3.048 1.554-4.85H20V7.33h-4.32V5.45h-2.39v1.88H9.03V5.45H6.64v1.88H2v1.338h4.55c-.14 2.34-1.07 4.38-2.59 5.73C2.84 15.22 2 16.52 2 17.88c0 2.3 2.43 3.67 5.28 3.67 2.25 0 4.62-.87 6.56-2.74 2.23 1.05 4.93 2 7.16 2.74V18.4c-1.19-.37-4.23-1.37-4.23-1.37.72-.99 1.22-1.7 1.22-1.7l3.43 1.03v-1.995zM9.17 17.7c-1.96 0-3.55-1.08-3.55-2.4 0-.9.65-1.7 1.64-2.24 1.04.43 2.17.8 3.37 1.08-.45 2.13-1.46 3.56-1.46 3.56zm4.41-2.43c-1.04-.26-2.02-.58-2.93-.97.41-1.5.62-3.12.62-4.8H9.3c0 1.26-.12 2.49-.36 3.63-.9-.22-1.74-.48-2.52-.78.86-1.1 1.44-2.49 1.62-4.06h5.23V7.33h-2.33v1.88H8.07v-1.88H6.64v1.88H6.18c.1-.97.15-1.96.15-2.96h9.3c-.18 1.87-.64 3.6-1.32 5.05z"/>
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">{t('pricing.paymentModal.alipay', 'Alipay')}</div>
                  <div className="text-xs text-slate-500">{t('pricing.paymentModal.alipayDesc', 'Pay quickly with Alipay')}</div>
                </div>
              </button>
              <button
                onClick={() => { setTopupPaymentModal(null); proceedStripeTopup(topupPaymentModal); }}
                className="w-full flex items-center gap-4 p-4 border-2 border-slate-200 rounded-xl hover:bg-slate-50 transition-colors text-left"
              >
                <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <svg className="w-6 h-6 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <div>
                  <div className="font-semibold text-slate-900">{t('pricing.paymentModal.card', 'Credit / Debit Card')}</div>
                  <div className="text-xs text-slate-500">{t('pricing.paymentModal.cardDesc', 'Visa, Mastercard, Amex')}</div>
                </div>
              </button>
            </div>
            <button onClick={() => setTopupPaymentModal(null)} className="mt-5 w-full text-sm text-slate-400 hover:text-slate-600 transition-colors">
              {t('pricing.paymentModal.cancel', 'Cancel')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
