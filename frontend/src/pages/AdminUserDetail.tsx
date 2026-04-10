import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import axios from '../lib/axios';
import { formatUsageLimit } from '../utils/usageLimits';
import { getUserRoleBadgeClassName, getUserRoleLabel, normalizeUserRole, type UserRole } from '../utils/userRole';

// --- Types ---
interface UserDetail {
  id: string;
  email: string;
  name?: string | null;
  phone?: string | null;
  jobTitle?: string | null;
  company?: string | null;
  avatar?: string | null;
  role: string;
  provider?: string | null;
  teamId?: string | null;
  createdAt: string;
  updatedAt: string;
  stripeCustomerId?: string | null;
  subscriptionTier: string;
  subscriptionStatus: string;
  subscriptionId?: string | null;
  currentPeriodEnd?: string | null;
  trialEnd?: string | null;
  interviewsUsed: number;
  resumeMatchesUsed: number;
  topUpBalance: number;
  customMaxInterviews?: number | null;
  customMaxMatches?: number | null;
  planMaxInterviews?: number | null;
  planMaxMatches?: number | null;
  effectiveMaxInterviews?: number | null;
  effectiveMaxMatches?: number | null;
}

interface TeamMembership {
  id: string;
  userId: string;
  teamId: string;
  role: string;
  createdAt: string;
  team: { id: string; name: string; description?: string | null };
}

interface Activity {
  id: string;
  endpoint: string;
  method: string;
  module: string;
  apiName: string;
  statusCode: number;
  durationMs: number;
  totalTokens: number;
  cost: number;
  createdAt: string;
}

interface AdjustmentRecord {
  id: string;
  type: string;
  amount?: number | null;
  oldValue?: string | null;
  newValue?: string | null;
  reason: string;
  createdAt: string;
  admin: { id: string; email: string; name?: string | null };
}

interface UsageStats {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  dailyUsage: { date: string; count: number; tokens: number; cost: number }[];
}

interface Team {
  id: string;
  name: string;
  description?: string | null;
}

type TabKey = 'profile' | 'activity' | 'usage' | 'teams';

const TIER_COLORS: Record<string, string> = {
  free: 'bg-slate-100 text-slate-700',
  starter: 'bg-blue-100 text-blue-700',
  growth: 'bg-purple-100 text-purple-700',
  business: 'bg-emerald-100 text-emerald-700',
  custom: 'bg-amber-100 text-amber-700',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-700',
  trialing: 'bg-blue-100 text-blue-700',
  past_due: 'bg-amber-100 text-amber-700',
  canceled: 'bg-red-100 text-red-700',
};

