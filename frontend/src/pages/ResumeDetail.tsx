import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from '../lib/axios';
import SEO from '../components/SEO';
import ResumeUploadModal from '../components/ResumeUploadModal';

type Tab = 'overview' | 'insights' | 'jobfit' | 'notes';

interface ResumeData {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  currentRole: string | null;
  experienceYears: string | null;
  resumeText: string;
  parsedData: Record<string, unknown> | null;
  insightData: Record<string, unknown> | null;
  jobFitData: Record<string, unknown> | null;
  fileName: string | null;
  status: string;
  tags: string[];
  notes: string | null;
  createdAt: string;
  resumeJobFits: Array<{
    fitScore: number | null;
    fitGrade: string | null;
    fitData: Record<string, unknown> | null;
    hiringRequest: { id: string; title: string; status: string };
  }>;
}

export default function ResumeDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [resume, setResume] = useState<ResumeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [insightLoading, setInsightLoading] = useState(false);
  const [jobFitLoading, setJobFitLoading] = useState(false);
  const [notesValue, setNotesValue] = useState('');
  const [tagsValue, setTagsValue] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [replaceUploadOpen, setReplaceUploadOpen] = useState(false);

  const fetchResume = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const res = await axios.get(`/api/v1/resumes/${id}`);
      if (res.data.success) {
        setResume(res.data.data);
        setNotesValue(res.data.data.notes || '');
        setTagsValue((res.data.data.tags || []).join(', '));
      } else {
        setError(res.data.error || 'Not found');
      }
    } catch (err) {
      setError(axios.isAxiosError(err) ? err.response?.data?.error || err.message : 'Failed to load resume');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchResume();
  }, [fetchResume]);

  const generateInsights = async (force = false) => {
    if (!resume) return;
    setInsightLoading(true);
    try {
      const query = force ? '?force=true' : '';
      const res = await axios.post(`/api/v1/resumes/${resume.id}/insights${query}`);
      if (res.data.success) {
        setResume(prev => prev ? { ...prev, insightData: res.data.data } : prev);
      }
    } catch (err) {
      console.error('Insight error:', err);
    } finally {
      setInsightLoading(false);
    }
  };

  const analyzeJobFit = async () => {
    if (!resume) return;
    setJobFitLoading(true);
    try {
      const res = await axios.post(`/api/v1/resumes/${resume.id}/job-fit`);
      if (res.data.success) {
        setResume(prev => prev ? { ...prev, jobFitData: res.data.data } : prev);
      }
    } catch (err) {
      console.error('Job fit error:', err);
    } finally {
      setJobFitLoading(false);
    }
  };

  const saveNotesAndTags = async () => {
    if (!resume) return;
    setSaveStatus('saving');
    try {
      const tags = tagsValue.split(',').map(t => t.trim()).filter(Boolean);
      await axios.patch(`/api/v1/resumes/${resume.id}`, { notes: notesValue, tags });
      setResume(prev => prev ? { ...prev, notes: notesValue, tags } : prev);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch {
      setSaveStatus('idle');
    }
  };

  const handleArchive = async () => {
    if (!resume) return;
    await axios.delete(`/api/v1/resumes/${resume.id}`);
    navigate('/product/talent');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
      </div>
    );
  }

  if (error || !resume) {
    return (
      <div className="max-w-4xl mx-auto">
        <button onClick={() => navigate('/product/talent')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 mb-6">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
          {t('resumeLibrary.detail.back', 'Back to Resumes')}
        </button>
        <div className="bg-red-50 text-red-700 rounded-xl p-6 text-center">{error || 'Resume not found'}</div>
      </div>
    );
  }

  const parsed = resume.parsedData as Record<string, unknown> | null;

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: t('resumeLibrary.detail.tabs.overview', 'Overview') },
    { key: 'insights', label: t('resumeLibrary.detail.tabs.insights', 'AI Insights') },
    { key: 'jobfit', label: t('resumeLibrary.detail.tabs.jobFit', 'Job Fit') },
    { key: 'notes', label: t('resumeLibrary.detail.tabs.notes', 'Notes & Tags') },
  ];

  return (
    <div className="max-w-5xl mx-auto">
      <SEO title={`${resume.name} - Resume`} noIndex />

      {/* Back */}
      <button onClick={() => navigate('/product/talent')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 mb-6">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        {t('resumeLibrary.detail.back', 'Back to Resumes')}
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">{resume.name}</h1>
            {resume.currentRole && <p className="text-sm text-gray-600 mt-1">{resume.currentRole}</p>}
            <div className="flex items-center gap-4 mt-2 text-xs text-gray-600">
              {resume.email && <span>{resume.email}</span>}
              {resume.phone && <span>{resume.phone}</span>}
              {resume.fileName && <span>{resume.fileName}</span>}
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button
              onClick={() => generateInsights(true)}
              disabled={insightLoading}
              className="text-xs text-indigo-600 hover:text-indigo-700 px-3 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 transition-colors disabled:opacity-60"
            >
              {insightLoading
                ? t('resumeLibrary.detail.actions.regeneratingInsights', 'Regenerating...')
                : t('resumeLibrary.detail.actions.regenerateInsights', 'Re-generate Insights')}
            </button>
            <button
              onClick={analyzeJobFit}
              disabled={jobFitLoading}
              className="text-xs text-blue-600 hover:text-blue-700 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 transition-colors disabled:opacity-60"
            >
              {jobFitLoading
                ? t('resumeLibrary.detail.actions.rematchingJobs', 'Re-matching...')
                : t('resumeLibrary.detail.actions.rematchJobs', 'Re-match Jobs')}
            </button>
            <button
              onClick={() => setReplaceUploadOpen(true)}
              className="text-xs text-amber-700 hover:text-amber-800 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 transition-colors"
            >
              {t('resumeLibrary.detail.actions.reupload', 'Re-upload & Overwrite')}
            </button>
            <button
              onClick={handleArchive}
              className="text-xs text-red-500 hover:text-red-700 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
            >
              {t('resumeLibrary.detail.actions.archive', 'Archive')}
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-lg border border-gray-200 p-1 mb-6">
        {tabs.map(tb => (
          <button
            key={tb.key}
            onClick={() => setTab(tb.key)}
            className={`flex-1 px-3 py-2 text-sm font-medium rounded-md transition-colors ${
              tab === tb.key ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
            }`}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'overview' && <OverviewTab parsed={parsed} t={t} />}
      {tab === 'insights' && <InsightsTab data={resume.insightData} loading={insightLoading} onGenerate={() => generateInsights(true)} t={t} />}
      {tab === 'jobfit' && <JobFitTab data={resume.jobFitData} loading={jobFitLoading} onAnalyze={analyzeJobFit} t={t} />}
      {tab === 'notes' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('resumeLibrary.notes.tags', 'Tags')}</label>
            <input
              type="text"
              value={tagsValue}
              onChange={e => setTagsValue(e.target.value)}
              placeholder={t('resumeLibrary.notes.addTag', 'e.g. senior, frontend, interviewed')}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <p className="text-xs text-gray-400 mt-1">Separate tags with commas</p>
          </div>
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">{t('resumeLibrary.notes.notes', 'Notes')}</label>
            <textarea
              value={notesValue}
              onChange={e => setNotesValue(e.target.value)}
              rows={6}
              placeholder={t('resumeLibrary.notes.notesPlaceholder', 'Add notes about this candidate...')}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y"
            />
          </div>
          <button
            onClick={saveNotesAndTags}
            disabled={saveStatus === 'saving'}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
          >
            {saveStatus === 'saving' ? t('resumeLibrary.notes.saving', 'Saving...') : saveStatus === 'saved' ? t('resumeLibrary.notes.saved', 'Saved!') : t('resumeLibrary.notes.save', 'Save')}
          </button>
        </div>
      )}

      <ResumeUploadModal
        open={replaceUploadOpen}
        onClose={() => setReplaceUploadOpen(false)}
        onUploaded={() => {
          setReplaceUploadOpen(false);
          setTab('overview');
          fetchResume();
        }}
        replaceResumeId={resume.id}
      />
    </div>
  );
}

