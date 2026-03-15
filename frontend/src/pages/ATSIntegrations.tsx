import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from '../lib/axios';

interface ATSIntegration {
  id: string;
  provider: string;
  isActive: boolean;
  syncEnabled: boolean;
  lastSyncAt: string | null;
  createdAt: string;
}

interface SyncLog {
  id: string;
  direction: string;
  entityType: string;
  entityId: string | null;
  externalId: string | null;
  status: string;
  error: string | null;
  createdAt: string;
}

const ATS_PROVIDERS = [
  {
    id: 'greenhouse',
    name: 'Greenhouse',
    description: 'integrations.greenhouse.description',
    descriptionFallback: 'Enterprise ATS with structured hiring pipelines',
    fields: [{ key: 'apiKey', label: 'API Key', type: 'password' }],
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#24a148" />
        <text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="system-ui">G</text>
      </svg>
    ),
    badge: 'Easy Access',
  },
  {
    id: 'lever',
    name: 'Lever',
    description: 'integrations.lever.description',
    descriptionFallback: 'Modern ATS with opportunity-based candidate tracking',
    fields: [{ key: 'apiKey', label: 'API Key', type: 'password' }],
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#6B7280" />
        <text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="system-ui">L</text>
      </svg>
    ),
    badge: 'Easy Access',
  },
  {
    id: 'ashby',
    name: 'Ashby',
    description: 'integrations.ashby.description',
    descriptionFallback: 'All-in-one recruiting platform for scaling teams',
    fields: [{ key: 'apiKey', label: 'API Key', type: 'password' }],
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#F59E0B" />
        <text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="system-ui">A</text>
      </svg>
    ),
    badge: 'Easy Access',
  },
  {
    id: 'bamboohr',
    name: 'BambooHR',
    description: 'integrations.bamboohr.description',
    descriptionFallback: 'HR software with applicant tracking capabilities',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password' },
      { key: 'subdomain', label: 'Subdomain', type: 'text' },
    ],
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#73C41D" />
        <text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="system-ui">B</text>
      </svg>
    ),
    badge: 'Easy Access',
  },
  {
    id: 'workable',
    name: 'Workable',
    description: 'integrations.workable.description',
    descriptionFallback: 'Recruiting software with strong job board integrations',
    fields: [
      { key: 'apiKey', label: 'Access Token', type: 'password' },
      { key: 'subdomain', label: 'Subdomain', type: 'text' },
    ],
    icon: (
      <svg className="w-8 h-8" viewBox="0 0 24 24" fill="none">
        <rect width="24" height="24" rx="6" fill="#0EA5E9" />
        <text x="12" y="16" textAnchor="middle" fill="white" fontSize="12" fontWeight="700" fontFamily="system-ui">W</text>
      </svg>
    ),
    badge: 'Easy Access',
  },
];

