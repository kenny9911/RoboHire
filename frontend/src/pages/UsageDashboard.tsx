import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';
import SEO from '../components/SEO';

interface DailyData {
  date: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
}

interface EndpointData {
  endpoint: string;
  calls: number;
  totalTokens: number;
  cost?: number;
}

interface KeyUsage {
  apiKeyId: string | null;
  keyName: string;
  keyPrefix: string | null;
  isActive: boolean | null;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
}

interface UsageSummary {
  totals: {
    calls: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost?: number;
  };
  daily: DailyData[];
  byEndpoint: EndpointData[];
}

interface CallHistoryRecord {
  id: string;
  requestId: string | null;
  endpoint: string;
  method: string;
  apiName: string;
  statusCode: number;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
  model: string | null;
  createdAt: string;
}

type TimeRange = '7d' | '30d' | '90d' | 'all';

function rangeToDate(range: TimeRange): string | undefined {
  if (range === 'all') return undefined;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

const RANGE_LABELS: Record<TimeRange, string> = {
  '7d': '7 Days',
  '30d': '30 Days',
  '90d': '90 Days',
  all: 'All Time',
};

export default function UsageDashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const showCost = user?.role === 'admin';
  const [range, setRange] = useState<TimeRange>('30d');
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [byKey, setByKey] = useState<KeyUsage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [callHistory, setCallHistory] = useState<CallHistoryRecord[]>([]);
  const [callHistoryPage, setCallHistoryPage] = useState(1);
  const [callHistoryTotal, setCallHistoryTotal] = useState(0);
  const [callHistoryLoading, setCallHistoryLoading] = useState(false);
  const callHistoryLimit = 10;

  const rangeLabels: Record<TimeRange, string> = {
    '7d': t('usage.range.7d', RANGE_LABELS['7d']),
    '30d': t('usage.range.30d', RANGE_LABELS['30d']),
    '90d': t('usage.range.90d', RANGE_LABELS['90d']),
    all: t('usage.range.all', RANGE_LABELS.all),
  };

  const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('auth_token');
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  const fetchCallHistory = async (page: number, fromDate?: string) => {
    setCallHistoryLoading(true);
    const headers = getAuthHeaders();
    const params = new URLSearchParams({ page: String(page), limit: String(callHistoryLimit) });
    if (fromDate) params.set('from', fromDate);
    try {
      const res = await fetch(`${API_BASE}/api/v1/usage/calls?${params}`, { headers, credentials: 'include' });
      if (!res.ok) {
        throw new Error(`Failed to fetch call history (${res.status})`);
      }
      const json = await res.json();
      if (!json.success) {
        throw new Error(json.error || 'Failed to fetch call history');
      }
      setCallHistory(json.data || []);
      setCallHistoryTotal(json.pagination?.totalPages || 0);
    } catch (err) {
      setCallHistory([]);
      setCallHistoryTotal(0);
      setError(err instanceof Error ? err.message : 'Failed to load call history');
    } finally {
      setCallHistoryLoading(false);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      setSummary(null);
      setByKey([]);
      const headers = getAuthHeaders();
      const from = rangeToDate(range);
      const qs = from ? `?from=${from}` : '';

      try {
        const [sumRes, keyRes] = await Promise.all([
          fetch(`${API_BASE}/api/v1/usage/summary${qs}`, { headers, credentials: 'include' }),
          fetch(`${API_BASE}/api/v1/usage/by-key${qs}`, { headers, credentials: 'include' }),
        ]);
        if (!sumRes.ok) {
          throw new Error(`Failed to fetch usage summary (${sumRes.status})`);
        }
        if (!keyRes.ok) {
          throw new Error(`Failed to fetch usage by key (${keyRes.status})`);
        }
        const sumJson = await sumRes.json();
        const keyJson = await keyRes.json();
        if (!sumJson.success) {
          throw new Error(sumJson.error || 'Failed to fetch usage summary');
        }
        if (!keyJson.success) {
          throw new Error(keyJson.error || 'Failed to fetch usage by key');
        }
        setSummary(sumJson.data);
        setByKey(keyJson.data || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load usage data');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
    setCallHistoryPage(1);
    fetchCallHistory(1, rangeToDate(range));
  }, [range]);

  useEffect(() => {
    if (callHistoryPage > 1) {
      fetchCallHistory(callHistoryPage, rangeToDate(range));
    }
  }, [callHistoryPage]);

  const formatCost = (v: number) => `$${v.toFixed(4)}`;
  const formatTokens = (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(1)}K` : String(v);

  return (
    <div className="max-w-7xl mx-auto">
        <SEO title="Usage" noIndex />
        {/* Title + Range selector */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-4 sm:mb-0">{t('usage.title', 'API Usage')}</h1>
          <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-1">
            {(['7d', '30d', '90d', 'all'] as TimeRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                  range === r ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {rangeLabels[r]}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : !summary ? (
          <div className="text-center py-24 text-gray-500">{t('usage.empty', 'No usage data yet. Make API calls to see data here.')}</div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <SummaryCard label={t('usage.apiCalls', 'API Calls')} value={String(summary.totals.calls)} />
              <SummaryCard label={t('usage.inputTokens', 'Input Tokens')} value={formatTokens(summary.totals.promptTokens)} />
              <SummaryCard label={t('usage.outputTokens', 'Output Tokens')} value={formatTokens(summary.totals.completionTokens)} />
              {showCost && (
                <SummaryCard label={t('usage.totalCost', 'Total Cost')} value={formatCost(summary.totals.cost ?? 0)} />
              )}
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* API Calls over time */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">{t('usage.chart.callsOverTime', 'API Calls Over Time')}</h2>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={summary.daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey="calls" stroke="#6366f1" fill="#e0e7ff" name={t('usage.chart.calls', 'Calls')} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Token usage */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">{t('usage.chart.tokenUsage', 'Token Usage (Input vs Output)')}</h2>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={summary.daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={formatTokens} />
                    <Tooltip formatter={(v) => formatTokens(Number(v))} />
                    <Legend />
                    <Bar dataKey="promptTokens" stackId="tokens" fill="#818cf8" name={t('usage.chart.input', 'Input')} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="completionTokens" stackId="tokens" fill="#c4b5fd" name={t('usage.chart.output', 'Output')} radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Per-endpoint breakdown */}
            {summary.byEndpoint.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">{t('usage.table.byEndpoint', 'Usage by Endpoint')}</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-100">
                        <th className="pb-2 font-medium">{t('usage.table.endpoint', 'Endpoint')}</th>
                        <th className="pb-2 font-medium text-right">{t('usage.table.calls', 'Calls')}</th>
                        <th className="pb-2 font-medium text-right">{t('usage.table.tokens', 'Tokens')}</th>
                        {showCost && <th className="pb-2 font-medium text-right">{t('usage.table.cost', 'Cost')}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {summary.byEndpoint.map((ep) => (
                        <tr key={ep.endpoint} className="border-b border-gray-50">
                          <td className="py-2 font-mono text-xs text-gray-700">{ep.endpoint}</td>
                          <td className="py-2 text-right text-gray-600">{ep.calls}</td>
                          <td className="py-2 text-right text-gray-600">{formatTokens(ep.totalTokens)}</td>
                          {showCost && <td className="py-2 text-right text-gray-600">{formatCost(ep.cost ?? 0)}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Per-key breakdown */}
            {byKey.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">{t('usage.table.byKey', 'Usage by API Key')}</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-100">
                        <th className="pb-2 font-medium">{t('usage.table.key', 'Key')}</th>
                        <th className="pb-2 font-medium text-right">{t('usage.table.calls', 'Calls')}</th>
                        <th className="pb-2 font-medium text-right">{t('usage.inputTokens', 'Input Tokens')}</th>
                        <th className="pb-2 font-medium text-right">{t('usage.outputTokens', 'Output Tokens')}</th>
                        {showCost && <th className="pb-2 font-medium text-right">{t('usage.table.cost', 'Cost')}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {byKey.map((k) => (
                        <tr key={k.apiKeyId ?? 'session'} className="border-b border-gray-50">
                          <td className="py-2">
                            <span className="font-medium text-gray-800">{k.keyName}</span>
                            {k.keyPrefix && (
                              <span className="ml-2 text-xs text-gray-400 font-mono">{k.keyPrefix}...</span>
                            )}
                            {k.isActive === false && (
                              <span className="ml-2 text-xs text-red-500">{t('usage.inactive', 'Inactive')}</span>
                            )}
                          </td>
                          <td className="py-2 text-right text-gray-600">{k.calls}</td>
                          <td className="py-2 text-right text-gray-600">{formatTokens(k.promptTokens)}</td>
                          <td className="py-2 text-right text-gray-600">{formatTokens(k.completionTokens)}</td>
                          {showCost && <td className="py-2 text-right text-gray-600">{formatCost(k.cost ?? 0)}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Call History */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="text-sm font-semibold text-gray-700 mb-4">{t('usage.callHistory.title', 'API Call History')}</h2>
              {callHistoryLoading ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-indigo-600" />
                </div>
              ) : callHistory.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-8">
                  {t('usage.callHistory.empty', 'No API calls recorded yet.')}
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b border-gray-100">
                          <th className="pb-2 font-medium">{t('usage.callHistory.time', 'Time')}</th>
                          <th className="pb-2 font-medium">{t('usage.callHistory.endpoint', 'Endpoint')}</th>
                          <th className="pb-2 font-medium text-center">{t('usage.callHistory.status', 'Status')}</th>
                          <th className="pb-2 font-medium text-right">{t('usage.callHistory.duration', 'Duration')}</th>
                          <th className="pb-2 font-medium text-right">{t('usage.callHistory.tokens', 'Tokens')}</th>
                          {showCost && <th className="pb-2 font-medium text-right">{t('usage.callHistory.cost', 'Cost')}</th>}
                          <th className="pb-2 font-medium text-right"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {callHistory.map((call) => {
                          const statusColor = call.statusCode < 400
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-red-100 text-red-700';
                          return (
                            <tr key={call.id} className="border-b border-gray-50 hover:bg-gray-50">
                              <td className="py-2 text-xs text-gray-600 whitespace-nowrap">
                                {new Date(call.createdAt).toLocaleString()}
                              </td>
                              <td className="py-2 font-mono text-xs text-gray-700">
                                {call.endpoint.replace('/api/v1/', '')}
                              </td>
                              <td className="py-2 text-center">
                                <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${statusColor}`}>
                                  {call.statusCode}
                                </span>
                              </td>
                              <td className="py-2 text-right text-gray-600 text-xs">
                                {(call.durationMs / 1000).toFixed(2)}s
                              </td>
                              <td className="py-2 text-right text-gray-600 text-xs">
                                {formatTokens(call.totalTokens)}
                              </td>
                              {showCost && (
                                <td className="py-2 text-right text-gray-600 text-xs">
                                  {formatCost(call.cost ?? 0)}
                                </td>
                              )}
                              <td className="py-2 text-right">
                                <button
                                  onClick={() => navigate(`/dashboard/usage/calls/${call.id}`)}
                                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                                >
                                  {t('usage.callHistory.view', 'View')}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {callHistoryTotal > 1 && (
                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-100">
                      <button
                        onClick={() => setCallHistoryPage((p) => Math.max(1, p - 1))}
                        disabled={callHistoryPage <= 1}
                        className="text-sm text-gray-600 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {t('usage.callHistory.prev', 'Previous')}
                      </button>
                      <span className="text-xs text-gray-500">
                        {t('usage.callHistory.pageInfo', 'Page {{page}} of {{total}}', {
                          page: callHistoryPage,
                          total: callHistoryTotal,
                        })}
                      </span>
                      <button
                        onClick={() => setCallHistoryPage((p) => Math.min(callHistoryTotal, p + 1))}
                        disabled={callHistoryPage >= callHistoryTotal}
                        className="text-sm text-gray-600 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {t('usage.callHistory.next', 'Next')}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );
}
