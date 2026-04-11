import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import axios from '../lib/axios';

interface SourceConfig {
  id: string;
  workspaceId: string | null;
  instantSearchEnabled: boolean;
  internalMinioEnabled: boolean;
  externalApiEnabled: boolean;
  minioBucket: string | null;
}

interface ExternalSource {
  id: string;
  name: string;
  provider: 'linkedin' | 'github' | 'seekout' | 'fetcher' | 'custom';
  enabled: boolean;
  baseUrl: string;
  authType: 'api_key' | 'oauth' | 'basic';
  config: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  hasCredentials: boolean;
}

interface TestResult {
  ok: boolean;
  error?: string;
  sample?: unknown[];
}

const PROVIDERS = ['custom', 'linkedin', 'github', 'seekout', 'fetcher'] as const;
const AUTH_TYPES = ['api_key', 'oauth', 'basic'] as const;

export default function AdminAgentSourcesTab() {
  const { t } = useTranslation();
  const [config, setConfig] = useState<SourceConfig | null>(null);
  const [externals, setExternals] = useState<ExternalSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ExternalSource | null>(null);
  const [testResult, setTestResult] = useState<Record<string, TestResult>>({});

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [cfgRes, extRes] = await Promise.all([
        axios.get('/api/v1/admin/agent-sources/config'),
        axios.get('/api/v1/admin/agent-sources/external'),
      ]);
      setConfig(cfgRes.data.data);
      setExternals(extRes.data.data || []);
    } catch (err) {
      console.error('Failed to load agent sources admin:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const toggleSourceConfig = async (field: keyof SourceConfig, value: boolean) => {
    if (!config) return;
    setSaving(true);
    try {
      const res = await axios.patch('/api/v1/admin/agent-sources/config', { [field]: value });
      setConfig(res.data.data);
    } catch (err) {
      console.error('Failed to toggle source config:', err);
    } finally {
      setSaving(false);
    }
  };

  const deleteExternal = async (id: string) => {
    if (!window.confirm(t('admin.agentSources.confirmDelete', 'Delete this external source?'))) return;
    try {
      await axios.delete(`/api/v1/admin/agent-sources/external/${id}`);
      setExternals((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      console.error('Failed to delete external source:', err);
    }
  };

  const testExternal = async (id: string) => {
    setTestResult((prev) => ({ ...prev, [id]: { ok: false, error: 'Testing…' } }));
    try {
      const res = await axios.post(`/api/v1/admin/agent-sources/external/${id}/test`);
      setTestResult((prev) => ({ ...prev, [id]: res.data.data }));
    } catch (err) {
      setTestResult((prev) => ({
        ...prev,
        [id]: { ok: false, error: err instanceof Error ? err.message : String(err) },
      }));
    }
  };

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">{t('common.loading', 'Loading…')}</div>;
  }

  return (
    <div className="space-y-8 p-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">
          {t('admin.agentSources.title', 'Agent Sources')}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {t(
            'admin.agentSources.subtitle',
            'Configure where the hireable agents look for candidates. Toggle global sources and manage third-party sourcing vendors.',
          )}
        </p>
      </div>

      {/* Global source toggles */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h3 className="mb-1 text-base font-semibold text-slate-900">
          {t('admin.agentSources.globalToggles', 'Global source toggles')}
        </h3>
        <p className="mb-5 text-xs text-slate-500">
          {t(
            'admin.agentSources.globalTogglesDesc',
            'Disabled sources are hidden from the agent creation modal across every user in this workspace.',
          )}
        </p>
        <div className="space-y-3">
          <ToggleRow
            label={t('agents.workbench.source.instant_search.name', 'Instant Search')}
            desc={t(
              'agents.workbench.source.instant_search.desc',
              "Search each recruiter's private resume pool.",
            )}
            enabled={config?.instantSearchEnabled ?? false}
            disabled={saving}
            onChange={(v) => toggleSourceConfig('instantSearchEnabled', v)}
          />
          <ToggleRow
            label={t('agents.workbench.source.internal_minio.name', 'Internal Repository')}
            desc={t(
              'agents.workbench.source.internal_minio.desc',
              'Shared company-wide archive backed by MinIO/S3.',
            )}
            enabled={config?.internalMinioEnabled ?? false}
            disabled={saving}
            onChange={(v) => toggleSourceConfig('internalMinioEnabled', v)}
          />
          <ToggleRow
            label={t('agents.workbench.source.external_api.name', 'External Sources')}
            desc={t(
              'admin.agentSources.externalApiDesc',
              'Third-party sourcing vendors configured below.',
            )}
            enabled={config?.externalApiEnabled ?? false}
            disabled={saving}
            onChange={(v) => toggleSourceConfig('externalApiEnabled', v)}
          />
        </div>
      </section>

      {/* External source CRUD */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-5 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {t('admin.agentSources.externalSources', 'External sources')}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              {t(
                'admin.agentSources.externalSourcesDesc',
                'Third-party sourcing vendors agents can query at runtime. Credentials are encrypted at rest.',
              )}
            </p>
          </div>
          <button
            onClick={() => {
              setEditing(null);
              setShowForm(true);
            }}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700"
          >
            + {t('admin.agentSources.addSource', 'Add source')}
          </button>
        </div>

        {externals.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 py-8 text-center text-sm text-slate-500">
            {t('admin.agentSources.noSources', 'No external sources configured yet.')}
          </div>
        ) : (
          <div className="divide-y divide-slate-200 rounded-xl border border-slate-200">
            {externals.map((ext) => (
              <div key={ext.id} className="flex items-start gap-4 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${ext.enabled ? 'bg-green-500' : 'bg-slate-300'}`}
                    />
                    <p className="text-sm font-semibold text-slate-900">{ext.name}</p>
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                      {ext.provider}
                    </span>
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                      {ext.authType}
                    </span>
                  </div>
                  <p className="mt-1 truncate font-mono text-[11px] text-slate-500">{ext.baseUrl}</p>
                  {testResult[ext.id] && (
                    <p
                      className={`mt-2 rounded px-2 py-1 text-[11px] ${
                        testResult[ext.id].ok
                          ? 'bg-green-50 text-green-700'
                          : 'bg-red-50 text-red-700'
                      }`}
                    >
                      {testResult[ext.id].ok
                        ? t('admin.agentSources.testOk', 'Test OK — returned {{count}} candidate(s)', {
                            count: testResult[ext.id].sample?.length ?? 0,
                          })
                        : testResult[ext.id].error}
                    </p>
                  )}
                </div>
                <div className="flex flex-none items-center gap-1.5">
                  <button
                    onClick={() => testExternal(ext.id)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t('admin.agentSources.test', 'Test')}
                  </button>
                  <button
                    onClick={() => {
                      setEditing(ext);
                      setShowForm(true);
                    }}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {t('common.edit', 'Edit')}
                  </button>
                  <button
                    onClick={() => deleteExternal(ext.id)}
                    className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    {t('common.delete', 'Delete')}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {showForm && (
        <ExternalSourceForm
          initial={editing}
          onClose={() => {
            setShowForm(false);
            setEditing(null);
          }}
          onSaved={() => {
            setShowForm(false);
            setEditing(null);
            loadAll();
          }}
        />
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ToggleRow({
  label,
  desc,
  enabled,
  disabled,
  onChange,
}: {
  label: string;
  desc: string;
  enabled: boolean;
  disabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 rounded-xl border border-slate-200 p-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-slate-900">{label}</p>
        <p className="mt-0.5 text-xs text-slate-500">{desc}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!enabled)}
        className={`relative h-6 w-11 flex-none rounded-full transition-colors ${
          enabled ? 'bg-violet-600' : 'bg-slate-300'
        } disabled:opacity-50`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

function ExternalSourceForm({
  initial,
  onClose,
  onSaved,
}: {
  initial: ExternalSource | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? '');
  const [provider, setProvider] = useState<ExternalSource['provider']>(initial?.provider ?? 'custom');
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '');
  const [authType, setAuthType] = useState<ExternalSource['authType']>(initial?.authType ?? 'api_key');
  const [credentialsJson, setCredentialsJson] = useState('{\n  "apiKey": ""\n}');
  const [enabled, setEnabled] = useState(initial?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    setError(null);
    let credentials: Record<string, unknown> | undefined;
    try {
      credentials = JSON.parse(credentialsJson);
      if (!credentials || typeof credentials !== 'object') throw new Error('Not an object');
    } catch {
      setError(t('admin.agentSources.invalidJson', 'Credentials must be a valid JSON object'));
      return;
    }

    setSaving(true);
    try {
      if (initial) {
        // PATCH — only send credentials if user actually edited them away from default
        const body: Record<string, unknown> = { name, baseUrl, authType, enabled };
        // We don't know if credentials were edited; always send them
        body.credentials = credentials;
        await axios.patch(`/api/v1/admin/agent-sources/external/${initial.id}`, body);
      } else {
        await axios.post('/api/v1/admin/agent-sources/external', {
          name,
          provider,
          baseUrl,
          authType,
          credentials,
          enabled,
        });
      }
      onSaved();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(msg || t('admin.agentSources.saveFailed', 'Failed to save external source'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 py-10" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-1 text-lg font-semibold text-slate-900">
          {initial
            ? t('admin.agentSources.editSource', 'Edit external source')
            : t('admin.agentSources.addSource', 'Add external source')}
        </h3>
        <p className="mb-5 text-xs text-slate-500">
          {t(
            'admin.agentSources.formDesc',
            'Credentials are encrypted at rest and never returned over the API.',
          )}
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('admin.agentSources.name', 'Name')}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="LinkedIn Recruiter"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </div>

          {!initial && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                {t('admin.agentSources.provider', 'Provider')}
              </label>
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value as ExternalSource['provider'])}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
              >
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('admin.agentSources.baseUrl', 'Base URL')}
            </label>
            <input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.vendor.com/v1"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('admin.agentSources.authType', 'Auth type')}
            </label>
            <select
              value={authType}
              onChange={(e) => setAuthType(e.target.value as ExternalSource['authType'])}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            >
              {AUTH_TYPES.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {t('admin.agentSources.credentials', 'Credentials (JSON)')}
            </label>
            <textarea
              value={credentialsJson}
              onChange={(e) => setCredentialsJson(e.target.value)}
              rows={6}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-xs focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              {t(
                'admin.agentSources.credentialsHint',
                'For api_key: {"apiKey": "…", "apiKeyHeader": "X-API-Key"}. For basic: {"username": "…", "password": "…"}. For oauth: {"accessToken": "…"}.',
              )}
            </p>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            {t('admin.agentSources.enabled', 'Enabled')}
          </label>

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !name.trim() || !baseUrl.trim()}
            className="rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {saving ? t('common.saving', 'Saving…') : t('common.save', 'Save')}
          </button>
        </div>
      </div>
    </div>
  );
}
