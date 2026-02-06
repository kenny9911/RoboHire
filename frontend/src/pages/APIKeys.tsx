import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  expiresAt: string | null;
  isActive: boolean;
  createdAt: string;
}

interface NewKeyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (key: ApiKey & { key: string }) => void;
}

function NewKeyModal({ isOpen, onClose, onCreated }: NewKeyModalProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['read', 'write']);
  const [expiresAt, setExpiresAt] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/api/v1/api-keys`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          scopes,
          expiresAt: expiresAt || undefined,
        }),
      });

      const data = await response.json();

      if (data.success) {
        onCreated(data.data);
        setName('');
        setScopes(['read', 'write']);
        setExpiresAt('');
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to create API key');
    } finally {
      setIsCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl w-full max-w-md p-6 mx-4">
        <h2 className="text-xl font-semibold text-gray-900 mb-6">
          {t('apiKeys.createNew', 'Create New API Key')}
        </h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('apiKeys.name', 'Name')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('apiKeys.namePlaceholder', 'My API Key')}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('apiKeys.scopes', 'Permissions')}
            </label>
            <div className="space-y-2">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={scopes.includes('read')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setScopes([...scopes, 'read']);
                    } else {
                      setScopes(scopes.filter(s => s !== 'read'));
                    }
                  }}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">
                  {t('apiKeys.scopeRead', 'Read')} - {t('apiKeys.scopeReadDesc', 'Access data via API')}
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={scopes.includes('write')}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setScopes([...scopes, 'write']);
                    } else {
                      setScopes(scopes.filter(s => s !== 'write'));
                    }
                  }}
                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-700">
                  {t('apiKeys.scopeWrite', 'Write')} - {t('apiKeys.scopeWriteDesc', 'Create and modify data')}
                </span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('apiKeys.expiration', 'Expiration')} <span className="text-gray-400">({t('apiKeys.optional', 'optional')})</span>
            </label>
            <input
              type="date"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={new Date().toISOString().split('T')[0]}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {error && (
            <p className="text-sm text-red-600">{error}</p>
          )}
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            {t('apiKeys.cancel', 'Cancel')}
          </button>
          <button
            onClick={handleCreate}
            disabled={isCreating || scopes.length === 0}
            className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {isCreating ? t('apiKeys.creating', 'Creating...') : t('apiKeys.create', 'Create Key')}
          </button>
        </div>
      </div>
    </div>
  );
}

interface KeyCreatedModalProps {
  apiKey: (ApiKey & { key: string }) | null;
  onClose: () => void;
}

function KeyCreatedModal({ apiKey, onClose }: KeyCreatedModalProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  if (!apiKey) return null;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(apiKey.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl w-full max-w-lg p-6 mx-4">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-900">
            {t('apiKeys.created', 'API Key Created!')}
          </h2>
          <p className="text-gray-500 text-sm mt-2">
            {t('apiKeys.copyWarning', 'Copy your API key now. You won\'t be able to see it again!')}
          </p>
        </div>

        <div className="bg-gray-100 rounded-lg p-4 mb-6">
          <div className="flex items-center justify-between gap-4">
            <code className="text-sm font-mono text-gray-800 break-all">
              {apiKey.key}
            </code>
            <button
              onClick={handleCopy}
              className="flex-shrink-0 p-2 text-gray-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
            >
              {copied ? (
                <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        <button
          onClick={onClose}
          className="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
        >
          {t('apiKeys.done', 'Done')}
        </button>
      </div>
    </div>
  );
}

export default function APIKeys() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();

  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showNewKeyModal, setShowNewKeyModal] = useState(false);
  const [newlyCreatedKey, setNewlyCreatedKey] = useState<(ApiKey & { key: string }) | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/api/v1/api-keys`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'include',
      });
      const data = await response.json();

      if (data.success) {
        setApiKeys(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to load API keys');
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyCreated = (key: ApiKey & { key: string }) => {
    setShowNewKeyModal(false);
    setNewlyCreatedKey(key);
    fetchApiKeys();
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('apiKeys.confirmDelete', 'Are you sure you want to delete this API key? This action cannot be undone.'))) {
      return;
    }

    setDeletingId(id);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/api/v1/api-keys/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'include',
      });
      const data = await response.json();

      if (data.success) {
        setApiKeys(apiKeys.filter(k => k.id !== id));
      } else {
        alert(data.error);
      }
    } catch (err) {
      alert('Failed to delete API key');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (id: string, isActive: boolean) => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/api/v1/api-keys/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ isActive: !isActive }),
      });
      const data = await response.json();

      if (data.success) {
        setApiKeys(apiKeys.map(k => k.id === id ? { ...k, isActive: !isActive } : k));
      }
    } catch (err) {
      console.error('Failed to toggle API key:', err);
    }
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2 text-xl font-bold text-indigo-600">
              <svg className="w-7 h-7" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>RoboHire</span>
            </Link>

            <nav className="hidden md:flex items-center gap-6">
              <Link to="/dashboard" className="text-gray-600 hover:text-indigo-600 font-medium transition-colors">
                {t('dashboard.nav.dashboard', 'Dashboard')}
              </Link>
              <Link to="/dashboard/api-keys" className="text-indigo-600 font-medium">
                {t('apiKeys.title', 'API Keys')}
              </Link>
              <Link to="/api-playground" className="text-gray-600 hover:text-indigo-600 font-medium transition-colors">
                {t('dashboard.nav.apiPlayground', 'API Playground')}
              </Link>
            </nav>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                {user?.avatar ? (
                  <img src={user.avatar} alt="" className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                    <span className="text-indigo-600 font-medium text-sm">
                      {user?.name?.[0] || user?.email?.[0] || 'U'}
                    </span>
                  </div>
                )}
                <span className="hidden sm:block text-sm text-gray-700 font-medium">
                  {user?.name || user?.email}
                </span>
              </div>
              <button
                onClick={handleLogout}
                className="text-gray-500 hover:text-red-600 transition-colors"
                title={t('dashboard.logout', 'Logout')}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 mb-1">
              {t('apiKeys.title', 'API Keys')}
            </h1>
            <p className="text-gray-500">
              {t('apiKeys.subtitle', 'Manage your API keys for programmatic access.')}
            </p>
          </div>
          <button
            onClick={() => setShowNewKeyModal(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            {t('apiKeys.createKey', 'Create Key')}
          </button>
        </div>

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-6">
          <div className="flex gap-3">
            <svg className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm text-blue-800">
                {t('apiKeys.usageInfo', 'Use API keys to authenticate requests from your applications. Include the key in the')} <code className="bg-blue-100 px-1 rounded">Authorization: Bearer rh_...</code> {t('apiKeys.usageInfoHeader', 'header or')} <code className="bg-blue-100 px-1 rounded">X-API-Key: rh_...</code> {t('apiKeys.usageInfoHeader2', 'header.')}
              </p>
            </div>
          </div>
        </div>

        {/* API Keys List */}
        <div className="bg-white rounded-xl border border-gray-200">
          {isLoading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
              <p className="text-gray-500 mt-4">{t('apiKeys.loading', 'Loading...')}</p>
            </div>
          ) : error ? (
            <div className="p-12 text-center">
              <p className="text-red-600">{error}</p>
            </div>
          ) : apiKeys.length === 0 ? (
            <div className="p-12 text-center">
              <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                </svg>
              </div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">
                {t('apiKeys.noKeys', 'No API Keys')}
              </h3>
              <p className="text-gray-500 mb-4">
                {t('apiKeys.noKeysDesc', 'Create your first API key to start using the RoboHire API.')}
              </p>
              <button
                onClick={() => setShowNewKeyModal(true)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                {t('apiKeys.createKey', 'Create Key')}
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {apiKeys.map((apiKey) => (
                <div key={apiKey.id} className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-gray-900">{apiKey.name}</h3>
                        {apiKey.isActive ? (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-xs font-medium rounded-full">
                            {t('apiKeys.active', 'Active')}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
                            {t('apiKeys.inactive', 'Inactive')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mb-3">
                        <code className="text-sm font-mono text-gray-600 bg-gray-100 px-2 py-1 rounded">
                          {apiKey.key}
                        </code>
                      </div>
                      <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500">
                        <span>
                          {t('apiKeys.created', 'Created')}: {formatDate(apiKey.createdAt)}
                        </span>
                        <span>
                          {t('apiKeys.lastUsed', 'Last used')}: {apiKey.lastUsedAt ? formatDate(apiKey.lastUsedAt) : t('apiKeys.never', 'Never')}
                        </span>
                        {apiKey.expiresAt && (
                          <span>
                            {t('apiKeys.expires', 'Expires')}: {formatDate(apiKey.expiresAt)}
                          </span>
                        )}
                        <span className="flex items-center gap-1">
                          {t('apiKeys.scopes', 'Scopes')}: {apiKey.scopes.join(', ')}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-4">
                      <button
                        onClick={() => handleToggleActive(apiKey.id, apiKey.isActive)}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title={apiKey.isActive ? t('apiKeys.deactivate', 'Deactivate') : t('apiKeys.activate', 'Activate')}
                      >
                        {apiKey.isActive ? (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        )}
                      </button>
                      <button
                        onClick={() => handleDelete(apiKey.id)}
                        disabled={deletingId === apiKey.id}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                        title={t('apiKeys.delete', 'Delete')}
                      >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      <NewKeyModal
        isOpen={showNewKeyModal}
        onClose={() => setShowNewKeyModal(false)}
        onCreated={handleKeyCreated}
      />
      <KeyCreatedModal
        apiKey={newlyCreatedKey}
        onClose={() => setNewlyCreatedKey(null)}
      />
    </div>
  );
}
