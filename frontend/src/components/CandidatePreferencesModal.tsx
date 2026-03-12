import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import axios from '../lib/axios';

export interface CandidatePreferences {
  email?: string;
  phone?: string;
  cities?: string[];
  workType?: string[];
  salaryMin?: string;
  salaryMax?: string;
  salaryCurrency?: string;
  preferredJobTypes?: string[];
  preferredCompanyTypes?: string[];
  notes?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  resumeId: string;
  candidateName: string;
  initialPreferences?: CandidatePreferences | null;
  initialEmail?: string | null;
  initialPhone?: string | null;
  onSaved?: (prefs: CandidatePreferences) => void;
}

const WORK_TYPES = [
  { value: 'full-time', labelKey: 'product.talent.preferences.workTypes.fullTime', fallback: 'Full-time' },
  { value: 'part-time', labelKey: 'product.talent.preferences.workTypes.partTime', fallback: 'Part-time' },
  { value: 'contract', labelKey: 'product.talent.preferences.workTypes.contract', fallback: 'Contract' },
  { value: 'freelance', labelKey: 'product.talent.preferences.workTypes.freelance', fallback: 'Freelance' },
  { value: 'internship', labelKey: 'product.talent.preferences.workTypes.internship', fallback: 'Internship' },
  { value: 'remote-only', labelKey: 'product.talent.preferences.workTypes.remoteOnly', fallback: 'Remote Only' },
  { value: 'hybrid', labelKey: 'product.talent.preferences.workTypes.hybrid', fallback: 'Hybrid' },
  { value: 'on-site', labelKey: 'product.talent.preferences.workTypes.onSite', fallback: 'On-site' },
];

const JOB_TYPES = [
  { value: 'engineering', labelKey: 'product.talent.preferences.jobTypes.engineering', fallback: 'Engineering' },
  { value: 'ai-ml', labelKey: 'product.talent.preferences.jobTypes.aiMl', fallback: 'AI/ML' },
  { value: 'product', labelKey: 'product.talent.preferences.jobTypes.product', fallback: 'Product' },
  { value: 'design', labelKey: 'product.talent.preferences.jobTypes.design', fallback: 'Design' },
  { value: 'data', labelKey: 'product.talent.preferences.jobTypes.data', fallback: 'Data' },
  { value: 'marketing', labelKey: 'product.talent.preferences.jobTypes.marketing', fallback: 'Marketing' },
  { value: 'operations', labelKey: 'product.talent.preferences.jobTypes.operations', fallback: 'Operations' },
  { value: 'management', labelKey: 'product.talent.preferences.jobTypes.management', fallback: 'Management' },
  { value: 'sales', labelKey: 'product.talent.preferences.jobTypes.sales', fallback: 'Sales' },
  { value: 'finance', labelKey: 'product.talent.preferences.jobTypes.finance', fallback: 'Finance' },
];

const COMPANY_TYPES = [
  { value: 'startup', labelKey: 'product.talent.preferences.companyTypes.startup', fallback: 'Startup' },
  { value: 'scaleup', labelKey: 'product.talent.preferences.companyTypes.scaleup', fallback: 'Scale-up' },
  { value: 'enterprise', labelKey: 'product.talent.preferences.companyTypes.enterprise', fallback: 'Enterprise' },
  { value: 'big-tech', labelKey: 'product.talent.preferences.companyTypes.bigTech', fallback: 'Big Tech' },
  { value: 'consulting', labelKey: 'product.talent.preferences.companyTypes.consulting', fallback: 'Consulting' },
  { value: 'agency', labelKey: 'product.talent.preferences.companyTypes.agency', fallback: 'Agency' },
  { value: 'government', labelKey: 'product.talent.preferences.companyTypes.government', fallback: 'Government' },
  { value: 'non-profit', labelKey: 'product.talent.preferences.companyTypes.nonProfit', fallback: 'Non-profit' },
];

