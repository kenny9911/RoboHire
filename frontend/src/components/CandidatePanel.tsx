import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import axios from '../lib/axios';
import {
  X,
  Loader2,
  Mail,
  Phone,
  Briefcase,
  GraduationCap,
  ExternalLink,
  ChevronRight,
  MapPin,
  Star,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface MatchResult {
  id: string;
  resumeId: string;
  score: number | null;
  grade: string | null;
  status: string;
  matchData: any;
  createdAt: string;
  appliedAt?: string | null;
  resume: {
    id: string;
    name: string;
    email: string | null;
    currentRole: string | null;
    experienceYears: string | null;
    tags: string[];
  };
}

interface ResumeDetail {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  currentRole: string | null;
  experienceYears: string | null;
  summary: string | null;
  highlight: string | null;
  tags: string[];
  createdAt: string;
  parsedData: {
    summary?: string;
    address?: string;
    location?: string;
    skills?: string[] | {
      technical?: string[];
      soft?: string[];
      tools?: string[];
      frameworks?: string[];
      languages?: string[];
      other?: string[];
    };
    experience?: Array<{
      company: string;
      role: string;
      duration?: string;
      startDate?: string;
      endDate?: string;
      highlights?: string[];
    }>;
    education?: Array<{
      institution: string;
      degree?: string;
      field?: string;
      location?: string;
    }>;
    languages?: Array<{ language: string; proficiency?: string }>;
  } | null;
}

interface CandidatePanelProps {
  match: MatchResult;
  onClose: () => void;
  onStatusChange?: (matchId: string, newStatus: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const GRADE_COLORS: Record<string, string> = {
  'A+': 'bg-emerald-100 text-emerald-700 border-emerald-300',
  A: 'bg-emerald-100 text-emerald-700 border-emerald-300',
  'B+': 'bg-blue-100 text-blue-700 border-blue-300',
  B: 'bg-blue-100 text-blue-700 border-blue-300',
  C: 'bg-amber-100 text-amber-700 border-amber-300',
  D: 'bg-orange-100 text-orange-700 border-orange-300',
  F: 'bg-red-100 text-red-700 border-red-300',
};

const STATUS_OPTIONS = ['new', 'reviewed', 'shortlisted', 'rejected', 'invited'] as const;

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-slate-100 text-slate-700',
  reviewed: 'bg-blue-100 text-blue-700',
  shortlisted: 'bg-green-100 text-green-700',
  applied: 'bg-indigo-100 text-indigo-700',
  rejected: 'bg-red-100 text-red-700',
  invited: 'bg-purple-100 text-purple-700',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getSkillsList(parsedData: ResumeDetail['parsedData']): string[] {
  if (!parsedData?.skills) return [];
  if (Array.isArray(parsedData.skills)) return parsedData.skills;
  const s = parsedData.skills;
  return [
    ...(s.technical || []),
    ...(s.tools || []),
    ...(s.frameworks || []),
    ...(s.languages || []),
    ...(s.soft || []),
    ...(s.other || []),
  ];
}

function getInitials(name: string): string {
  return name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);
}

function getScoreColor(score: number): string {
  if (score >= 80) return 'text-emerald-600';
  if (score >= 60) return 'text-amber-600';
  return 'text-red-600';
}

function getScoreBarColor(score: number): string {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-amber-500';
  return 'bg-red-500';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function CandidatePanel({ match, onClose, onStatusChange }: CandidatePanelProps) {
  const { t } = useTranslation();
  const [resume, setResume] = useState<ResumeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'analysis'>('overview');
  const [statusUpdating, setStatusUpdating] = useState(false);

  // Fetch full resume data
  useEffect(() => {
    setLoading(true);
    setActiveTab('overview');
    axios.get(`/api/v1/resumes/${match.resumeId}`)
      .then((res) => { if (res.data.success) setResume(res.data.data); })
      .catch(() => { /* silent */ })
      .finally(() => setLoading(false));
  }, [match.resumeId]);

  // Close on Escape
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  const handleStatusChange = useCallback(async (newStatus: string) => {
    if (statusUpdating || newStatus === match.status) return;
    setStatusUpdating(true);
    try {
      const res = await axios.patch(`/api/v1/matching/results/${match.id}`, { status: newStatus });
      if (res.data.success) onStatusChange?.(match.id, newStatus);
    } catch { /* silent */ }
    finally { setStatusUpdating(false); }
  }, [match.id, match.status, statusUpdating, onStatusChange]);

  const skills = resume ? getSkillsList(resume.parsedData) : [];
  const matchData = match.matchData;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30 transition-opacity" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg flex flex-col bg-white shadow-2xl animate-slide-in-right">
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-slate-200 px-5 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700">
            {getInitials(match.resume.name)}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-slate-900 truncate">{match.resume.name}</h2>
            {match.resume.currentRole && (
              <p className="text-sm text-slate-500 truncate">{match.resume.currentRole}</p>
            )}
          </div>
          {/* Score + Grade */}
          <div className="flex items-center gap-2 shrink-0">
            {match.score != null && (
              <span className={`text-lg font-bold ${getScoreColor(match.score)}`}>{match.score}</span>
            )}
            {match.grade && (
              <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${GRADE_COLORS[match.grade] || 'bg-slate-100 text-slate-600 border-slate-300'}`}>
                {match.grade}
              </span>
            )}
          </div>
          <button onClick={onClose} className="shrink-0 rounded-lg p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Status bar */}
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-2.5 overflow-x-auto">
          <span className="text-xs text-slate-500 shrink-0">{t('product.jobDetail.status', 'Status')}:</span>
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              onClick={() => handleStatusChange(s)}
              disabled={statusUpdating}
              className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                match.status === s
                  ? STATUS_COLORS[s] + ' ring-1 ring-offset-1 ring-current'
                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
              } disabled:opacity-50`}
            >
              {t(`product.matchStatus.${s}`, s)}
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-5">
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'overview'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t('product.candidatePanel.overview', 'Overview')}
          </button>
          <button
            onClick={() => setActiveTab('analysis')}
            className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'analysis'
                ? 'border-blue-600 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t('product.candidatePanel.matchAnalysis', 'Match Analysis')}
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : activeTab === 'overview' ? (
            <OverviewTab resume={resume} skills={skills} />
          ) : (
            <AnalysisTab matchData={matchData} />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-between">
          <Link
            to={`/product/talent/${match.resumeId}`}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 transition-colors"
          >
            {t('product.candidatePanel.viewFullProfile', 'View Full Profile')}
            <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Overview Tab
// ---------------------------------------------------------------------------
function OverviewTab({ resume, skills }: { resume: ResumeDetail | null; skills: string[] }) {
  const { t } = useTranslation();
  if (!resume) return <p className="text-sm text-slate-500">{t('product.candidatePanel.noData', 'No resume data available')}</p>;

  return (
    <div className="space-y-5">
      {/* Contact */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {resume.email && (
          <a href={`mailto:${resume.email}`} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-blue-600 transition-colors">
            <Mail className="h-3.5 w-3.5" />{resume.email}
          </a>
        )}
        {resume.phone && (
          <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
            <Phone className="h-3.5 w-3.5" />{resume.phone}
          </span>
        )}
        {resume.parsedData?.location && (
          <span className="inline-flex items-center gap-1.5 text-sm text-slate-600">
            <MapPin className="h-3.5 w-3.5" />{resume.parsedData.location}
          </span>
        )}
      </div>

      {/* AI Summary */}
      {(resume.summary || resume.highlight) && (
        <div className="rounded-lg bg-slate-800 p-4">
          {resume.highlight && <p className="text-sm font-medium text-blue-300 mb-1">{resume.highlight}</p>}
          {resume.summary && <p className="text-sm text-slate-300 leading-relaxed">{resume.summary}</p>}
        </div>
      )}

      {/* Skills */}
      {skills.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            {t('product.candidatePanel.skills', 'Skills')}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {skills.slice(0, 15).map((skill) => (
              <span key={skill} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">{skill}</span>
            ))}
            {skills.length > 15 && (
              <span className="rounded-md bg-slate-50 px-2 py-0.5 text-xs text-slate-400">+{skills.length - 15}</span>
            )}
          </div>
        </div>
      )}

      {/* Experience */}
      {resume.parsedData?.experience && resume.parsedData.experience.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            {t('product.candidatePanel.experience', 'Experience')}
          </h4>
          <div className="space-y-3">
            {resume.parsedData.experience.slice(0, 4).map((exp, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Briefcase className="h-3.5 w-3.5" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">{exp.role}</p>
                  <p className="text-xs text-slate-500">{exp.company}{exp.duration ? ` \u00b7 ${exp.duration}` : ''}</p>
                  {exp.highlights && exp.highlights.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {exp.highlights.slice(0, 2).map((h, j) => (
                        <li key={j} className="text-xs text-slate-500 flex items-start gap-1">
                          <ChevronRight className="h-3 w-3 mt-0.5 shrink-0 text-slate-400" />
                          <span className="line-clamp-2">{h}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Education */}
      {resume.parsedData?.education && resume.parsedData.education.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            {t('product.candidatePanel.education', 'Education')}
          </h4>
          <div className="space-y-2">
            {resume.parsedData.education.map((edu, i) => (
              <div key={i} className="flex items-start gap-3">
                <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                  <GraduationCap className="h-3.5 w-3.5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-900">{edu.institution}</p>
                  <p className="text-xs text-slate-500">
                    {[edu.degree, edu.field].filter(Boolean).join(' \u00b7 ')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Languages */}
      {resume.parsedData?.languages && resume.parsedData.languages.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            {t('product.candidatePanel.languages', 'Languages')}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {resume.parsedData.languages.map((lang, i) => (
              <span key={i} className="rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                {lang.language}{lang.proficiency ? ` (${lang.proficiency})` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Tags */}
      {resume.tags && resume.tags.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            {t('product.candidatePanel.tags', 'Tags')}
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {resume.tags.map((tag) => (
              <span key={tag} className="rounded-md bg-blue-50 px-2 py-0.5 text-xs text-blue-700">{tag}</span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analysis Tab
// ---------------------------------------------------------------------------
function AnalysisTab({ matchData }: { matchData: any }) {
  const { t } = useTranslation();

  if (!matchData) {
    return <p className="text-sm text-slate-500 py-8 text-center">{t('product.candidatePanel.noAnalysis', 'No match analysis available')}</p>;
  }

  const overallFit = matchData.overallFit;
  const skillMatch = matchData.skillMatch;
  const mustHave = matchData.mustHaveAnalysis;
  const experienceMatch = matchData.experienceMatch;
  const breakdown = matchData.overallMatchScore?.breakdown;

  return (
    <div className="space-y-5">
      {/* Overall verdict */}
      {overallFit && (
        <div className="rounded-lg border border-slate-200 p-4">
          <h4 className="text-sm font-semibold text-slate-900 mb-2">
            {t('product.candidatePanel.verdict', 'Verdict')}
          </h4>
          <p className="text-sm text-slate-600 leading-relaxed">{overallFit.summary}</p>
          {overallFit.topReasons && overallFit.topReasons.length > 0 && (
            <ul className="mt-2 space-y-1">
              {overallFit.topReasons.map((reason: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                  <Star className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-500" />
                  {reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Score breakdown */}
      {breakdown && (
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
            {t('product.candidatePanel.scoreBreakdown', 'Score Breakdown')}
          </h4>
          <div className="space-y-3">
            {[
              { label: t('product.candidatePanel.skillScore', 'Skill Match'), score: breakdown.skillMatchScore, weight: breakdown.skillMatchWeight },
              { label: t('product.candidatePanel.experienceScore', 'Experience'), score: breakdown.experienceScore, weight: breakdown.experienceWeight },
              { label: t('product.candidatePanel.potentialScore', 'Potential'), score: breakdown.potentialScore, weight: breakdown.potentialWeight },
            ].filter((item) => item.score != null).map((item) => (
              <div key={item.label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-slate-700">{item.label}</span>
                  <span className="text-sm font-semibold text-slate-900">{item.score}<span className="text-xs text-slate-400 ml-1">({item.weight}%)</span></span>
                </div>
                <div className="h-1.5 w-full rounded-full bg-slate-100">
                  <div className={`h-1.5 rounded-full ${getScoreBarColor(item.score)}`} style={{ width: `${item.score}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Must-have requirements */}
      {mustHave && (
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            {t('product.candidatePanel.hardRequirements', 'Hard Requirements')}
          </h4>
          <div className="space-y-1.5">
            {(Array.isArray(mustHave) ? mustHave : mustHave.items || []).map((item: any, i: number) => {
              const met = item.met ?? item.passed ?? item.match;
              return (
                <div key={i} className="flex items-start gap-2 text-sm">
                  {met ? (
                    <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0 text-green-500" />
                  ) : met === false ? (
                    <XCircle className="h-4 w-4 mt-0.5 shrink-0 text-red-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-amber-500" />
                  )}
                  <span className="text-slate-700">{item.requirement || item.name || item.description}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Skill match */}
      {skillMatch && (
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            {t('product.candidatePanel.skillMatch', 'Skill Match')}
          </h4>
          {skillMatch.matchedSkills && skillMatch.matchedSkills.length > 0 && (
            <div className="mb-2">
              <p className="text-xs text-slate-500 mb-1">{t('product.candidatePanel.matched', 'Matched')}</p>
              <div className="flex flex-wrap gap-1">
                {skillMatch.matchedSkills.map((s: string, i: number) => (
                  <span key={i} className="rounded bg-green-50 px-2 py-0.5 text-xs text-green-700">{s}</span>
                ))}
              </div>
            </div>
          )}
          {skillMatch.missingSkills && skillMatch.missingSkills.length > 0 && (
            <div>
              <p className="text-xs text-slate-500 mb-1">{t('product.candidatePanel.missing', 'Missing')}</p>
              <div className="flex flex-wrap gap-1">
                {skillMatch.missingSkills.map((s: string, i: number) => (
                  <span key={i} className="rounded bg-red-50 px-2 py-0.5 text-xs text-red-700">{s}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Experience match */}
      {experienceMatch && (
        <div>
          <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            {t('product.candidatePanel.experienceMatch', 'Experience Match')}
          </h4>
          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 space-y-1">
            {experienceMatch.requiredYears != null && (
              <p>{t('product.candidatePanel.required', 'Required')}: {experienceMatch.requiredYears} {t('product.candidatePanel.years', 'years')}</p>
            )}
            {experienceMatch.candidateYears != null && (
              <p>{t('product.candidatePanel.actual', 'Actual')}: {experienceMatch.candidateYears} {t('product.candidatePanel.years', 'years')}</p>
            )}
            {experienceMatch.assessment && <p className="text-slate-500 italic">{experienceMatch.assessment}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
