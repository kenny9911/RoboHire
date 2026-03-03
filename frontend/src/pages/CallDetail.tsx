import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from '../lib/axios';
import { useAuth } from '../context/AuthContext';

interface LLMCall {
  id: string;
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  cost?: number;
  durationMs: number;
}

interface CallRecord {
  id: string;
  requestId: string | null;
  endpoint: string;
  method: string;
  module: string;
  apiName: string;
  statusCode: number;
  durationMs: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  llmCalls: number;
  cost?: number;
  provider: string | null;
  model: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  requestPayload: Record<string, unknown> | null;
  responsePayload: Record<string, unknown> | null;
  createdAt: string;
  llmCallLog: LLMCall[];
  apiKey: { id: string; name: string; prefix: string } | null;
}

export default function CallDetail() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const showCost = user?.role === 'admin';
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [record, setRecord] = useState<CallRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    axios
      .get(`/api/v1/usage/calls/${id}`)
      .then((res) => {
        if (res.data.success) {
          setRecord(res.data.data);
        } else {
          setError(res.data.error || 'Unknown error');
        }
      })
      .catch((err) => {
        setError(err.response?.data?.error || err.message);
      })
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (error || !record) {
    return (
      <div className="max-w-4xl mx-auto">
        <button
          onClick={() => navigate('/dashboard/usage')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 mb-6"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t('usage.callHistory.back', 'Back to Usage')}
        </button>
        <div className="bg-red-50 text-red-700 rounded-xl p-6 text-center">
          {error || t('usage.callHistory.notFound', 'Call not found')}
        </div>
      </div>
    );
  }

  const statusColor = record.statusCode < 400 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700';
  const endpointLabel = record.endpoint.replace('/api/v1/', '');

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back button */}
      <button
        onClick={() => navigate('/dashboard/usage')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 mb-6"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        {t('usage.callHistory.back', 'Back to Usage')}
      </button>

      {/* Title */}
      <h2 className="text-xl font-bold text-gray-900 mb-6">
        {t('usage.callHistory.detailTitle', 'API Call Detail')}
      </h2>

      {/* Metadata card */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{t('usage.callHistory.endpoint', 'Endpoint')}</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{endpointLabel}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{t('usage.callHistory.time', 'Time')}</p>
            <p className="mt-1 text-sm font-medium text-gray-900">
              {new Date(record.createdAt).toLocaleString()}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{t('usage.callHistory.status', 'Status')}</p>
            <span className={`mt-1 inline-block text-xs font-medium px-2 py-0.5 rounded-full ${statusColor}`}>
              {record.statusCode}
            </span>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{t('usage.callHistory.duration', 'Duration')}</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{(record.durationMs / 1000).toFixed(2)}s</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{t('usage.callHistory.tokens', 'Tokens')}</p>
            <p className="mt-1 text-sm font-medium text-gray-900">
              {record.promptTokens.toLocaleString()} / {record.completionTokens.toLocaleString()}
            </p>
          </div>
          {showCost && (
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">{t('usage.callHistory.cost', 'Cost')}</p>
              <p className="mt-1 text-sm font-medium text-gray-900">${(record.cost ?? 0).toFixed(4)}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{t('usage.callHistory.model', 'Model')}</p>
            <p className="mt-1 text-sm font-medium text-gray-900">{record.model || '-'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-wide">{t('usage.callHistory.apiKey', 'API Key')}</p>
            <p className="mt-1 text-sm font-medium text-gray-900">
              {record.apiKey ? `${record.apiKey.name} (${record.apiKey.prefix}...)` : t('usage.callHistory.sessionAuth', 'Session')}
            </p>
          </div>
        </div>
      </div>

      {/* LLM Calls breakdown */}
      {record.llmCallLog.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            {t('usage.callHistory.llmCalls', 'LLM Calls')} ({record.llmCallLog.length})
          </h3>
          <div className="space-y-3">
            {record.llmCallLog.map((call, i) => (
              <div key={call.id} className="flex items-center gap-4 text-sm bg-gray-50 rounded-lg p-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
                  {i + 1}
                </span>
                <div className={`flex-1 grid grid-cols-2 ${showCost ? 'sm:grid-cols-4' : 'sm:grid-cols-3'} gap-2 text-xs`}>
                  <div>
                    <span className="text-gray-500">{t('usage.callHistory.model', 'Model')}:</span>{' '}
                    <span className="font-medium text-gray-900">{call.model}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">{t('usage.callHistory.tokens', 'Tokens')}:</span>{' '}
                    <span className="font-medium text-gray-900">{call.totalTokens.toLocaleString()}</span>
                  </div>
                  {showCost && (
                    <div>
                      <span className="text-gray-500">{t('usage.callHistory.cost', 'Cost')}:</span>{' '}
                      <span className="font-medium text-gray-900">${(call.cost ?? 0).toFixed(4)}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-gray-500">{t('usage.callHistory.duration', 'Duration')}:</span>{' '}
                    <span className="font-medium text-gray-900">{(call.durationMs / 1000).toFixed(2)}s</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Request Payload */}
      {record.requestPayload && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            {t('usage.callHistory.requestPayload', 'Input Parameters')}
          </h3>
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs overflow-x-auto max-h-[500px] overflow-y-auto">
            {JSON.stringify(record.requestPayload, null, 2)}
          </pre>
        </div>
      )}

      {/* Response Payload */}
      {record.responsePayload && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            {t('usage.callHistory.responsePayload', 'AI Output')}
          </h3>
          <pre className="bg-gray-900 text-gray-100 rounded-lg p-4 text-xs overflow-x-auto max-h-[500px] overflow-y-auto">
            {JSON.stringify(record.responsePayload, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