function CheckboxGroup({
  options,
  selected,
  onChange,
  t,
}: {
  options: { value: string; labelKey: string; fallback: string }[];
  selected: string[];
  onChange: (values: string[]) => void;
  t: (k: string, f: string) => string;
}) {
  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter(v => v !== value) : [...selected, value]);
  };
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          onClick={() => toggle(opt.value)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            selected.includes(opt.value)
              ? 'bg-blue-50 border-blue-300 text-blue-700'
              : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
          }`}
        >
          {t(opt.labelKey, opt.fallback)}
        </button>
      ))}
    </div>
  );
}

export default function CandidatePreferencesModal({ open, onClose, resumeId, candidateName, initialPreferences, initialEmail, initialPhone, onSaved }: Props) {
  const { t } = useTranslation();
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<CandidatePreferences>({});

  useEffect(() => {
    if (open) {
      setPrefs({
        email: initialPreferences?.email || initialEmail || '',
        phone: initialPreferences?.phone || initialPhone || '',
        cities: initialPreferences?.cities || [],
        workType: initialPreferences?.workType || [],
        salaryMin: initialPreferences?.salaryMin || '',
        salaryMax: initialPreferences?.salaryMax || '',
        salaryCurrency: initialPreferences?.salaryCurrency || 'CNY',
        preferredJobTypes: initialPreferences?.preferredJobTypes || [],
        preferredCompanyTypes: initialPreferences?.preferredCompanyTypes || [],
        notes: initialPreferences?.notes || '',
      });
    }
  }, [open, initialPreferences, initialEmail, initialPhone]);

  if (!open) return null;

  const handleSave = async () => {
    setSaving(true);
    try {
      await axios.patch(`/api/v1/resumes/${resumeId}`, { preferences: prefs });
      onSaved?.(prefs);
      onClose();
    } catch {
      // silently fail
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-xl mx-4 max-h-[90vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">
              {t('product.talent.preferences.title', 'Candidate Preferences')}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{candidateName}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {/* Contact Info */}
          <div>
            <h4 className="text-sm font-semibold text-slate-800 mb-3">
              {t('product.talent.preferences.contactInfo', 'Contact Information')}
            </h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('product.talent.preferences.email', 'Email')}</label>
                <input
                  type="email"
                  value={prefs.email || ''}
                  onChange={e => setPrefs(p => ({ ...p, email: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">{t('product.talent.preferences.phone', 'Phone')}</label>
                <input
                  type="tel"
                  value={prefs.phone || ''}
                  onChange={e => setPrefs(p => ({ ...p, phone: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder={t('product.talent.preferences.phonePlaceholder', 'Enter phone number')}
                />
              </div>
            </div>
          </div>

          {/* Working Cities */}
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">
              {t('product.talent.preferences.cities', 'Preferred Cities')}
            </label>
            <input
              type="text"
              value={(prefs.cities || []).join(', ')}
              onChange={e => setPrefs(p => ({ ...p, cities: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder={t('product.talent.preferences.citiesPlaceholder', 'e.g. Beijing, Shanghai, Shenzhen')}
            />
            <p className="text-[11px] text-slate-400 mt-1">{t('product.talent.preferences.commaSeparated', 'Separate with commas')}</p>
          </div>

          {/* Work Type */}
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-2">
              {t('product.talent.preferences.workType', 'Work Type')}
            </label>
            <CheckboxGroup options={WORK_TYPES} selected={prefs.workType || []} onChange={v => setPrefs(p => ({ ...p, workType: v }))} t={t} />
          </div>

          {/* Salary Range */}
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">
              {t('product.talent.preferences.salary', 'Expected Salary Range')}
            </label>
            <div className="flex items-center gap-2">
              <select
                value={prefs.salaryCurrency || 'CNY'}
                onChange={e => setPrefs(p => ({ ...p, salaryCurrency: e.target.value }))}
                className="rounded-lg border border-slate-200 px-2 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 w-20"
              >
                <option value="CNY">CNY</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
                <option value="GBP">GBP</option>
                <option value="JPY">JPY</option>
                <option value="TWD">TWD</option>
              </select>
              <input
                type="text"
                value={prefs.salaryMin || ''}
                onChange={e => setPrefs(p => ({ ...p, salaryMin: e.target.value }))}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder={t('product.talent.preferences.salaryMin', 'Min')}
              />
              <span className="text-slate-400">—</span>
              <input
                type="text"
                value={prefs.salaryMax || ''}
                onChange={e => setPrefs(p => ({ ...p, salaryMax: e.target.value }))}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder={t('product.talent.preferences.salaryMax', 'Max')}
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">{t('product.talent.preferences.salaryHint', 'Monthly or annual — enter as you prefer')}</p>
          </div>

          {/* Preferred Job Types */}
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-2">
              {t('product.talent.preferences.preferredJobs', 'Preferred Job Types')}
            </label>
            <CheckboxGroup options={JOB_TYPES} selected={prefs.preferredJobTypes || []} onChange={v => setPrefs(p => ({ ...p, preferredJobTypes: v }))} t={t} />
          </div>

          {/* Preferred Company Types */}
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-2">
              {t('product.talent.preferences.preferredCompanies', 'Preferred Company Types')}
            </label>
            <CheckboxGroup options={COMPANY_TYPES} selected={prefs.preferredCompanyTypes || []} onChange={v => setPrefs(p => ({ ...p, preferredCompanyTypes: v }))} t={t} />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-semibold text-slate-800 mb-1.5">
              {t('product.talent.preferences.additionalNotes', 'Additional Notes')}
            </label>
            <textarea
              value={prefs.notes || ''}
              onChange={e => setPrefs(p => ({ ...p, notes: e.target.value }))}
              rows={3}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y"
              placeholder={t('product.talent.preferences.notesPlaceholder', 'Any other preferences or notes...')}
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl flex justify-end gap-3 shrink-0">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors"
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors inline-flex items-center gap-2"
          >
            {saving && <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />}
            {saving ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
          </button>
        </div>
      </div>
    </div>
  );
}
