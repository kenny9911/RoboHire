import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { API_BASE } from '../config';
import DashboardHeader from '../components/dashboard/DashboardHeader';

interface DailyData {
  date: string;
  calls: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost: number;
}

interface EndpointData {
  endpoint: string;
  calls: number;
  totalTokens: number;
  cost: number;
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
  cost: number;
}

interface UsageSummary {
  totals: {
    calls: number;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    cost: number;
  };
  daily: DailyData[];
  byEndpoint: EndpointData[];
}

type TimeRange = '7d' | '30d' | '90d' | 'all';

function rangeToDate(range: TimeRange): string | undefined {
  if (range === 'all') return undefined;
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

export default function UsageDashboard() {
  useTranslation();
  const [range, setRange] = useState<TimeRange>('30d');
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [byKey, setByKey] = useState<KeyUsage[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      const token = localStorage.getItem('auth_token');
      const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const from = rangeToDate(range);
      const qs = from ? `?from=${from}` : '';

      try {
        const [sumRes, keyRes] = await Promise.all([
          fetch(`${API_BASE}/api/v1/usage/summary${qs}`, { headers, credentials: 'include' }),
          fetch(`${API_BASE}/api/v1/usage/by-key${qs}`, { headers, credentials: 'include' }),
        ]);
        const sumJson = await sumRes.json();
        const keyJson = await keyRes.json();
        if (sumJson.success) setSummary(sumJson.data);
        if (keyJson.success) setByKey(keyJson.data);
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [range]);

  const formatCost = (v: number) => `$${v.toFixed(4)}`;
  const formatTokens = (v: number) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : v >= 1_000 ? `${(v / 1_000).toFixed(1)}K` : String(v);

  return (
    <div className="min-h-screen bg-gray-50">
      <DashboardHeader />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Title + Range selector */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8">
          <h1 className="text-2xl font-bold text-gray-900 mb-4 sm:mb-0">API Usage</h1>
          <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-1">
            {(['7d', '30d', '90d', 'all'] as TimeRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
                  range === r ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                }`}
              >
                {r === 'all' ? 'All Time' : r === '7d' ? '7 Days' : r === '30d' ? '30 Days' : '90 Days'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
          </div>
        ) : !summary ? (
          <div className="text-center py-24 text-gray-500">No usage data yet. Make API calls to see data here.</div>
        ) : (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              <SummaryCard label="API Calls" value={String(summary.totals.calls)} />
              <SummaryCard label="Input Tokens" value={formatTokens(summary.totals.promptTokens)} />
              <SummaryCard label="Output Tokens" value={formatTokens(summary.totals.completionTokens)} />
              <SummaryCard label="Total Cost" value={formatCost(summary.totals.cost)} />
            </div>

            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
              {/* API Calls over time */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">API Calls Over Time</h2>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={summary.daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                    <Tooltip />
                    <Area type="monotone" dataKey="calls" stroke="#6366f1" fill="#e0e7ff" name="Calls" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Token usage */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Token Usage (Input vs Output)</h2>
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={summary.daily}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fontSize: 11 }} tickFormatter={formatTokens} />
                    <Tooltip formatter={(v) => formatTokens(Number(v))} />
                    <Legend />
                    <Bar dataKey="promptTokens" stackId="tokens" fill="#818cf8" name="Input" radius={[0, 0, 0, 0]} />
                    <Bar dataKey="completionTokens" stackId="tokens" fill="#c4b5fd" name="Output" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Per-endpoint breakdown */}
            {summary.byEndpoint.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6 mb-8">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Usage by Endpoint</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-100">
                        <th className="pb-2 font-medium">Endpoint</th>
                        <th className="pb-2 font-medium text-right">Calls</th>
                        <th className="pb-2 font-medium text-right">Tokens</th>
                        <th className="pb-2 font-medium text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.byEndpoint.map((ep) => (
                        <tr key={ep.endpoint} className="border-b border-gray-50">
                          <td className="py-2 font-mono text-xs text-gray-700">{ep.endpoint}</td>
                          <td className="py-2 text-right text-gray-600">{ep.calls}</td>
                          <td className="py-2 text-right text-gray-600">{formatTokens(ep.totalTokens)}</td>
                          <td className="py-2 text-right text-gray-600">{formatCost(ep.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Per-key breakdown */}
            {byKey.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h2 className="text-sm font-semibold text-gray-700 mb-4">Usage by API Key</h2>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-gray-100">
                        <th className="pb-2 font-medium">Key</th>
                        <th className="pb-2 font-medium text-right">Calls</th>
                        <th className="pb-2 font-medium text-right">Input Tokens</th>
                        <th className="pb-2 font-medium text-right">Output Tokens</th>
                        <th className="pb-2 font-medium text-right">Cost</th>
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
                              <span className="ml-2 text-xs text-red-500">Inactive</span>
                            )}
                          </td>
                          <td className="py-2 text-right text-gray-600">{k.calls}</td>
                          <td className="py-2 text-right text-gray-600">{formatTokens(k.promptTokens)}</td>
                          <td className="py-2 text-right text-gray-600">{formatTokens(k.completionTokens)}</td>
                          <td className="py-2 text-right text-gray-600">{formatCost(k.cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
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