export default function AdminUserDetail() {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserDetail | null>(null);
  const [adjustments, setAdjustments] = useState<AdjustmentRecord[]>([]);
  const [teamMemberships, setTeamMemberships] = useState<TeamMembership[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [usageStats, setUsageStats] = useState<UsageStats | null>(null);
  const [allTeams, setAllTeams] = useState<Team[]>([]);
  const [tab, setTab] = useState<TabKey>('profile');

  // Profile edit state
  const [editing, setEditing] = useState(false);
  const [profileDraft, setProfileDraft] = useState({ name: '', phone: '', jobTitle: '', company: '' });
  const [saving, setSaving] = useState(false);

  // Action state
  const [actionType, setActionType] = useState('');
  const [actionAmount, setActionAmount] = useState('');
  const [actionUsageType, setActionUsageType] = useState<'interview' | 'match'>('interview');
  const [actionTier, setActionTier] = useState('starter');
  const [actionStatus, setActionStatus] = useState('active');
  const [actionRole, setActionRole] = useState<UserRole>('user');
  const [actionMaxInterviews, setActionMaxInterviews] = useState('');
  const [actionMaxMatches, setActionMaxMatches] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [actionImmediate, setActionImmediate] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');

  // Delete user state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Team Lead state
  const [selectedLeadTeams, setSelectedLeadTeams] = useState<string[]>([]);
  const [leadReason, setLeadReason] = useState('');
  const [leadSaving, setLeadSaving] = useState(false);

  // Team assignment state
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [teamSaving, setTeamSaving] = useState(false);

  const fetchUser = useCallback(async () => {
    if (!userId) return;
    try {
      const [userRes, teamsRes] = await Promise.all([
        axios.get(`/api/v1/admin/users/${userId}`),
        axios.get('/api/v1/admin/teams'),
      ]);
      const data = userRes.data.data;
      setUser(data.user);
      setAdjustments(data.adjustments || []);
      setTeamMemberships(data.teamMemberships || []);
      setActivities(data.recentActivities || []);
      setUsageStats(data.usageStats || null);
      setAllTeams(teamsRes.data.data || []);

      // Init edit drafts
      setProfileDraft({
        name: data.user.name || '',
        phone: data.user.phone || '',
        jobTitle: data.user.jobTitle || '',
        company: data.user.company || '',
      });
      setSelectedTeams((data.teamMemberships || []).map((m: TeamMembership) => m.teamId));
      setSelectedLeadTeams(
        (data.teamMemberships || []).filter((m: TeamMembership) => m.role === 'lead').map((m: TeamMembership) => m.teamId)
      );
      setActionRole(normalizeUserRole(data.user.role));
    } catch (err) {
      console.error('Failed to load user:', err);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { fetchUser(); }, [fetchUser]);

  const saveProfile = async () => {
    if (!userId) return;
    setSaving(true);
    try {
      await axios.patch(`/api/v1/admin/users/${userId}/profile`, profileDraft);
      setEditing(false);
      await fetchUser();
    } catch (err) {
      console.error('Save profile failed:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleAction = async (endpoint: string, body: Record<string, unknown>) => {
    if (!userId) return;
    setIsSubmitting(true);
    setActionMessage('');
    setActionError('');
    try {
      await axios.post(`/api/v1/admin/users/${userId}/${endpoint}`, body);
      setActionMessage(t('admin.userDetail.actionSuccess', 'Action completed successfully'));
      setActionType('');
      setActionReason('');
      await fetchUser();
    } catch (err: any) {
      setActionError(err?.response?.data?.error || err.message || 'Failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const submitAction = () => {
    switch (actionType) {
      case 'balance':
        return handleAction('adjust-balance', { amount: parseFloat(actionAmount), reason: actionReason });
      case 'usage':
        return handleAction('adjust-usage', { action: actionUsageType, amount: parseInt(actionAmount), reason: actionReason });
      case 'subscription':
        return handleAction('set-subscription', { tier: actionTier, status: actionStatus, reason: actionReason });
      case 'set_limits':
        return handleAction('set-limits', {
          maxInterviews: actionMaxInterviews ? parseInt(actionMaxInterviews) : null,
          maxMatches: actionMaxMatches ? parseInt(actionMaxMatches) : null,
          reason: actionReason,
        });
      case 'reset':
        return handleAction('reset-usage', { reason: actionReason });
      case 'cancel_sub':
        return handleAction('cancel-subscription', { reason: actionReason, immediate: actionImmediate });
      case 'disable':
        return handleAction('disable', { reason: actionReason });
      case 'enable':
        return handleAction('enable', { reason: actionReason });
      case 'set_role':
        return handleAction('set-role', { role: actionRole, reason: actionReason });
    }
  };

  const saveTeamAssignment = async () => {
    if (!userId) return;
    setTeamSaving(true);
    try {
      await axios.post(`/api/v1/admin/users/${userId}/assign-teams`, { teamIds: selectedTeams });
      await fetchUser();
    } catch (err) {
      console.error('Assign teams failed:', err);
    } finally {
      setTeamSaving(false);
    }
  };

  const saveTeamLead = async () => {
    if (!userId || !leadReason.trim()) return;
    setLeadSaving(true);
    try {
      await axios.post(`/api/v1/admin/users/${userId}/set-team-lead`, {
        teamIds: selectedLeadTeams,
        reason: leadReason,
      });
      setLeadReason('');
      await fetchUser();
    } catch (err) {
      console.error('Set team lead failed:', err);
    } finally {
      setLeadSaving(false);
    }
  };

  const handleDeleteUser = async () => {
    if (!userId) return;
    setDeleting(true);
    try {
      await axios.delete(`/api/v1/admin/users/${userId}`);
      navigate('/product/admin?tab=Users');
    } catch (err: any) {
      setActionError(err?.response?.data?.error || 'Failed to delete user');
      setShowDeleteConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="text-center py-32">
        <p className="text-gray-500">{t('admin.userDetail.notFound', 'User not found')}</p>
        <button onClick={() => navigate('/product/admin?tab=Users')} className="mt-4 text-indigo-600 hover:underline text-sm">
          {t('admin.userDetail.backToAdmin', 'Back to Admin')}
        </button>
      </div>
    );
  }

  const isTeamLead = teamMemberships.some(m => m.role === 'lead');

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'profile', label: t('admin.userDetail.tabs.profile', 'Profile') },
    { key: 'activity', label: t('admin.userDetail.tabs.activity', 'Activity') },
    { key: 'usage', label: t('admin.userDetail.tabs.usage', 'Usage & Stats') },
    { key: 'teams', label: t('admin.userDetail.tabs.teams', 'Teams & Roles') },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
      {/* Back link */}
      <button
        onClick={() => navigate('/product/admin?tab=Users')}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
        </svg>
        {t('admin.userDetail.backToUsers', 'Back to Users')}
      </button>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-gray-200 p-6">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-xl font-bold text-indigo-600 shrink-0">
            {user.avatar ? (
              <img src={user.avatar} alt="" className="w-full h-full rounded-full object-cover" />
            ) : (
              (user.name || user.email).charAt(0).toUpperCase()
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">{user.name || user.email}</h1>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${TIER_COLORS[user.subscriptionTier] || TIER_COLORS.free}`}>
                {user.subscriptionTier}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${STATUS_COLORS[user.subscriptionStatus] || STATUS_COLORS.active}`}>
                {user.subscriptionStatus}
              </span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${getUserRoleBadgeClassName(user.role)}`}>
                {getUserRoleLabel(user.role)}
              </span>
              {isTeamLead && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-purple-100 text-purple-700">
                  {t('admin.userDetail.teamLead', 'Team Lead')}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{user.email}</p>
            {user.company && <p className="text-xs text-gray-400">{user.company}</p>}
          </div>
          <div className="text-right text-xs text-gray-400 shrink-0">
            <p>{t('admin.userDetail.joined', 'Joined')}: {new Date(user.createdAt).toLocaleDateString()}</p>
            <p>{t('admin.userDetail.provider', 'Provider')}: {user.provider || 'email'}</p>
          </div>
        </div>

        {/* Quick stats */}
        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: t('admin.userDetail.balance', 'Balance'), value: `$${user.topUpBalance.toFixed(2)}`, color: 'text-emerald-700', bg: 'bg-emerald-50' },
            { label: t('admin.userDetail.interviews', 'Interviews'), value: `${user.interviewsUsed}/${formatUsageLimit(user.effectiveMaxInterviews)}`, color: 'text-blue-700', bg: 'bg-blue-50' },
            { label: t('admin.userDetail.matches', 'Matches'), value: `${user.resumeMatchesUsed}/${formatUsageLimit(user.effectiveMaxMatches)}`, color: 'text-purple-700', bg: 'bg-purple-50' },
            { label: t('admin.userDetail.teams', 'Teams'), value: String(teamMemberships.length), color: 'text-gray-700', bg: 'bg-gray-50' },
          ].map(s => (
            <div key={s.label} className={`rounded-xl px-3 py-2 ${s.bg}`}>
              <p className="text-[10px] font-medium text-gray-500">{s.label}</p>
              <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
        {tabs.map(t2 => (
          <button
            key={t2.key}
            onClick={() => setTab(t2.key)}
            className={`flex-1 text-sm font-medium py-2 rounded-lg transition-colors ${
              tab === t2.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t2.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'profile' && (
        <ProfileTab
          user={user}
          editing={editing}
          profileDraft={profileDraft}
          saving={saving}
          onEdit={() => setEditing(true)}
          onCancel={() => { setEditing(false); setProfileDraft({ name: user.name || '', phone: user.phone || '', jobTitle: user.jobTitle || '', company: user.company || '' }); }}
          onDraftChange={setProfileDraft}
          onSave={saveProfile}
          actionType={actionType}
          onActionType={setActionType}
          actionAmount={actionAmount}
          onActionAmount={setActionAmount}
          actionUsageType={actionUsageType}
          onActionUsageType={setActionUsageType}
          actionTier={actionTier}
          onActionTier={setActionTier}
          actionStatus={actionStatus}
          onActionStatus={setActionStatus}
          actionRole={actionRole}
          onActionRole={setActionRole}
          actionMaxInterviews={actionMaxInterviews}
          onActionMaxInterviews={setActionMaxInterviews}
          actionMaxMatches={actionMaxMatches}
          onActionMaxMatches={setActionMaxMatches}
          actionReason={actionReason}
          onActionReason={setActionReason}
          actionImmediate={actionImmediate}
          onActionImmediate={setActionImmediate}
          isSubmitting={isSubmitting}
          actionMessage={actionMessage}
          actionError={actionError}
          onSubmitAction={submitAction}
          adjustments={adjustments}
          t={t}
        />
      )}

      {tab === 'activity' && <ActivityTab activities={activities} t={t} />}
      {tab === 'usage' && <UsageTab stats={usageStats} user={user} t={t} />}
      {tab === 'teams' && (
        <TeamsTab
          teamMemberships={teamMemberships}
          allTeams={allTeams}
          selectedTeams={selectedTeams}
          onSelectedTeams={setSelectedTeams}
          teamSaving={teamSaving}
          onSaveTeams={saveTeamAssignment}
          selectedLeadTeams={selectedLeadTeams}
          onSelectedLeadTeams={setSelectedLeadTeams}
          leadReason={leadReason}
          onLeadReason={setLeadReason}
          leadSaving={leadSaving}
          onSaveTeamLead={saveTeamLead}
          t={t}
        />
      )}

      {/* Delete User — danger zone */}
      <div className="mt-8 rounded-2xl border border-red-200 bg-red-50/50 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-red-700">{t('admin.userDetail.dangerZone', 'Danger Zone')}</h3>
            <p className="text-xs text-red-500 mt-0.5">{t('admin.userDetail.deleteWarning', 'Permanently delete this user and all associated data. This cannot be undone.')}</p>
          </div>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
          >
            {t('admin.userDetail.deleteUser', 'Delete User')}
          </button>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-gray-900">{t('admin.userDetail.confirmDeleteTitle', 'Delete User')}</h3>
            <p className="mt-2 text-sm text-gray-500">
              {t('admin.userDetail.confirmDeleteMessage', 'Are you sure you want to permanently delete {{email}}? All their data (resumes, interviews, jobs, sessions) will be removed. This action cannot be undone.', { email: user.email })}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleting}
                className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                {t('common.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleDeleteUser}
                disabled={deleting}
                className="px-3 py-1.5 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? t('admin.userDetail.deleting', 'Deleting...') : t('admin.userDetail.confirmDelete', 'Yes, Delete')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Profile Tab ────────────────────────────────────────────────────────
function ProfileTab({ user, editing, profileDraft, saving, onEdit, onCancel, onDraftChange, onSave, actionType, onActionType, actionAmount, onActionAmount, actionUsageType, onActionUsageType, actionTier, onActionTier, actionStatus, onActionStatus, actionRole, onActionRole, actionMaxInterviews, onActionMaxInterviews, actionMaxMatches, onActionMaxMatches, actionReason, onActionReason, actionImmediate, onActionImmediate, isSubmitting, actionMessage, actionError, onSubmitAction, adjustments, t }: any) {
  const fields = [
    { key: 'name', label: t('admin.userDetail.field.name', 'Name') },
    { key: 'phone', label: t('admin.userDetail.field.phone', 'Phone') },
    { key: 'jobTitle', label: t('admin.userDetail.field.jobTitle', 'Job Title') },
    { key: 'company', label: t('admin.userDetail.field.company', 'Company') },
  ];

  const actions = [
    { key: 'balance', label: t('admin.userDetail.actions.adjustBalance', 'Adjust Balance') },
    { key: 'usage', label: t('admin.userDetail.actions.adjustUsage', 'Adjust Usage') },
    { key: 'subscription', label: t('admin.userDetail.actions.setSubscription', 'Set Subscription') },
    { key: 'set_limits', label: t('admin.userDetail.actions.setLimits', 'Set Limits') },
    { key: 'reset', label: t('admin.userDetail.actions.resetUsage', 'Reset Usage') },
    { key: 'set_role', label: t('admin.userDetail.actions.setRole', 'Set Role') },
    { key: 'disable', label: t('admin.userDetail.actions.disable', 'Disable User') },
    { key: 'enable', label: t('admin.userDetail.actions.enable', 'Enable User') },
  ];

  return (
    <div className="space-y-4">
      {/* User Info */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900">{t('admin.userDetail.personalInfo', 'Personal Information')}</h3>
          {!editing ? (
            <button onClick={onEdit} className="text-xs font-medium text-indigo-600 hover:text-indigo-700">
              {t('admin.userDetail.edit', 'Edit')}
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={onCancel} className="text-xs font-medium text-gray-500 hover:text-gray-700">
                {t('admin.userDetail.cancel', 'Cancel')}
              </button>
              <button onClick={onSave} disabled={saving} className="text-xs font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-50">
                {saving ? t('admin.userDetail.saving', 'Saving...') : t('admin.userDetail.save', 'Save')}
              </button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {fields.map(f => (
            <div key={f.key}>
              <label className="text-xs text-gray-400 block mb-1">{f.label}</label>
              {editing ? (
                <input
                  type="text"
                  value={(profileDraft as any)[f.key]}
                  onChange={e => onDraftChange({ ...profileDraft, [f.key]: e.target.value })}
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              ) : (
                <p className="text-sm font-medium text-gray-800">{(user as any)[f.key] || '—'}</p>
              )}
            </div>
          ))}
          <div>
            <label className="text-xs text-gray-400 block mb-1">Email</label>
            <p className="text-sm font-medium text-gray-800">{user.email}</p>
          </div>
          <div>
            <label className="text-xs text-gray-400 block mb-1">{t('admin.userDetail.field.provider', 'Auth Provider')}</label>
            <p className="text-sm font-medium text-gray-800">{user.provider || 'email'}</p>
          </div>
        </div>
      </div>

      {/* Subscription Info */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">{t('admin.userDetail.subscriptionInfo', 'Subscription')}</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-xs text-gray-400">{t('admin.userDetail.field.tier', 'Plan')}</p>
            <p className="font-medium text-gray-800 capitalize">{user.subscriptionTier}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">{t('admin.userDetail.field.status', 'Status')}</p>
            <p className="font-medium text-gray-800 capitalize">{user.subscriptionStatus}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">{t('admin.userDetail.field.periodEnd', 'Period End')}</p>
            <p className="font-medium text-gray-800">{user.currentPeriodEnd ? new Date(user.currentPeriodEnd).toLocaleDateString() : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-gray-400">{t('admin.userDetail.field.stripeId', 'Stripe ID')}</p>
            <p className="font-medium text-gray-800 truncate text-xs">{user.stripeCustomerId || '—'}</p>
          </div>
        </div>
      </div>

      {/* Admin Actions */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('admin.userDetail.adminActions', 'Admin Actions')}</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {actions.map(a => (
            <button
              key={a.key}
              onClick={() => { onActionType(a.key === actionType ? '' : a.key); }}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                actionType === a.key ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {a.label}
            </button>
          ))}
        </div>

        {actionType && (
          <div className="bg-gray-50 rounded-xl p-4 space-y-3">
            {/* Action-specific inputs */}
            {actionType === 'balance' && (
              <input type="number" step="0.01" value={actionAmount} onChange={e => onActionAmount(e.target.value)}
                placeholder={t('admin.userDetail.amountPlaceholder', 'Amount (+ credit / - debit)')}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
              />
            )}
            {actionType === 'usage' && (
              <div className="flex gap-2">
                <select value={actionUsageType} onChange={e => onActionUsageType(e.target.value as any)} className="text-sm border border-gray-200 rounded-lg px-3 py-2">
                  <option value="interview">{t('admin.userDetail.interview', 'Interview')}</option>
                  <option value="match">{t('admin.userDetail.match', 'Match')}</option>
                </select>
                <input type="number" value={actionAmount} onChange={e => onActionAmount(e.target.value)} placeholder={t('admin.userDetail.amount', 'Amount')} className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2" />
              </div>
            )}
            {actionType === 'subscription' && (
              <div className="flex gap-2">
                <select value={actionTier} onChange={e => onActionTier(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2">
                  {['free', 'starter', 'growth', 'business', 'custom'].map(t2 => <option key={t2} value={t2}>{t2}</option>)}
                </select>
                <select value={actionStatus} onChange={e => onActionStatus(e.target.value)} className="text-sm border border-gray-200 rounded-lg px-3 py-2">
                  {['active', 'trialing', 'past_due', 'canceled'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            )}
            {actionType === 'set_limits' && (
              <div className="flex gap-2">
                <input type="number" value={actionMaxInterviews} onChange={e => onActionMaxInterviews(e.target.value)} placeholder={t('admin.userDetail.maxInterviews', 'Max Interviews')} className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2" />
                <input type="number" value={actionMaxMatches} onChange={e => onActionMaxMatches(e.target.value)} placeholder={t('admin.userDetail.maxMatches', 'Max Matches')} className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2" />
              </div>
            )}
            {actionType === 'set_role' && (
              <select value={actionRole} onChange={e => onActionRole(normalizeUserRole(e.target.value))} className="text-sm border border-gray-200 rounded-lg px-3 py-2">
                <option value="user">User</option>
                <option value="internal">Internal</option>
                <option value="agency">Agency</option>
                <option value="admin">Admin</option>
              </select>
            )}
            {actionType === 'cancel_sub' && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={actionImmediate} onChange={e => onActionImmediate(e.target.checked)} />
                {t('admin.userDetail.immediate', 'Cancel immediately')}
              </label>
            )}

            <input
              type="text" value={actionReason} onChange={e => onActionReason(e.target.value)}
              placeholder={t('admin.userDetail.reasonPlaceholder', 'Reason (required)')}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
            />
            <div className="flex items-center gap-3">
              <button
                onClick={onSubmitAction}
                disabled={isSubmitting || !actionReason.trim()}
                className="text-xs font-semibold bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSubmitting ? t('admin.userDetail.submitting', 'Submitting...') : t('admin.userDetail.submit', 'Submit')}
              </button>
              {actionMessage && <span className="text-xs text-emerald-600">{actionMessage}</span>}
              {actionError && <span className="text-xs text-red-500">{actionError}</span>}
            </div>
          </div>
        )}
      </div>

      {/* Adjustment History */}
      {adjustments.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('admin.userDetail.adjustmentHistory', 'Adjustment History')}</h3>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {adjustments.map((a: AdjustmentRecord) => (
              <div key={a.id} className="flex items-start justify-between gap-2 text-xs border-b border-gray-100 pb-2">
                <div className="min-w-0">
                  <span className="font-medium text-gray-700 capitalize">{a.type}</span>
                  <span className="text-gray-400 ml-2">{a.reason}</span>
                  {a.amount != null && <span className="ml-2 font-mono text-gray-600">{a.amount > 0 ? '+' : ''}{a.amount}</span>}
                </div>
                <div className="text-right shrink-0 text-gray-400">
                  <p>{new Date(a.createdAt).toLocaleDateString()}</p>
                  <p>{a.admin.name || a.admin.email}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Activity Tab ───────────────────────────────────────────────────────
type ActivityView = 'list' | 'byType' | 'byApi';

const MODULE_COLORS: Record<string, string> = {
  auth: 'bg-sky-100 text-sky-700',
  admin: 'bg-red-100 text-red-700',
  hiring_requests: 'bg-indigo-100 text-indigo-700',
  hiring_chat: 'bg-violet-100 text-violet-700',
  hiring_sessions: 'bg-purple-100 text-purple-700',
  hiring_jd_draft: 'bg-fuchsia-100 text-fuchsia-700',
  hiring_title_suggestion: 'bg-pink-100 text-pink-700',
  hiring_brief: 'bg-rose-100 text-rose-700',
  hiring_intelligence: 'bg-orange-100 text-orange-700',
  resume_parse: 'bg-emerald-100 text-emerald-700',
  resume_match: 'bg-teal-100 text-teal-700',
  resume_format: 'bg-cyan-100 text-cyan-700',
  resumes: 'bg-green-100 text-green-700',
  smart_matching: 'bg-blue-100 text-blue-700',
  interview_evaluation: 'bg-amber-100 text-amber-700',
  interview_invite: 'bg-yellow-100 text-yellow-700',
  jd_parse: 'bg-lime-100 text-lime-700',
  jd_format: 'bg-emerald-100 text-emerald-700',
  jobs: 'bg-indigo-100 text-indigo-700',
  billing: 'bg-emerald-100 text-emerald-700',
  usage: 'bg-slate-100 text-slate-700',
  api_keys: 'bg-gray-100 text-gray-700',
  ats: 'bg-orange-100 text-orange-700',
  system: 'bg-gray-100 text-gray-600',
  other: 'bg-gray-100 text-gray-600',
};

function methodColor(m: string) {
  if (m === 'GET') return 'text-emerald-600 bg-emerald-50';
  if (m === 'POST') return 'text-blue-600 bg-blue-50';
  if (m === 'PATCH' || m === 'PUT') return 'text-amber-600 bg-amber-50';
  if (m === 'DELETE') return 'text-red-600 bg-red-50';
  return 'text-gray-600 bg-gray-50';
}

interface ActivityGroup {
  key: string;
  label: string;
  items: Activity[];
  totalTokens: number;
  totalCost: number;
  errorCount: number;
}

function groupActivities(activities: Activity[], groupBy: 'module' | 'apiName'): ActivityGroup[] {
  const map = new Map<string, Activity[]>();
  for (const a of activities) {
    const key = a[groupBy] || 'unknown';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(a);
  }
  const groups: ActivityGroup[] = [];
  for (const [key, items] of map) {
    groups.push({
      key,
      label: key.replace(/_/g, ' '),
      items,
      totalTokens: items.reduce((s, i) => s + (i.totalTokens || 0), 0),
      totalCost: items.reduce((s, i) => s + (i.cost || 0), 0),
      errorCount: items.filter(i => i.statusCode >= 400).length,
    });
  }
  groups.sort((a, b) => b.items.length - a.items.length);
  return groups;
}

function ActivityTab({ activities, t }: { activities: Activity[]; t: any }) {
  const [view, setView] = useState<ActivityView>('list');
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  if (activities.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <p className="text-sm text-gray-500">{t('admin.userDetail.noActivity', 'No recent activity')}</p>
      </div>
    );
  }

  const toggleGroup = (key: string) => {
    setExpandedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const views: { key: ActivityView; label: string }[] = [
    { key: 'list', label: t('admin.userDetail.activity.list', 'List') },
    { key: 'byType', label: t('admin.userDetail.activity.byType', 'By Type') },
    { key: 'byApi', label: t('admin.userDetail.activity.byApi', 'By API') },
  ];

  const typeGroups = view === 'byType' ? groupActivities(activities, 'module') : [];
  const apiGroups = view === 'byApi' ? groupActivities(activities, 'apiName') : [];
  const groups = view === 'byType' ? typeGroups : apiGroups;

  return (
    <div className="space-y-4">
      {/* View switcher */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {views.map(v => (
            <button
              key={v.key}
              onClick={() => { setView(v.key); setExpandedGroups(new Set()); }}
              className={`text-xs font-medium px-3 py-1.5 rounded-md transition-colors ${
                view === v.key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {v.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400">
          {activities.length} {t('admin.userDetail.activity.records', 'records')}
        </span>
      </div>

      {/* List view */}
      {view === 'list' && (
        <div className="bg-white rounded-2xl border border-gray-200 p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('admin.userDetail.recentActivity', 'Recent Activity')}</h3>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {activities.map(a => (
              <div key={a.id} className="flex items-center gap-3 text-sm border-b border-gray-100 pb-2">
                <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${methodColor(a.method)}`}>{a.method}</span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-800 truncate">{a.apiName || a.endpoint}</p>
                  <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${MODULE_COLORS[a.module] || MODULE_COLORS.other}`}>{a.module}</span>
                    <span className={a.statusCode >= 400 ? 'text-red-500' : ''}>{a.statusCode}</span>
                    <span>{a.durationMs}ms</span>
                    {a.totalTokens > 0 && <span>{a.totalTokens.toLocaleString()} tokens</span>}
                    {a.cost > 0 && <span>${a.cost.toFixed(4)}</span>}
                  </div>
                </div>
                <span className="text-[11px] text-gray-400 shrink-0">{new Date(a.createdAt).toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Grouped view (byType or byApi) */}
      {(view === 'byType' || view === 'byApi') && (
        <div className="space-y-3">
          {/* Summary bar */}
          <div className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="flex flex-wrap gap-2">
              {groups.map(g => (
                <button
                  key={g.key}
                  onClick={() => toggleGroup(g.key)}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors ${
                    expandedGroups.has(g.key)
                      ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                      : `border-gray-200 hover:border-gray-300 ${view === 'byType' ? (MODULE_COLORS[g.key] || MODULE_COLORS.other) : 'text-gray-700 bg-gray-50'}`
                  }`}
                >
                  <span className="capitalize">{g.label}</span>
                  <span className="bg-white/60 px-1.5 py-0.5 rounded text-[10px] font-bold">{g.items.length}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Group cards */}
          {groups.map(g => (
            <div key={g.key} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <button
                onClick={() => toggleGroup(g.key)}
                className="w-full flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${expandedGroups.has(g.key) ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                  </svg>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded ${view === 'byType' ? (MODULE_COLORS[g.key] || MODULE_COLORS.other) : 'bg-slate-100 text-slate-700'}`}>
                    {g.label}
                  </span>
                  <span className="text-sm font-semibold text-gray-900">{g.items.length} {t('admin.userDetail.activity.requests', 'requests')}</span>
                </div>
                <div className="flex items-center gap-4 text-[11px] text-gray-400">
                  {g.errorCount > 0 && (
                    <span className="text-red-500 font-medium">{g.errorCount} {t('admin.userDetail.activity.errors', 'errors')}</span>
                  )}
                  {g.totalTokens > 0 && <span>{g.totalTokens.toLocaleString()} tokens</span>}
                  {g.totalCost > 0 && <span>${g.totalCost.toFixed(4)}</span>}
                </div>
              </button>

              {expandedGroups.has(g.key) && (
                <div className="border-t border-gray-100 px-5 py-2 space-y-1.5 max-h-[400px] overflow-y-auto">
                  {g.items.map(a => (
                    <div key={a.id} className="flex items-center gap-3 text-sm py-1.5 border-b border-gray-50 last:border-0">
                      <span className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${methodColor(a.method)}`}>{a.method}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-700 truncate text-xs">{view === 'byType' ? (a.apiName || a.endpoint) : a.module}</p>
                        <div className="flex items-center gap-3 mt-0.5 text-[11px] text-gray-400">
                          <span className={a.statusCode >= 400 ? 'text-red-500' : ''}>{a.statusCode}</span>
                          <span>{a.durationMs}ms</span>
                          {a.totalTokens > 0 && <span>{a.totalTokens.toLocaleString()} tok</span>}
                          {a.cost > 0 && <span>${a.cost.toFixed(4)}</span>}
                        </div>
                      </div>
                      <span className="text-[10px] text-gray-400 shrink-0">{new Date(a.createdAt).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Usage Tab ──────────────────────────────────────────────────────────
function UsageTab({ stats, t }: { stats: UsageStats | null; user: UserDetail; t: any }) {
  if (!stats) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-8 text-center">
        <p className="text-sm text-gray-500">{t('admin.userDetail.noUsage', 'No usage data')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t('admin.userDetail.usage.requests', 'Requests (30d)'), value: stats.totalRequests.toLocaleString(), color: 'text-blue-700', bg: 'bg-blue-50' },
          { label: t('admin.userDetail.usage.tokens', 'Tokens (30d)'), value: stats.totalTokens.toLocaleString(), color: 'text-purple-700', bg: 'bg-purple-50' },
          { label: t('admin.userDetail.usage.cost', 'Cost (30d)'), value: `$${stats.totalCost.toFixed(4)}`, color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: t('admin.userDetail.usage.avgDaily', 'Avg Daily Requests'), value: stats.dailyUsage.length > 0 ? Math.round(stats.totalRequests / stats.dailyUsage.length).toString() : '0', color: 'text-gray-700', bg: 'bg-gray-50' },
        ].map(s => (
          <div key={s.label} className={`rounded-xl px-3 py-3 ${s.bg}`}>
            <p className="text-[10px] font-medium text-gray-500">{s.label}</p>
            <p className={`text-lg font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      {stats.dailyUsage.length > 0 && (
        <>
          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('admin.userDetail.usage.requestsChart', 'Daily Requests')}</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={stats.dailyUsage}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('admin.userDetail.usage.costChart', 'Daily Cost')}</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={stats.dailyUsage}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `$${v}`} />
                <Tooltip contentStyle={{ fontSize: 12 }} formatter={(v: unknown) => [`$${Number(v || 0).toFixed(4)}`, 'Cost']} />
                <Area type="monotone" dataKey="cost" stroke="#10b981" fill="#d1fae5" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('admin.userDetail.usage.tokensChart', 'Daily Tokens')}</h3>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={stats.dailyUsage}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={v => v.slice(5)} />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="tokens" stroke="#8b5cf6" fill="#ede9fe" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Teams & Roles Tab ──────────────────────────────────────────────────
function TeamsTab({ teamMemberships, allTeams, selectedTeams, onSelectedTeams, teamSaving, onSaveTeams, selectedLeadTeams, onSelectedLeadTeams, leadReason, onLeadReason, leadSaving, onSaveTeamLead, t }: any) {
  const [inviteTeamId, setInviteTeamId] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteResult, setInviteResult] = useState('');

  const handleInvite = async () => {
    if (!inviteTeamId || !inviteEmail.trim()) return;
    setInviting(true);
    setInviteResult('');
    try {
      const res = await axios.post(`/api/v1/teams/${inviteTeamId}/invite`, { email: inviteEmail.trim() });
      const data = res.data.data;
      setInviteResult(
        data.type === 'added'
          ? t('admin.userDetail.inviteAdded', 'User added to team')
          : t('admin.userDetail.inviteSent', 'Invitation sent')
      );
      setInviteEmail('');
    } catch (err: any) {
      setInviteResult(err?.response?.data?.error || 'Failed');
    } finally {
      setInviting(false);
    }
  };

  const toggleTeam = (teamId: string) => {
    onSelectedTeams((prev: string[]) =>
      prev.includes(teamId) ? prev.filter((id: string) => id !== teamId) : [...prev, teamId]
    );
  };

  const toggleLeadTeam = (teamId: string) => {
    onSelectedLeadTeams((prev: string[]) =>
      prev.includes(teamId) ? prev.filter((id: string) => id !== teamId) : [...prev, teamId]
    );
  };

  return (
    <div className="space-y-4">
      {/* Current Memberships */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('admin.userDetail.currentTeams', 'Current Team Memberships')}</h3>
        {teamMemberships.length === 0 ? (
          <p className="text-sm text-gray-400">{t('admin.userDetail.noTeams', 'Not a member of any team')}</p>
        ) : (
          <div className="space-y-2">
            {teamMemberships.map((m: TeamMembership) => (
              <div key={m.id} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-gray-800">{m.team.name}</p>
                  {m.team.description && <p className="text-xs text-gray-400">{m.team.description}</p>}
                </div>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                  m.role === 'lead' ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-600'
                }`}>
                  {m.role === 'lead' ? t('admin.userDetail.lead', 'Lead') : t('admin.userDetail.member', 'Member')}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Assign Teams */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">{t('admin.userDetail.assignTeams', 'Assign Teams')}</h3>
        <div className="flex flex-wrap gap-2 mb-3">
          {allTeams.map((team: Team) => (
            <button
              key={team.id}
              onClick={() => toggleTeam(team.id)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors border ${
                selectedTeams.includes(team.id)
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {team.name}
            </button>
          ))}
          {allTeams.length === 0 && <p className="text-xs text-gray-400">{t('admin.userDetail.noTeamsAvailable', 'No teams available')}</p>}
        </div>
        <button
          onClick={onSaveTeams}
          disabled={teamSaving}
          className="text-xs font-semibold bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
        >
          {teamSaving ? t('admin.userDetail.saving', 'Saving...') : t('admin.userDetail.saveTeams', 'Save Team Assignment')}
        </button>
      </div>

      {/* Team Lead Assignment */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">{t('admin.userDetail.teamLeadRole', 'Team Lead Role')}</h3>
        <p className="text-xs text-gray-400 mb-3">{t('admin.userDetail.teamLeadDesc', 'Select which teams this user leads. Team leads can invite members to their teams.')}</p>
        <div className="flex flex-wrap gap-2 mb-3">
          {allTeams.map((team: Team) => (
            <button
              key={team.id}
              onClick={() => toggleLeadTeam(team.id)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors border ${
                selectedLeadTeams.includes(team.id)
                  ? 'bg-purple-50 border-purple-300 text-purple-700'
                  : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              }`}
            >
              {team.name}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={leadReason}
            onChange={e => onLeadReason(e.target.value)}
            placeholder={t('admin.userDetail.reasonPlaceholder', 'Reason (required)')}
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2"
          />
          <button
            onClick={onSaveTeamLead}
            disabled={leadSaving || !leadReason.trim()}
            className="text-xs font-semibold bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 disabled:opacity-50"
          >
            {leadSaving ? t('admin.userDetail.saving', 'Saving...') : t('admin.userDetail.saveTeamLead', 'Save Team Lead')}
          </button>
        </div>
      </div>

      {/* Invite Member (for team leads) */}
      <div className="bg-white rounded-2xl border border-gray-200 p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-1">{t('admin.userDetail.inviteMember', 'Invite Member to Team')}</h3>
        <p className="text-xs text-gray-400 mb-3">{t('admin.userDetail.inviteDesc', 'Invite a user by email. If the user exists, they will be added directly. Otherwise, a pending invitation will be created.')}</p>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <select
              value={inviteTeamId}
              onChange={e => setInviteTeamId(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 mb-2"
            >
              <option value="">{t('admin.userDetail.selectTeam', 'Select team...')}</option>
              {allTeams.map((team: Team) => (
                <option key={team.id} value={team.id}>{team.name}</option>
              ))}
            </select>
            <input
              type="email"
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              placeholder={t('admin.userDetail.emailPlaceholder', 'user@example.com')}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2"
            />
          </div>
          <button
            onClick={handleInvite}
            disabled={inviting || !inviteTeamId || !inviteEmail.trim()}
            className="text-xs font-semibold bg-emerald-600 text-white px-4 py-2 rounded-lg hover:bg-emerald-700 disabled:opacity-50 h-[38px]"
          >
            {inviting ? '...' : t('admin.userDetail.invite', 'Invite')}
          </button>
        </div>
        {inviteResult && <p className="text-xs text-gray-600 mt-2">{inviteResult}</p>}
      </div>
    </div>
  );
}
