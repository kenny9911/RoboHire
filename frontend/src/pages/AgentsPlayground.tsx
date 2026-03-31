import { useState } from 'react';
import axios from '../lib/axios';
import JsonViewer from '../components/JsonViewer';
import ApiInfoPanel from '../components/ApiInfoPanel';
import { useTranslation } from 'react-i18next';
import SEO from '../components/SEO';

type Operation = 'list' | 'get' | 'create' | 'update' | 'delete';

export default function AgentsPlayground() {
  const { t } = useTranslation();
  const [operation, setOperation] = useState<Operation>('list');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [responseStatus, setResponseStatus] = useState<number | undefined>();
  const [responseTime, setResponseTime] = useState<number | undefined>();

  // List filters
  const [listStatus, setListStatus] = useState('');
  const [listTaskType, setListTaskType] = useState('');
  const [listCreatedAfter, setListCreatedAfter] = useState('');
  const [listCreatedBefore, setListCreatedBefore] = useState('');
  const [listLimit, setListLimit] = useState('20');

  // Get / Update / Delete
  const [agentId, setAgentId] = useState('');

  // Create / Update fields
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [taskType, setTaskType] = useState('search');
  const [jobId, setJobId] = useState('');
  const [instructions, setInstructions] = useState('');
  const [updateStatus, setUpdateStatus] = useState('');

  const reset = () => {
    setResult(null);
    setError(null);
    setResponseStatus(undefined);
    setResponseTime(undefined);
  };

  const execute = async () => {
    reset();
    setLoading(true);
    const start = Date.now();

    try {
      let res;

      switch (operation) {
        case 'list': {
          const params: Record<string, string> = {};
          if (listStatus) params.status = listStatus;
          if (listTaskType) params.taskType = listTaskType;
          if (listCreatedAfter) params.createdAfter = listCreatedAfter;
          if (listCreatedBefore) params.createdBefore = listCreatedBefore;
          if (listLimit) params.limit = listLimit;
          res = await axios.get('/api/v1/agents', { params });
          break;
        }
        case 'get':
          if (!agentId.trim()) { setError('Agent ID is required'); setLoading(false); return; }
          res = await axios.get(`/api/v1/agents/${agentId.trim()}`);
          break;
        case 'create':
          if (!name.trim() || !description.trim()) { setError('Name and description are required'); setLoading(false); return; }
          res = await axios.post('/api/v1/agents', {
            name: name.trim(),
            description: description.trim(),
            taskType,
            ...(jobId.trim() ? { jobId: jobId.trim() } : {}),
            ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
          });
          break;
        case 'update':
          if (!agentId.trim()) { setError('Agent ID is required'); setLoading(false); return; }
          res = await axios.patch(`/api/v1/agents/${agentId.trim()}`, {
            ...(name.trim() ? { name: name.trim() } : {}),
            ...(description.trim() ? { description: description.trim() } : {}),
            ...(updateStatus ? { status: updateStatus } : {}),
            ...(jobId.trim() ? { jobId: jobId.trim() } : {}),
          });
          break;
        case 'delete':
          if (!agentId.trim()) { setError('Agent ID is required'); setLoading(false); return; }
          res = await axios.delete(`/api/v1/agents/${agentId.trim()}`);
          break;
      }

      setResponseTime(Date.now() - start);
      setResponseStatus(res.status);
      setResult(res.data);
    } catch (err: any) {
      setResponseTime(Date.now() - start);
      setResponseStatus(err.response?.status);
      setError(err.response?.data?.error || err.message || 'Request failed');
      setResult(err.response?.data || null);
    } finally {
      setLoading(false);
    }
  };

  const ops: { key: Operation; method: string; color: string; label: string }[] = [
    { key: 'list', method: 'GET', color: 'bg-emerald-100 text-emerald-700', label: t('playground.agents.list', 'List Agents') },
    { key: 'get', method: 'GET', color: 'bg-emerald-100 text-emerald-700', label: t('playground.agents.get', 'Get Agent') },
    { key: 'create', method: 'POST', color: 'bg-blue-100 text-blue-700', label: t('playground.agents.create', 'Create Agent') },
    { key: 'update', method: 'PATCH', color: 'bg-amber-100 text-amber-700', label: t('playground.agents.update', 'Update Agent') },
    { key: 'delete', method: 'DELETE', color: 'bg-red-100 text-red-700', label: t('playground.agents.delete', 'Delete Agent') },
  ];

  return (
    <div className="space-y-6">
      <SEO title="Agents API Playground" url="https://robohire.io/api-playground/agents" />

      <div>
        <h1 className="text-xl font-bold text-slate-900 mb-1">{t('playground.agents.title', 'Agents API')}</h1>
        <p className="text-sm text-slate-500">{t('playground.agents.desc', 'Create, list, update, and delete recruitment agents.')}</p>
      </div>

      <ApiInfoPanel
        method={(ops.find(o => o.key === operation)?.method || 'GET') as 'GET' | 'POST' | 'PUT' | 'DELETE'}
        endpoint={operation === 'list' ? '/api/v1/agents' : `/api/v1/agents/${agentId || ':id'}`}
        responseStatus={responseStatus}
        responseTime={responseTime}
      />

      {/* Operation selector */}
      <div className="flex flex-wrap gap-2">
        {ops.map(op => (
          <button
            key={op.key}
            onClick={() => { setOperation(op.key); reset(); }}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium border transition-all ${
              operation === op.key
                ? 'border-blue-300 bg-blue-50 text-blue-700 shadow-sm'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${op.color}`}>{op.method}</span>
            {op.label}
          </button>
        ))}
      </div>

      {/* Dynamic form */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        {/* List filters */}
        {operation === 'list' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Status</label>
                <select value={listStatus} onChange={e => setListStatus(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option value="">All</option>
                  {['active', 'paused', 'configuring', 'completed', 'failed', 'closed', 'out_of_leads'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Task Type</label>
                <select value={listTaskType} onChange={e => setListTaskType(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option value="">All</option>
                  <option value="search">search</option>
                  <option value="match">match</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Created After (ISO)</label>
                <input type="datetime-local" value={listCreatedAfter} onChange={e => setListCreatedAfter(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Created Before (ISO)</label>
                <input type="datetime-local" value={listCreatedBefore} onChange={e => setListCreatedBefore(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Limit</label>
              <input type="number" value={listLimit} onChange={e => setListLimit(e.target.value)} min="1" max="100" className="w-32 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
          </>
        )}

        {/* Get / Update / Delete — need agent ID */}
        {(operation === 'get' || operation === 'update' || operation === 'delete') && (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Agent ID *</label>
            <input type="text" value={agentId} onChange={e => setAgentId(e.target.value)} placeholder="clu1a2b3c4d5e6f7g" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" />
          </div>
        )}

        {/* Create fields */}
        {operation === 'create' && (
          <>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Name *</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Backend Engineer Search" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Description *</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="Search criteria: Go/Rust engineers in Shanghai with 3+ years" rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Task Type</label>
                <select value={taskType} onChange={e => setTaskType(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option value="search">search</option>
                  <option value="match">match</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Job ID (optional)</label>
                <input type="text" value={jobId} onChange={e => setJobId(e.target.value)} placeholder="job_xyz789" className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Instructions (optional)</label>
              <textarea value={instructions} onChange={e => setInstructions(e.target.value)} placeholder="Focus on candidates in Shanghai and Shenzhen" rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
          </>
        )}

        {/* Update fields */}
        {operation === 'update' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Name (optional)</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">Status (optional)</label>
                <select value={updateStatus} onChange={e => setUpdateStatus(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm">
                  <option value="">— no change —</option>
                  {['active', 'paused', 'closed'].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Description (optional)</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" />
            </div>
          </>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        <button
          onClick={execute}
          disabled={loading}
          className="w-full rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:from-blue-700 hover:to-indigo-700 disabled:opacity-50"
        >
          {loading ? t('playground.agents.running', 'Executing...') : t('playground.agents.run', 'Execute Request')}
        </button>
      </div>

      {/* Response */}
      {result && (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">{t('playground.agents.response', 'Response')}</span>
            {responseStatus && (
              <span className={`px-2 py-0.5 rounded text-xs font-bold ${responseStatus < 300 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                {responseStatus}
              </span>
            )}
          </div>
          <div className="p-4 max-h-[500px] overflow-auto">
            <JsonViewer data={result} />
          </div>
        </div>
      )}
    </div>
  );
}
