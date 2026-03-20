import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { IconChevronDown, IconUsers, IconUser } from '@tabler/icons-react';
import axios from '../lib/axios';
import { useAuth } from '../context/AuthContext';

export interface RecruiterTeamFilterValue {
  filterUserId?: string;
  filterTeamId?: string;
  teamView?: boolean;
}

interface FilterUser {
  id: string;
  name: string | null;
  email: string;
}

interface FilterTeam {
  id: string;
  name: string;
}

interface RecruiterTeamFilterProps {
  value: RecruiterTeamFilterValue;
  onChange: (filter: RecruiterTeamFilterValue) => void;
}

export default function RecruiterTeamFilter({ value, onChange }: RecruiterTeamFilterProps) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [users, setUsers] = useState<FilterUser[]>([]);
  const [teams, setTeams] = useState<FilterTeam[]>([]);

  const isAdmin = user?.role === 'admin';
  const hasTeam = !!user?.teamId;

  useEffect(() => {
    if (!isAdmin) return;
    axios.get('/api/v1/admin/filter-options')
      .then((res) => {
        setUsers(res.data.data?.users || []);
        setTeams(res.data.data?.teams || []);
      })
      .catch(() => {});
  }, [isAdmin]);

  // Admin: show recruiter/team dropdown
  if (isAdmin) {
    const selectValue = value.filterUserId
      ? `user:${value.filterUserId}`
      : value.filterTeamId
        ? `team:${value.filterTeamId}`
        : '';

    const handleChange = (val: string) => {
      if (val.startsWith('user:')) {
        onChange({ filterUserId: val.slice(5) });
      } else if (val.startsWith('team:')) {
        onChange({ filterTeamId: val.slice(5) });
      } else {
        onChange({});
      }
    };

    return (
      <div className="relative">
        <select
          value={selectValue}
          onChange={(e) => handleChange(e.target.value)}
          className="h-9 appearance-none rounded-lg border border-slate-200 bg-white pl-3 pr-8 text-sm text-slate-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">{t('common.filters.allRecruiters', 'All Recruiters')}</option>
          {users.length > 0 && (
            <optgroup label={t('common.filters.recruiterGroup', 'Recruiters')}>
              {users.map((u) => (
                <option key={u.id} value={`user:${u.id}`}>
                  {u.name || u.email}
                </option>
              ))}
            </optgroup>
          )}
          {teams.length > 0 && (
            <optgroup label={t('common.filters.teamGroup', 'Teams')}>
              {teams.map((tm) => (
                <option key={tm.id} value={`team:${tm.id}`}>
                  {tm.name}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        <IconChevronDown className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" size={16} stroke={2} />
      </div>
    );
  }

  // Non-admin with team: show My Data / Team toggle
  if (!hasTeam) return null;

  const teamViewActive = !!value.teamView;

  return (
    <div className="flex bg-slate-100 rounded-lg p-0.5 gap-0.5">
      <button
        onClick={() => onChange({ teamView: false })}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
          !teamViewActive
            ? 'bg-white text-slate-900 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        <IconUser size={14} stroke={2} />
        {t('common.filters.myData', 'My Data')}
      </button>
      <button
        onClick={() => onChange({ teamView: true })}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
          teamViewActive
            ? 'bg-white text-slate-900 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        <IconUsers size={14} stroke={2} />
        {t('common.filters.teamView', 'Team')}
      </button>
    </div>
  );
}