// ─── Overview Tab ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function OverviewTab({ parsed, t }: { parsed: Record<string, unknown> | null; t: (k: string, f?: any) => string }) {
  if (!parsed) return <div className="text-center py-12 text-gray-500">No parsed data available</div>;

  const summary = parsed.summary as string | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const experience = (parsed.experience || []) as Array<Record<string, any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const education = (parsed.education || []) as Array<Record<string, any>>;
  const skills = parsed.skills as Record<string, string[]> | string[] | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const certifications = (parsed.certifications || []) as Array<Record<string, any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const projects = (parsed.projects || []) as Array<Record<string, any>>;

  const allSkills: string[] = [];
  if (Array.isArray(skills)) {
    allSkills.push(...skills);
  } else if (skills && typeof skills === 'object') {
    for (const cat of ['technical', 'soft', 'tools', 'frameworks', 'languages', 'other']) {
      if (Array.isArray(skills[cat])) allSkills.push(...skills[cat]);
    }
  }

  const [skillsExpanded, setSkillsExpanded] = useState(false);
  const SKILLS_COLLAPSE_LIMIT = 10;
  const displaySkills = allSkills.length > SKILLS_COLLAPSE_LIMIT && !skillsExpanded
    ? allSkills.slice(0, SKILLS_COLLAPSE_LIMIT)
    : allSkills;

  return (
    <div className="space-y-6">
      {/* Summary */}
      {summary && (
        <Section title={t('resumeLibrary.detail.overview.summary', 'Professional Summary')}>
          <p className="text-sm text-gray-700 leading-relaxed">{summary}</p>
        </Section>
      )}

      {/* Skills */}
      {allSkills.length > 0 && (
        <Section title={t('resumeLibrary.detail.overview.skills', 'Skills')}>
          <div className="flex flex-wrap gap-2">
            {displaySkills.map((s, i) => (
              <span key={i} className="inline-block bg-indigo-50 text-indigo-700 text-xs px-3 py-1 rounded-full">{s}</span>
            ))}
          </div>
          {allSkills.length > SKILLS_COLLAPSE_LIMIT && (
            <button
              onClick={() => setSkillsExpanded(!skillsExpanded)}
              className="mt-3 text-xs font-medium text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              {skillsExpanded
                ? t('resumeLibrary.detail.overview.showLess', 'Show less')
                : t('resumeLibrary.detail.overview.showAllSkills', { defaultValue: `Show all ${allSkills.length} skills`, count: allSkills.length })}
            </button>
          )}
        </Section>
      )}

      {/* Experience */}
      {experience.length > 0 && (
        <Section title={t('resumeLibrary.detail.overview.experience', 'Work Experience')}>
          <div className="space-y-5">
            {experience.map((exp, i) => (
              <div key={i} className="relative pl-6 border-l-2 border-indigo-200">
                <div className="absolute -left-[7px] top-1 w-3 h-3 rounded-full bg-indigo-400" />
                <div className="flex items-baseline justify-between">
                  <h4 className="text-sm font-semibold text-gray-900">{exp.role as string}</h4>
                  <span className="text-xs text-gray-500 ml-2 flex-shrink-0">{exp.startDate as string} — {exp.endDate as string}</span>
                </div>
                <p className="text-xs text-indigo-600 mb-1">{exp.company as string}{exp.location ? ` · ${exp.location}` : ''}</p>
                {exp.description && <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{exp.description as string}</p>}
                {Array.isArray(exp.achievements) && exp.achievements.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {(exp.achievements as string[]).map((a, j) => (
                      <li key={j} className="text-xs text-gray-700 flex items-start gap-1.5">
                        <span className="text-indigo-400 mt-0.5">•</span>
                        <span>{a}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {Array.isArray(exp.technologies) && exp.technologies.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {(exp.technologies as string[]).map((tech, j) => (
                      <span key={j} className="text-[10px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{tech}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Education */}
      {education.length > 0 && (
        <Section title={t('resumeLibrary.detail.overview.education', 'Education')}>
          <div className="space-y-3">
            {education.map((edu, i) => (
              <div key={i} className="flex items-start justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-gray-900">{edu.degree as string}{edu.field ? ` in ${edu.field}` : ''}</h4>
                  <p className="text-xs text-gray-600">{edu.institution as string}</p>
                  {edu.gpa && <p className="text-xs text-gray-500">GPA: {edu.gpa as string}</p>}
                </div>
                <span className="text-xs text-gray-500">{edu.endDate as string}</span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Certifications */}
      {certifications.length > 0 && (
        <Section title={t('resumeLibrary.detail.overview.certifications', 'Certifications')}>
          <div className="space-y-2">
            {certifications.map((c, i) => (
              <div key={i} className="text-sm">
                <span className="font-medium text-gray-800">{c.name as string}</span>
                {c.issuer && <span className="text-gray-600"> — {c.issuer as string}</span>}
                {c.date && <span className="text-xs text-gray-500 ml-2">({c.date as string})</span>}
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Projects */}
      {projects.length > 0 && (
        <Section title={t('resumeLibrary.detail.overview.projects', 'Projects')}>
          <div className="space-y-3">
            {projects.map((p, i) => (
              <div key={i}>
                <h4 className="text-sm font-semibold text-gray-900">{p.name as string}</h4>
                {p.description && <p className="text-xs text-gray-700 mt-1">{p.description as string}</p>}
                {Array.isArray(p.technologies) && p.technologies.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(p.technologies as string[]).map((tech, j) => (
                      <span key={j} className="text-[10px] bg-gray-100 text-gray-700 px-2 py-0.5 rounded">{tech}</span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

// ─── Insights Tab ────────────────────────────────────────────────────────

function InsightsTab({ data, loading, onGenerate, t }: { data: Record<string, unknown> | null; loading: boolean; onGenerate: () => void; t: (k: string, f: string) => string }) {
  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4" />
        <p className="text-sm text-gray-500">{t('resumeLibrary.insights.generating', 'Analyzing resume...')}</p>
        <p className="text-xs text-gray-500 mt-1">{t('resumeLibrary.insights.generatingDesc', 'This may take 10-15 seconds')}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16">
        <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        <button onClick={onGenerate} className="px-6 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">
          {t('resumeLibrary.insights.generate', 'Generate AI Insights')}
        </button>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const insight = data as Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const trajectory = insight.careerTrajectory as Record<string, any> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const salary = insight.salaryEstimate as Record<string, any> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const market = insight.marketCompetitiveness as Record<string, any> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sd = insight.strengthsAndDevelopment as Record<string, any> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const culture = insight.cultureFitIndicators as Record<string, any> | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const redFlags = (insight.redFlags || []) as Array<Record<string, any>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const roles = (insight.recommendedRoles || []) as Array<Record<string, any>>;

  const directionColor = (d: string) => {
    if (d === 'Upward') return 'bg-emerald-100 text-emerald-700';
    if (d === 'Career Change') return 'bg-blue-100 text-blue-700';
    if (d === 'Declining') return 'bg-red-100 text-red-700';
    return 'bg-gray-100 text-gray-700';
  };

  const scoreColor = (s: number) => {
    if (s >= 80) return 'text-emerald-600';
    if (s >= 60) return 'text-amber-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      {/* Executive Summary */}
      {insight.executiveSummary && (
        <Section title={t('resumeLibrary.insights.executiveSummary', 'Executive Summary')}>
          <p className="text-sm text-gray-700 leading-relaxed">{insight.executiveSummary as string}</p>
        </Section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Career Trajectory */}
        {trajectory && (
          <Section title={t('resumeLibrary.insights.careerTrajectory', 'Career Trajectory')}>
            <span className={`inline-block text-xs font-medium px-3 py-1 rounded-full mb-3 ${directionColor(trajectory.direction as string)}`}>
              {trajectory.direction as string}
            </span>
            <p className="text-sm text-gray-700 mb-2">{trajectory.analysis as string}</p>
            {trajectory.progressionRate && (
              <p className="text-xs text-gray-500"><strong>Rate:</strong> {trajectory.progressionRate as string}</p>
            )}
            {Array.isArray(trajectory.keyTransitions) && trajectory.keyTransitions.length > 0 && (
              <div className="mt-2">
                <p className="text-xs font-medium text-gray-500 mb-1">Key Transitions:</p>
                <ul className="space-y-1">
                  {(trajectory.keyTransitions as string[]).map((tr, i) => (
                    <li key={i} className="text-xs text-gray-600 flex items-start gap-1.5"><span className="text-indigo-400">•</span>{tr}</li>
                  ))}
                </ul>
              </div>
            )}
          </Section>
        )}

        {/* Salary Estimate */}
        {salary && (
          <Section title={t('resumeLibrary.insights.salaryEstimate', 'Salary Estimate')}>
            <div className="text-center mb-3">
              <span className="text-2xl font-bold text-gray-900">{salary.rangeLow as string}</span>
              <span className="text-gray-400 mx-2">—</span>
              <span className="text-2xl font-bold text-gray-900">{salary.rangeHigh as string}</span>
              <span className="text-xs text-gray-500 ml-2">{salary.currency as string}</span>
            </div>
            <span className={`inline-block text-xs px-2 py-0.5 rounded-full mb-2 ${
              salary.confidence === 'High' ? 'bg-emerald-100 text-emerald-700' : salary.confidence === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {salary.confidence as string} confidence
            </span>
            {salary.marketContext && <p className="text-xs text-gray-500 mt-2">{salary.marketContext as string}</p>}
          </Section>
        )}

        {/* Market Competitiveness */}
        {market && (
          <Section title={t('resumeLibrary.insights.marketCompetitiveness', 'Market Competitiveness')}>
            <div className="flex items-center gap-3 mb-3">
              <span className={`text-3xl font-bold ${scoreColor(market.score as number)}`}>{market.score as number}</span>
              <span className="text-sm text-gray-600">/100 — {market.level as string}</span>
            </div>
            {Array.isArray(market.inDemandSkills) && market.inDemandSkills.length > 0 && (
              <div className="mb-2">
                <p className="text-xs font-medium text-emerald-600 mb-1">In-Demand Skills:</p>
                <div className="flex flex-wrap gap-1">
                  {(market.inDemandSkills as string[]).map((s, i) => <span key={i} className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">{s}</span>)}
                </div>
              </div>
            )}
            {Array.isArray(market.rareSkills) && market.rareSkills.length > 0 && (
              <div>
                <p className="text-xs font-medium text-indigo-600 mb-1">Rare Skills:</p>
                <div className="flex flex-wrap gap-1">
                  {(market.rareSkills as string[]).map((s, i) => <span key={i} className="text-[11px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-full">{s}</span>)}
                </div>
              </div>
            )}
          </Section>
        )}

        {/* Culture Fit */}
        {culture && (
          <Section title={t('resumeLibrary.insights.cultureFit', 'Culture Fit Indicators')}>
            {Array.isArray(culture.workStyle) && culture.workStyle.length > 0 && (
              <div className="mb-2"><span className="text-xs font-medium text-gray-500">Work Style: </span>{(culture.workStyle as string[]).join(', ')}</div>
            )}
            {Array.isArray(culture.values) && culture.values.length > 0 && (
              <div className="mb-2"><span className="text-xs font-medium text-gray-500">Values: </span>{(culture.values as string[]).join(', ')}</div>
            )}
            {culture.managementStyle && (
              <div><span className="text-xs font-medium text-gray-500">Management: </span>{culture.managementStyle as string}</div>
            )}
          </Section>
        )}
      </div>

      {/* Strengths & Development */}
      {sd && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Section title={t('resumeLibrary.insights.strengths', 'Core Strengths')}>
            {Array.isArray(sd.coreStrengths) && (sd.coreStrengths as Array<Record<string, string>>).map((s, i) => (
              <div key={i} className="mb-3 last:mb-0">
                <h4 className="text-sm font-semibold text-emerald-700">{s.strength}</h4>
                <p className="text-xs text-gray-600 mt-0.5">{s.evidence}</p>
                <p className="text-xs text-gray-500 mt-0.5">Impact: {s.impact}</p>
              </div>
            ))}
          </Section>
          <Section title={t('resumeLibrary.insights.development', 'Development Areas')}>
            {Array.isArray(sd.developmentAreas) && (sd.developmentAreas as Array<Record<string, string>>).map((d, i) => (
              <div key={i} className="mb-3 last:mb-0">
                <h4 className="text-sm font-semibold text-amber-700">{d.area}</h4>
                <p className="text-xs text-gray-600 mt-0.5">Current: {d.currentLevel}</p>
                <p className="text-xs text-gray-500 mt-0.5">{d.recommendation}</p>
              </div>
            ))}
          </Section>
        </div>
      )}

      {/* Red Flags */}
      {redFlags.length > 0 && (
        <Section title={t('resumeLibrary.insights.redFlags', 'Red Flags')}>
          <div className="space-y-3">
            {redFlags.map((f, i) => (
              <div key={i} className={`rounded-lg p-3 ${f.severity === 'High' ? 'bg-red-50' : f.severity === 'Medium' ? 'bg-amber-50' : 'bg-gray-50'}`}>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    f.severity === 'High' ? 'bg-red-100 text-red-700' : f.severity === 'Medium' ? 'bg-amber-100 text-amber-700' : 'bg-gray-200 text-gray-600'
                  }`}>{f.severity as string}</span>
                  <span className="text-sm font-medium text-gray-800">{f.flag as string}</span>
                </div>
                <p className="text-xs text-gray-600">{f.details as string}</p>
                {f.mitigatingFactors && <p className="text-xs text-gray-500 mt-1">Mitigating: {f.mitigatingFactors as string}</p>}
              </div>
            ))}
          </div>
        </Section>
      )}
      {redFlags.length === 0 && data && (
        <Section title={t('resumeLibrary.insights.redFlags', 'Red Flags')}>
          <p className="text-sm text-emerald-600">{t('resumeLibrary.insights.noRedFlags', 'No red flags identified')}</p>
        </Section>
      )}

      {/* Recommended Roles */}
      {roles.length > 0 && (
        <Section title={t('resumeLibrary.insights.recommendedRoles', 'Recommended Roles')}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {roles.map((r, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-3">
                <h4 className="text-sm font-semibold text-gray-900">{r.roleType as string}</h4>
                <p className="text-xs text-indigo-600">{r.industry as string} · {r.seniorityLevel as string}</p>
                <p className="text-xs text-gray-500 mt-1">{r.fitReason as string}</p>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Re-generate */}
      {data && (
        <div className="text-center pt-2">
          <button onClick={onGenerate} className="text-xs text-gray-400 hover:text-indigo-600 transition-colors">
            {t('resumeLibrary.insights.regenerate', 'Regenerate insights')}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Job Fit Tab ─────────────────────────────────────────────────────────

function JobFitTab({ data, loading, onAnalyze, t }: { data: Record<string, unknown> | null; loading: boolean; onAnalyze: () => void; t: (k: string, f: string) => string }) {
  if (loading) {
    return (
      <div className="text-center py-16">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-4" />
        <p className="text-sm text-gray-500">{t('resumeLibrary.jobFit.analyzing', 'Matching against your hiring requests...')}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-16">
        <svg className="w-12 h-12 mx-auto text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
        </svg>
        <button onClick={onAnalyze} className="px-6 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors">
          {t('resumeLibrary.jobFit.analyze', 'Analyze Job Fit')}
        </button>
      </div>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fitData = data as { fits?: Array<Record<string, any>>; bestFit?: Record<string, any> | null; candidateSummary?: string };
  const fits = fitData.fits || [];

  if (fits.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-sm text-gray-500 mb-2">{t('resumeLibrary.jobFit.noActiveRequests', 'No active hiring requests found')}</p>
        <p className="text-xs text-gray-500">{t('resumeLibrary.jobFit.noActiveRequestsDesc', 'Create a hiring request first to see job fit analysis')}</p>
      </div>
    );
  }

  const verdictColor = (v: string) => {
    if (v === 'Strong Fit') return 'bg-emerald-100 text-emerald-700';
    if (v === 'Good Fit') return 'bg-blue-100 text-blue-700';
    if (v === 'Moderate Fit') return 'bg-amber-100 text-amber-700';
    return 'bg-red-100 text-red-700';
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      {fitData.candidateSummary && (
        <div className="bg-indigo-50 rounded-xl p-4">
          <p className="text-sm text-indigo-800">{fitData.candidateSummary}</p>
        </div>
      )}

      {/* Best Fit */}
      {fitData.bestFit && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <span className="text-sm font-semibold text-emerald-800">{t('resumeLibrary.jobFit.bestFit', 'Best Fit')}: {fitData.bestFit.hiringRequestTitle as string}</span>
          </div>
          <p className="text-xs text-emerald-700 ml-7">{fitData.bestFit.reason as string}</p>
        </div>
      )}

      {/* Fit List */}
      <div className="space-y-4">
        {fits.map((fit, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{fit.hiringRequestTitle as string}</h3>
                <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-1 ${verdictColor(fit.verdict as string)}`}>
                  {fit.verdict as string}
                </span>
              </div>
              <div className="text-right">
                <span className={`text-2xl font-bold ${(fit.fitScore as number) >= 80 ? 'text-emerald-600' : (fit.fitScore as number) >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                  {fit.fitScore as number}
                </span>
                <span className="text-sm text-gray-500">/100</span>
                {fit.fitGrade && <p className="text-xs text-gray-500">{fit.fitGrade as string}</p>}
              </div>
            </div>

            {/* Matched / Missing */}
            <div className="grid grid-cols-2 gap-4 mb-3">
              {Array.isArray(fit.matchedSkills) && (fit.matchedSkills as string[]).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-emerald-600 mb-1">{t('resumeLibrary.jobFit.matchedSkills', 'Matched Skills')}</p>
                  <div className="flex flex-wrap gap-1">
                    {(fit.matchedSkills as string[]).slice(0, 6).map((s, j) => <span key={j} className="text-[11px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">{s}</span>)}
                  </div>
                </div>
              )}
              {Array.isArray(fit.missingCriticalSkills) && (fit.missingCriticalSkills as string[]).length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-600 mb-1">{t('resumeLibrary.jobFit.missingSkills', 'Missing Critical')}</p>
                  <div className="flex flex-wrap gap-1">
                    {(fit.missingCriticalSkills as string[]).map((s, j) => <span key={j} className="text-[11px] bg-red-50 text-red-700 px-2 py-0.5 rounded-full">{s}</span>)}
                  </div>
                </div>
              )}
            </div>

            {fit.experienceAlignment && <p className="text-xs text-gray-600 mb-2">{fit.experienceAlignment as string}</p>}

            {/* Experience Breakdown */}
            {(fit.fullTimeExperience || fit.internshipExperience) && (
              <div className="flex gap-3 mb-3">
                {fit.fullTimeExperience && (
                  <span className="text-[11px] bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full">
                    {t('resumeLibrary.jobFit.fullTime', 'Full-time')}: {fit.fullTimeExperience as string}
                  </span>
                )}
                {fit.internshipExperience && (
                  <span className="text-[11px] bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full">
                    {t('resumeLibrary.jobFit.internship', 'Internship')}: {fit.internshipExperience as string}
                  </span>
                )}
              </div>
            )}

            {/* Hard Requirement Gaps */}
            {Array.isArray(fit.hardRequirementGaps) && (fit.hardRequirementGaps as Array<Record<string, string>>).length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-red-600 mb-1.5">{t('resumeLibrary.jobFit.hardGaps', 'Hard Requirement Gaps')}</p>
                <div className="space-y-1.5">
                  {(fit.hardRequirementGaps as Array<Record<string, string>>).map((gap, j) => (
                    <div key={j} className={`text-xs rounded-lg p-2 ${
                      gap.severity === 'dealbreaker' ? 'bg-red-50 text-red-700' :
                      gap.severity === 'significant' ? 'bg-orange-50 text-orange-700' :
                      'bg-yellow-50 text-yellow-700'
                    }`}>
                      <span className="font-medium">{gap.requirement}</span>
                      <span className="text-gray-500"> — </span>
                      <span>{gap.candidateStatus}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Transferable Skills */}
            {Array.isArray(fit.transferableSkills) && (fit.transferableSkills as Array<Record<string, string>>).length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-blue-600 mb-1.5">{t('resumeLibrary.jobFit.transferable', 'Transferable Skills')}</p>
                <div className="space-y-1.5">
                  {(fit.transferableSkills as Array<Record<string, string>>).map((ts, j) => (
                    <div key={j} className="text-xs bg-blue-50 text-blue-700 rounded-lg p-2">
                      <span className="font-medium">{ts.candidateHas}</span>
                      <span className="text-gray-400 mx-1">→</span>
                      <span>{ts.required}</span>
                      {ts.relevance && <p className="text-blue-500 mt-0.5">{ts.relevance}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Top Reasons */}
            {Array.isArray(fit.topReasons) && (fit.topReasons as string[]).length > 0 && (
              <ul className="space-y-1 mb-2">
                {(fit.topReasons as string[]).map((r, j) => (
                  <li key={j} className="text-xs text-gray-600 flex items-start gap-1.5"><span className="text-indigo-400">•</span>{r}</li>
                ))}
              </ul>
            )}

            {fit.recommendation && (
              <div className="bg-gray-50 rounded-lg px-3 py-2 mt-2">
                <p className="text-xs text-gray-700"><strong>{t('resumeLibrary.jobFit.recommendation', 'Recommendation')}:</strong> {fit.recommendation as string}</p>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Re-analyze */}
      <div className="text-center pt-2">
        <button onClick={onAnalyze} className="text-xs text-gray-400 hover:text-indigo-600 transition-colors">
          {t('resumeLibrary.jobFit.reanalyze', 'Re-analyze job fit')}
        </button>
      </div>
    </div>
  );
}

// ─── Shared Section component ─────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h3 className="text-sm font-semibold text-gray-900 mb-4 pb-2 border-b border-gray-100">{title}</h3>
      <div className="text-sm text-gray-700">{children}</div>
    </div>
  );
}
