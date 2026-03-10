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
    color: 'bg-green-100 text-green-800',
  },
  {
    id: 'lever',
    name: 'Lever',
    description: 'integrations.lever.description',
    descriptionFallback: 'Modern ATS with opportunity-based candidate tracking',
    fields: [{ key: 'apiKey', label: 'API Key', type: 'password' }],
    color: 'bg-blue-100 text-blue-800',
  },
  {
    id: 'ashby',
    name: 'Ashby',
    description: 'integrations.ashby.description',
    descriptionFallback: 'All-in-one recruiting platform for scaling teams',
    fields: [{ key: 'apiKey', label: 'API Key', type: 'password' }],
    color: 'bg-purple-100 text-purple-800',
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
    color: 'bg-lime-100 text-lime-800',
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
    color: 'bg-cyan-100 text-cyan-800',
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
    <div className="max-w-4xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          {t('integrations.title', 'ATS Integrations')}
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          {t('integrations.subtitle', 'Connect your Applicant Tracking System to sync candidates automatically.')}
        </p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400 text-sm">
          {error}
          <button onClick={() => setError('')} className="ml-2 text-red-500 hover:text-red-700">&times;</button>
        </div>
      )}

      {successMsg && (
        <div className="mb-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg text-green-700 dark:text-green-400 text-sm">
          {successMsg}
          <button onClick={() => setSuccessMsg('')} className="ml-2 text-green-500 hover:text-green-700">&times;</button>
        </div>
      )}

      <div className="grid gap-4">
        {ATS_PROVIDERS.map((provider) => {
          const connected = getIntegration(provider.id);
          return (
            <div
              key={provider.id}
              className="border border-gray-200 dark:border-gray-700 rounded-xl p-5 bg-white dark:bg-gray-800"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${provider.color}`}>
                    {provider.name}
                  </span>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {t(provider.description, provider.descriptionFallback)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {connected ? (
                    <>
                      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <span className="w-2 h-2 bg-green-500 rounded-full" />
                        {t('integrations.connected', 'Connected')}
                      </span>
                      <button
                        onClick={() => handleTest(connected.id)}
                        disabled={testingId === connected.id}
                        className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50"
                      >
                        {testingId === connected.id
                          ? t('integrations.testing', 'Testing...')
                          : t('integrations.test', 'Test')}
                      </button>
                      <button
                        onClick={() => handleViewLogs(connected.id)}
                        className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700"
                      >
                        {t('integrations.logs', 'Logs')}
                      </button>
                      <button
                        onClick={() => handleDisconnect(connected.id)}
                        className="px-3 py-1.5 text-xs text-red-600 border border-red-300 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
                      >
                        {t('integrations.disconnect', 'Disconnect')}
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        setConnectingProvider(connectingProvider === provider.id ? null : provider.id);
                        setCredentials({});
                        setError('');
                      }}
                      className="px-4 py-1.5 text-xs font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                    >
                      {t('integrations.connect', 'Connect')}
                    </button>
                  )}
                </div>
              </div>

              {connected?.lastSyncAt && (
                <p className="mt-2 text-xs text-gray-500">
                  {t('integrations.lastSync', 'Last synced')}: {new Date(connected.lastSyncAt).toLocaleString()}
                </p>
              )}

              {/* Connect form */}
              {connectingProvider === provider.id && !connected && (
                <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-3">
                  {provider.fields.map((field) => (
                    <div key={field.key}>
                      <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {field.label}
                      </label>
                      <input
                        type={field.type}
                        value={credentials[field.key] || ''}
                        onChange={(e) => setCredentials({ ...credentials, [field.key]: e.target.value })}
                        className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder={`Enter ${field.label.toLowerCase()}`}
                      />
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleConnect(provider.id)}
                      disabled={!credentials.apiKey}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {t('integrations.connectAndTest', 'Connect & Test')}
                    </button>
                    <button
                      onClick={() => {
                        setConnectingProvider(null);
                        setCredentials({});
                      }}
                      className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800"
                    >
                      {t('integrations.cancel', 'Cancel')}
                    </button>
                  </div>
                </div>
              )}

              {/* Sync logs */}
              {logsId === connected?.id && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    {t('integrations.syncHistory', 'Sync History')}
                  </h4>
                  {syncLogs.length === 0 ? (
                    <p className="text-xs text-gray-500">{t('integrations.noLogs', 'No sync activity yet')}</p>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {syncLogs.map((log) => (
                        <div
                          key={log.id}
                          className="flex items-center justify-between text-xs py-1.5 px-2 bg-gray-100 dark:bg-gray-700 rounded"
                        >
                          <div className="flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${log.status === 'success' ? 'bg-green-500' : log.status === 'failed' ? 'bg-red-500' : 'bg-yellow-500'}`} />
                            <span className="text-gray-700 dark:text-gray-300">
                              {log.direction} {log.entityType}
                            </span>
                            {log.error && (
                              <span className="text-red-500 truncate max-w-[200px]" title={log.error}>
                                {log.error}
                              </span>
                            )}
                          </div>
                          <span className="text-gray-500">
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
  );
}