export default function ATSIntegrations() {
  const { t } = useTranslation();
  const [integrations, setIntegrations] = useState<ATSIntegration[]>([]);
  const [loading, setLoading] = useState(true);
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [testingId, setTestingId] = useState<string | null>(null);
  const [logsId, setLogsId] = useState<string | null>(null);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await axios.get('/api/v1/ats/integrations');
      setIntegrations(res.data.data || []);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  const handleConnect = async (providerId: string) => {
    setError('');
    setSuccessMsg('');
    try {
      await axios.post('/api/v1/ats/integrations', {
        provider: providerId,
        credentials,
      });
      setSuccessMsg(t('integrations.connected', `Successfully connected to ${providerId}`));
      setConnectingProvider(null);
      setCredentials({});
      fetchIntegrations();
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Connection failed';
      setError(msg);
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await axios.delete(`/api/v1/ats/integrations/${id}`);
      fetchIntegrations();
      setSuccessMsg(t('integrations.disconnected', 'Integration disconnected'));
    } catch {
      setError('Failed to disconnect');
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    setError('');
    try {
      const res = await axios.post(`/api/v1/ats/integrations/${id}/test`);
      if (res.data.data?.connected) {
        setSuccessMsg(t('integrations.testSuccess', 'Connection test passed'));
      } else {
        setError(t('integrations.testFailed', 'Connection test failed'));
      }
    } catch {
      setError(t('integrations.testFailed', 'Connection test failed'));
    } finally {
      setTestingId(null);
    }
  };

  const handleViewLogs = async (id: string) => {
    if (logsId === id) {
      setLogsId(null);
      return;
    }
    try {
      const res = await axios.get(`/api/v1/ats/integrations/${id}/logs?limit=20`);
      setSyncLogs(res.data.data || []);
      setLogsId(id);
    } catch {
      setError('Failed to load sync logs');
    }
  };

  const getIntegration = (providerId: string) =>
    integrations.find((i) => i.provider === providerId && i.isActive);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Page header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">
          {t('integrations.title', 'Integrations Marketplace')}
        </h1>
      </div>

      {/* Alerts */}
      {error && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-2 text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}
      {successMsg && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')} className="ml-2 text-green-400 hover:text-green-600">&times;</button>
        </div>
      )}

      {/* Section: ATS */}
      <div className="mb-10">
        <h2 className="text-lg font-bold text-slate-900 mb-1">
          {t('integrations.atsTitle', 'Applicant Tracking Systems (ATS)')}
        </h2>
        <p className="text-sm text-slate-500 mb-6">
          {t('integrations.atsSubtitle', 'ATS integrations help you export candidates from the platform to your ATS.')}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ATS_PROVIDERS.map((provider) => {
            const connected = getIntegration(provider.id);
            return (
              <div
                key={provider.id}
                className="rounded-xl border border-slate-200 bg-white p-5"
              >
                {/* Card header: icon + name + badge */}
                <div className="flex items-center gap-3 mb-4">
                  {provider.icon}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-semibold text-slate-900">{provider.name}</span>
                      {connected && (
                        <span className="flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-600">
                          <span className="w-1.5 h-1.5 bg-green-500 rounded-full" />
                          {t('integrations.connectedLabel', 'Connected')}
                        </span>
                      )}
                    </div>
                    {provider.badge && !connected && (
                      <span className="inline-flex items-center gap-0.5 text-xs text-indigo-600 font-medium mt-0.5">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" /></svg>
                        {provider.badge}
                      </span>
                    )}
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-slate-500 mb-5">
                  {t(provider.description, provider.descriptionFallback)}
                </p>

                {/* Action buttons */}
                {connected ? (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleTest(connected.id)}
                      disabled={testingId === connected.id}
                      className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                      {testingId === connected.id
                        ? t('integrations.testing', 'Testing...')
                        : t('integrations.test', 'Test')}
                    </button>
                    <button
                      onClick={() => handleViewLogs(connected.id)}
                      className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      {t('integrations.logs', 'Logs')}
                    </button>
                    <button
                      onClick={() => handleDisconnect(connected.id)}
                      className="flex-1 rounded-lg border border-red-200 py-2 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                      {t('integrations.disconnect', 'Disconnect')}
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setConnectingProvider(connectingProvider === provider.id ? null : provider.id);
                        setCredentials({});
                        setError('');
                      }}
                      className="flex-1 rounded-lg border border-indigo-200 py-2 text-sm font-medium text-indigo-600 hover:bg-indigo-50 transition-colors"
                    >
                      {t('integrations.activate', 'Activate')}
                    </button>
                  </div>
                )}

                {/* Last sync info */}
                {connected?.lastSyncAt && (
                  <p className="mt-3 text-xs text-slate-400">
                    {t('integrations.lastSync', 'Last synced')}: {new Date(connected.lastSyncAt).toLocaleString()}
                  </p>
                )}

                {/* Connect form */}
                {connectingProvider === provider.id && !connected && (
                  <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
                    {provider.fields.map((field) => (
                      <div key={field.key}>
                        <label className="block text-xs font-medium text-slate-600 mb-1">
                          {field.label}
                        </label>
                        <input
                          type={field.type}
                          value={credentials[field.key] || ''}
                          onChange={(e) => setCredentials({ ...credentials, [field.key]: e.target.value })}
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                          placeholder={`Enter ${field.label.toLowerCase()}`}
                        />
                      </div>
                    ))}
                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={() => handleConnect(provider.id)}
                        disabled={!credentials.apiKey}
                        className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {t('integrations.connectAndTest', 'Connect & Test')}
                      </button>
                      <button
                        onClick={() => {
                          setConnectingProvider(null);
                          setCredentials({});
                        }}
                        className="rounded-lg px-4 py-2 text-sm text-slate-600 hover:text-slate-800 transition-colors"
                      >
                        {t('integrations.cancel', 'Cancel')}
                      </button>
                    </div>
                  </div>
                )}

                {/* Sync logs */}
                {logsId === connected?.id && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-slate-700 mb-2">
                      {t('integrations.syncHistory', 'Sync History')}
                    </h4>
                    {syncLogs.length === 0 ? (
                      <p className="text-xs text-slate-400">{t('integrations.noLogs', 'No sync activity yet')}</p>
                    ) : (
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {syncLogs.map((log) => (
                          <div
                            key={log.id}
                            className="flex items-center justify-between text-xs py-2 px-3 bg-slate-50 rounded-lg"
                          >
                            <div className="flex items-center gap-2">
                              <span className={`w-1.5 h-1.5 rounded-full ${log.status === 'success' ? 'bg-green-500' : log.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                              <span className="text-slate-700">
                                {log.direction} {log.entityType}
                              </span>
                              {log.error && (
                                <span className="text-red-500 truncate max-w-[200px]" title={log.error}>
                                  {log.error}
                                </span>
                              )}
                            </div>
                            <span className="text-slate-400">
                              {new Date(log.createdAt).toLocaleString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
