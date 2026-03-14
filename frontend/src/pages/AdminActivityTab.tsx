import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { API_BASE } from '../config';

// --- Helpers ---
async function adminFetch(endpoint: string, options: RequestInit = {}) {
  const token = localStorage.getItem('auth_token');
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api/v1/admin${endpoint}`, {
    ...options,
    headers,
    credentials: 'include',
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

function formatTime(ts: string) {
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

// --- Types ---
interface SignupUser {
  id: string;
  email: string;
  name?: string | null;
  company?: string | null;
  provider?: string | null;
  createdAt: string;
}

interface LoginEvent {
  id: string;
  userId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  createdAt: string;
  user?: { id: string; email: string; name?: string | null } | null;
}

interface ActivityEvent {
  id: string;
  userId: string;
  sessionId: string;
  eventType: string;
  path: string;
  element?: string | null;
  elementTag?: string | null;
  timestamp: string;
  user?: { id: string; email: string; name?: string | null };
}

interface UserOption {
  id: string;
  email: string;
  name?: string | null;
}

interface SessionInfo {
  sessionId: string;
  _min: { timestamp: string };
  _max: { timestamp: string };
  _count: number;
}

type SubTab = 'signups' | 'logins' | 'feed' | 'journey';

// --- Sub-Tab Components ---

function SignupsTab() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<SignupUser[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const limit = 25;

  useEffect(() => {
    setLoading(true);
    adminFetch(`/activity/signups?limit=${limit}&offset=${offset}`)
      .then((r) => {
        setUsers(r.data.users);
        setTotal(r.data.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [offset]);

  return (
    <div>
      {loading && <p className="text-sm text-gray-400 mb-2">{t('admin.activity.loading', 'Loading...')}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 pr-4">{t('admin.activity.time', 'Time')}</th>
              <th className="py-2 pr-4">{t('admin.activity.email', 'Email')}</th>
              <th className="py-2 pr-4">{t('admin.activity.name', 'Name')}</th>
              <th className="py-2 pr-4">{t('admin.activity.company', 'Company')}</th>
              <th className="py-2">{t('admin.activity.provider', 'Provider')}</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{formatTime(u.createdAt)}</td>
                <td className="py-2 pr-4 font-medium">{u.email}</td>
                <td className="py-2 pr-4 text-gray-600">{u.name || '-'}</td>
                <td className="py-2 pr-4 text-gray-600">{u.company || '-'}</td>
                <td className="py-2 text-gray-500">{u.provider || 'email'}</td>
              </tr>
            ))}
            {users.length === 0 && !loading && (
              <tr><td colSpan={5} className="py-8 text-center text-gray-400">{t('admin.activity.noData', 'No data')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {total > limit && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-500">{t('admin.activity.showing', 'Showing')} {offset + 1}–{Math.min(offset + limit, total)} / {total}</span>
          <div className="flex gap-2">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} className="px-3 py-1 text-sm border rounded disabled:opacity-40">
              {t('admin.activity.prev', 'Prev')}
            </button>
            <button disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)} className="px-3 py-1 text-sm border rounded disabled:opacity-40">
              {t('admin.activity.next', 'Next')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function LoginsTab() {
  const { t } = useTranslation();
  const [logins, setLogins] = useState<LoginEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 25;

  useEffect(() => {
    setLoading(true);
    adminFetch(`/activity/logins?limit=${limit}&offset=${offset}`)
      .then((r) => setLogins(r.data.logins))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [offset]);

  return (
    <div>
      {loading && <p className="text-sm text-gray-400 mb-2">{t('admin.activity.loading', 'Loading...')}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 pr-4">{t('admin.activity.time', 'Time')}</th>
              <th className="py-2 pr-4">{t('admin.activity.email', 'Email')}</th>
              <th className="py-2 pr-4">{t('admin.activity.ip', 'IP Address')}</th>
              <th className="py-2">{t('admin.activity.userAgent', 'User Agent')}</th>
            </tr>
          </thead>
          <tbody>
            {logins.map((l) => (
              <tr key={l.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{formatTime(l.createdAt)}</td>
                <td className="py-2 pr-4 font-medium">{l.user?.email || l.userId || '-'}</td>
                <td className="py-2 pr-4 text-gray-600">{l.ipAddress || '-'}</td>
                <td className="py-2 text-gray-500 max-w-xs truncate">{l.userAgent || '-'}</td>
              </tr>
            ))}
            {logins.length === 0 && !loading && (
              <tr><td colSpan={4} className="py-8 text-center text-gray-400">{t('admin.activity.noData', 'No data')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2 mt-4">
        <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} className="px-3 py-1 text-sm border rounded disabled:opacity-40">
          {t('admin.activity.prev', 'Prev')}
        </button>
        <button disabled={logins.length < limit} onClick={() => setOffset(offset + limit)} className="px-3 py-1 text-sm border rounded disabled:opacity-40">
          {t('admin.activity.next', 'Next')}
        </button>
      </div>
    </div>
  );
}

function FeedTab() {
  const { t } = useTranslation();
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const limit = 50;

  useEffect(() => {
    adminFetch('/activity/users').then((r) => setUsers(r.data.users)).catch(console.error);
  }, []);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    if (selectedUser) params.set('userId', selectedUser);
    adminFetch(`/activity/feed?${params}`)
      .then((r) => {
        setActivities(r.data.activities);
        setTotal(r.data.total);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [selectedUser, offset]);

  return (
    <div>
      <div className="mb-4">
        <select
          value={selectedUser}
          onChange={(e) => { setSelectedUser(e.target.value); setOffset(0); }}
          className="border rounded px-3 py-1.5 text-sm"
        >
          <option value="">{t('admin.activity.allUsers', 'All Users')}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.email}{u.name ? ` (${u.name})` : ''}</option>
          ))}
        </select>
      </div>
      {loading && <p className="text-sm text-gray-400 mb-2">{t('admin.activity.loading', 'Loading...')}</p>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-gray-500">
              <th className="py-2 pr-4">{t('admin.activity.time', 'Time')}</th>
              <th className="py-2 pr-4">{t('admin.activity.email', 'Email')}</th>
              <th className="py-2 pr-4">{t('admin.activity.eventType', 'Type')}</th>
              <th className="py-2 pr-4">{t('admin.activity.path', 'Path')}</th>
              <th className="py-2">{t('admin.activity.element', 'Element')}</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((a) => (
              <tr key={a.id} className="border-b border-gray-100 hover:bg-gray-50">
                <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{formatTime(a.timestamp)}</td>
                <td className="py-2 pr-4 font-medium">{a.user?.email || a.userId}</td>
                <td className="py-2 pr-4">
                  <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                    a.eventType === 'page_view' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                  }`}>
                    {a.eventType === 'page_view' ? t('admin.activity.pageView', 'Page View') : t('admin.activity.click', 'Click')}
                  </span>
                </td>
                <td className="py-2 pr-4 text-gray-600 font-mono text-xs">{a.path}</td>
                <td className="py-2 text-gray-500 max-w-xs truncate">{a.element || '-'}</td>
              </tr>
            ))}
            {activities.length === 0 && !loading && (
              <tr><td colSpan={5} className="py-8 text-center text-gray-400">{t('admin.activity.noData', 'No data')}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      {total > limit && (
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-gray-500">{offset + 1}–{Math.min(offset + limit, total)} / {total}</span>
          <div className="flex gap-2">
            <button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - limit))} className="px-3 py-1 text-sm border rounded disabled:opacity-40">
              {t('admin.activity.prev', 'Prev')}
            </button>
            <button disabled={offset + limit >= total} onClick={() => setOffset(offset + limit)} className="px-3 py-1 text-sm border rounded disabled:opacity-40">
              {t('admin.activity.next', 'Next')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function JourneyTab() {
  const { t } = useTranslation();
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [selectedSession, setSelectedSession] = useState('');
  const [activities, setActivities] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    adminFetch('/activity/users').then((r) => setUsers(r.data.users)).catch(console.error);
  }, []);

  const loadJourney = useCallback((userId: string, sessionId?: string) => {
    if (!userId) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (sessionId) params.set('sessionId', sessionId);
    adminFetch(`/activity/journey/${userId}?${params}`)
      .then((r) => {
        setActivities(r.data.activities);
        setSessions(r.data.sessions);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (selectedUser) {
      setSelectedSession('');
      loadJourney(selectedUser);
    } else {
      setActivities([]);
      setSessions([]);
    }
  }, [selectedUser, loadJourney]);

  useEffect(() => {
    if (selectedUser && selectedSession) {
      loadJourney(selectedUser, selectedSession);
    }
  }, [selectedSession, selectedUser, loadJourney]);

  return (
    <div>
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          value={selectedUser}
          onChange={(e) => setSelectedUser(e.target.value)}
          className="border rounded px-3 py-1.5 text-sm"
        >
          <option value="">{t('admin.activity.selectUser', 'Select User')}</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>{u.email}{u.name ? ` (${u.name})` : ''}</option>
          ))}
        </select>
        {sessions.length > 0 && (
          <select
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
            className="border rounded px-3 py-1.5 text-sm"
          >
            <option value="">{t('admin.activity.allSessions', 'All Sessions')}</option>
            {sessions.map((s) => (
              <option key={s.sessionId} value={s.sessionId}>
                {formatTime(s._min.timestamp)} — {s._count} {t('admin.activity.events', 'events')}
              </option>
            ))}
          </select>
        )}
      </div>

      {loading && <p className="text-sm text-gray-400 mb-2">{t('admin.activity.loading', 'Loading...')}</p>}

      {!selectedUser && (
        <p className="text-sm text-gray-400 py-8 text-center">{t('admin.activity.selectUserPrompt', 'Select a user to view their activity journey')}</p>
      )}

      {selectedUser && activities.length === 0 && !loading && (
        <p className="text-sm text-gray-400 py-8 text-center">{t('admin.activity.noData', 'No data')}</p>
      )}

      {activities.length > 0 && (
        <div className="relative pl-6 border-l-2 border-gray-200">
          {activities.map((a, i) => (
            <div key={a.id || i} className="mb-4 relative">
              <div className={`absolute -left-[25px] top-1 w-3 h-3 rounded-full border-2 border-white ${
                a.eventType === 'page_view' ? 'bg-blue-500' : 'bg-green-500'
              }`} />
              <div className="text-xs text-gray-400 mb-0.5">{formatTime(a.timestamp)}</div>
              <div className="text-sm">
                <span className={`inline-block px-1.5 py-0.5 rounded text-xs font-medium mr-2 ${
                  a.eventType === 'page_view' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                }`}>
                  {a.eventType === 'page_view' ? t('admin.activity.pageView', 'Page View') : t('admin.activity.click', 'Click')}
                </span>
                <span className="font-mono text-xs text-gray-600">{a.path}</span>
                {a.element && a.eventType === 'click' && (
                  <span className="text-gray-400 ml-2 text-xs">→ {a.element}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Main Component ---

const SUB_TABS: { key: SubTab; labelKey: string; fallback: string }[] = [
  { key: 'signups', labelKey: 'admin.activity.signups', fallback: 'Signups' },
  { key: 'logins', labelKey: 'admin.activity.logins', fallback: 'Logins' },
  { key: 'feed', labelKey: 'admin.activity.feed', fallback: 'Activity Feed' },
  { key: 'journey', labelKey: 'admin.activity.journey', fallback: 'User Journey' },
];

export default function AdminActivityTab() {
  const { t } = useTranslation();
  const [subTab, setSubTab] = useState<SubTab>('signups');

  return (
    <div>
      <div className="flex gap-1 mb-6 border-b">
        {SUB_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              subTab === tab.key
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t(tab.labelKey, tab.fallback)}
          </button>
        ))}
      </div>

      {subTab === 'signups' && <SignupsTab />}
      {subTab === 'logins' && <LoginsTab />}
      {subTab === 'feed' && <FeedTab />}
      {subTab === 'journey' && <JourneyTab />}
    </div>
  );
}
