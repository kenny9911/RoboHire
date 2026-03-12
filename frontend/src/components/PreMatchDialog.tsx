import { useState, useEffect, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from '../lib/axios';

interface Resume {
  id: string;
  name: string;
  currentRole: string | null;
  experienceYears: string | null;
  tags: string[];
}

interface PreMatchConfig {
  resumeIds: string[];
  preFilter?: {
    locations?: string[];
    jobTypes?: string[];
    freeText?: string;
  };
  sessionName?: string;
}

interface PreMatchDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (config: PreMatchConfig) => void;
  jobTitle: string;
  loading: boolean;
}

const JOB_TYPES = ['full-time', 'part-time', 'contract', 'internship'];

export default function PreMatchDialog({ open, onClose, onConfirm, jobTitle, loading }: PreMatchDialogProps) {
  const { t } = useTranslation();
  const [resumes, setResumes] = useState<Resume[]>([]);
  const [loadingResumes, setLoadingResumes] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [locations, setLocations] = useState('');
  const [selectedJobTypes, setSelectedJobTypes] = useState<Set<string>>(new Set());
  const [freeText, setFreeText] = useState('');
  const [sessionName, setSessionName] = useState('');

  // Fetch resumes
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        setLoadingResumes(true);
        const res = await axios.get('/api/v1/resumes', { params: { limit: 500 } });
        const data = res.data.data || res.data.resumes || [];
        setResumes(data);
        // Select all by default
        setSelectedIds(new Set(data.map((r: Resume) => r.id)));
      } catch {
        setResumes([]);
      } finally {
        setLoadingResumes(false);
      }
    })();
  }, [open]);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setSearch('');
      setShowFilters(false);
      setLocations('');
      setSelectedJobTypes(new Set());
      setFreeText('');
      setSessionName('');
    }
  }, [open]);

  const filteredResumes = useMemo(() => {
    if (!search.trim()) return resumes;
    const q = search.toLowerCase();
    return resumes.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.currentRole?.toLowerCase().includes(q) ||
        r.tags.some((tag) => tag.toLowerCase().includes(q))
    );
  }, [resumes, search]);

  const toggleAll = useCallback(() => {
    if (selectedIds.size === filteredResumes.length) {
      // Deselect all visible
      const visibleIds = new Set(filteredResumes.map((r) => r.id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        visibleIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      // Select all visible
      setSelectedIds((prev) => {
        const next = new Set(prev);
        filteredResumes.forEach((r) => next.add(r.id));
        return next;
      });
    }
  }, [filteredResumes, selectedIds]);

  const toggleOne = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleJobType = useCallback((jt: string) => {
    setSelectedJobTypes((prev) => {
      const next = new Set(prev);
      if (next.has(jt)) next.delete(jt);
      else next.add(jt);
      return next;
    });
  }, []);

  const hasPreFilter = locations.trim() || selectedJobTypes.size > 0 || freeText.trim();

  const handleConfirm = () => {
    const config: PreMatchConfig = {
      resumeIds: Array.from(selectedIds),
    };
    if (hasPreFilter) {
      config.preFilter = {};
      if (locations.trim()) {
        config.preFilter.locations = locations.split(',').map((l) => l.trim()).filter(Boolean);
      }
      if (selectedJobTypes.size > 0) {
        config.preFilter.jobTypes = Array.from(selectedJobTypes);
      }
      if (freeText.trim()) {
        config.preFilter.freeText = freeText.trim();
      }
    }
    if (sessionName.trim()) {
      config.sessionName = sessionName.trim();
    }
    onConfirm(config);
  };

  if (!open) return null;

  const allVisibleSelected = filteredResumes.length > 0 && filteredResumes.every((r) => selectedIds.has(r.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              {t('product.matching.configureMatching', 'Configure Matching')}
            </h3>
            <p className="text-sm text-slate-500 mt-0.5">
              {t('product.matching.configureMatchingFor', 'For: {{jobTitle}}', { jobTitle })}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={loading}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-50"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Session Name */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1">
              {t('product.matching.sessionName', 'Session Name')}
              <span className="text-slate-400 font-normal ml-1">
                ({t('product.matching.optional', 'optional')})
              </span>
            </label>
            <input
              type="text"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
              placeholder={`${jobTitle} — ${new Date().toLocaleDateString()}`}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Resume Selection */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold text-slate-700">
                {t('product.matching.selectResumes', 'Select Resumes')}
              </label>
              <span className="text-xs text-slate-500">
                {t('product.matching.selectedCount', '{{count}} selected', { count: selectedIds.size })}
              </span>
            </div>

            {/* Search + Select All */}
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('product.matching.searchResumes', 'Search by name, role, or tag...')}
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
              <button
                onClick={toggleAll}
                className="shrink-0 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                {allVisibleSelected
                  ? t('product.matching.deselectAll', 'Deselect All')
                  : t('product.matching.selectAll', 'Select All')}
              </button>
            </div>

            {/* Resume List */}
            {loadingResumes ? (
              <div className="flex justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-b-2 border-blue-600" />
              </div>
            ) : resumes.length === 0 ? (
              <div className="text-center py-8 text-sm text-slate-500">
                {t('product.matching.noResumesFound', 'No resumes found. Upload resumes first.')}
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg max-h-48 overflow-y-auto divide-y divide-slate-100">
                {filteredResumes.map((resume) => (
                  <label
                    key={resume.id}
                    className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(resume.id)}
                      onChange={() => toggleOne(resume.id)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-900 truncate">{resume.name}</span>
                        {resume.currentRole && (
                          <span className="text-xs text-slate-500 truncate">{resume.currentRole}</span>
                        )}
                      </div>
                      {resume.tags.length > 0 && (
                        <div className="flex gap-1 mt-0.5 flex-wrap">
                          {resume.tags.slice(0, 4).map((tag) => (
                            <span key={tag} className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    {resume.experienceYears && (
                      <span className="text-xs text-slate-400 shrink-0">{resume.experienceYears}y</span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Advanced Filters */}
          <div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex items-center gap-1.5 text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
            >
              <svg
                className={`w-4 h-4 transition-transform ${showFilters ? 'rotate-90' : ''}`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              {t('product.matching.advancedFilters', 'Advanced Pre-Filters (AI)')}
            </button>

            {showFilters && (
              <div className="mt-3 space-y-3 pl-5 border-l-2 border-blue-100">
                <p className="text-xs text-slate-500">
                  {t('product.matching.advancedFiltersDesc', 'AI will pre-screen resumes before full matching, filtering out clearly irrelevant candidates.')}
                </p>

                {/* Locations */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t('product.matching.filterLocations', 'Preferred Locations')}
                  </label>
                  <input
                    type="text"
                    value={locations}
                    onChange={(e) => setLocations(e.target.value)}
                    placeholder={t('product.matching.filterLocationsPlaceholder', 'e.g., San Francisco, Remote, New York')}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                {/* Job Types */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t('product.matching.filterJobTypes', 'Job Types')}
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {JOB_TYPES.map((jt) => (
                      <button
                        key={jt}
                        onClick={() => toggleJobType(jt)}
                        className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                          selectedJobTypes.has(jt)
                            ? 'bg-blue-600 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {t(`product.matching.filterJobType.${jt}`, jt)}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Free Text */}
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    {t('product.matching.filterFreeText', 'Custom Filter Instructions')}
                  </label>
                  <textarea
                    value={freeText}
                    onChange={(e) => setFreeText(e.target.value)}
                    placeholder={t('product.matching.filterFreeTextPlaceholder', 'e.g., Must have 3+ years of Python experience, exclude candidates without a degree')}
                    rows={2}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
          <button
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            {t('common.cancel', 'Cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || selectedIds.size === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                {t('product.matching.starting', 'Starting...')}
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                {t('product.matching.startMatching', 'Start Matching ({{count}} resumes)', { count: selectedIds.size })}
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
