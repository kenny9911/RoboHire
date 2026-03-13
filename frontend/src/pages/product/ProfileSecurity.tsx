import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
import { API_BASE } from '../../config';
import SEO from '../../components/SEO';

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

export default function ProfileSecurity() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handlePasswordChange = async () => {
    setMsg(null);
    if (newPassword !== confirmPassword) {
      setMsg({ type: 'error', text: t('account.security.mismatch', 'Passwords do not match') });
      return;
    }
    setSaving(true);
    try {
      const res = await authFetch('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Password change failed');
      setMsg({ type: 'success', text: t('account.security.changed', 'Password changed successfully') });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setMsg({ type: 'error', text: err instanceof Error ? err.message : 'Password change failed' });
    } finally {
      setSaving(false);
    }
  };

  const isOAuth = user?.provider && user.provider !== 'email';

  return (
    <div className="space-y-6 max-w-2xl">
      <SEO title="Security" noIndex />

      <section>
        <h2 className="text-lg font-semibold text-slate-900 mb-4">{t('account.security.title', 'Security')}</h2>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          {/* Auth method info */}
          <div className="flex items-center gap-3 mb-5 pb-5 border-b border-slate-100">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
              <svg className="w-5 h-5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-slate-900">{user?.email}</p>
              <p className="text-xs text-slate-500">
                {isOAuth
                  ? t('account.security.oauthMethod', 'Signed in with {{provider}}', { provider: user?.provider })
                  : t('account.security.emailMethod', 'Signed in with email & password')}
              </p>
            </div>
          </div>

          {/* Password change or OAuth notice */}
          {isOAuth ? (
            <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 rounded-lg">
              <svg className="w-5 h-5 text-slate-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-slate-600">{t('account.security.oauthNote', 'Password change is not available for social login accounts.')}</p>
            </div>
          ) : (
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-slate-700">{t('account.security.changePassword', 'Change Password')}</h3>
              <div>
                <label className="block text-sm text-slate-600 mb-1">{t('account.security.currentPassword', 'Current Password')}</label>
                <input
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-600 mb-1">{t('account.security.newPassword', 'New Password')}</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 mb-1">{t('account.security.confirmPassword', 'Confirm New Password')}</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                  />
                </div>
              </div>
              {msg && (
                <p className={`text-sm ${msg.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                  {msg.text}
                </p>
              )}
              <div className="flex justify-end">
                <button
                  onClick={handlePasswordChange}
                  disabled={saving || !currentPassword || !newPassword}
                  className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-60 transition-colors"
                >
                  {saving ? t('account.security.changing', 'Changing...') : t('account.security.change', 'Change Password')}
                </button>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
