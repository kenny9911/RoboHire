import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import axios from '../../lib/axios';
import { ResumeRenderer, parsedDataToMarkdown, extractJDKeywords } from '../../components/ResumeRenderer';
import { MarkdownRenderer } from '../../components/MarkdownRenderer';
import { JdRenderer } from '../../components/JdRenderer';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface EvaluationReport {
  score: number;
  summary: string;
  strengths: string[];
  weaknesses: string[];
  recommendation: string;
  hiringDecision: string;
  skillsAssessment?: Array<{ skill: string; rating: string; evidence: string }>;
  technicalAnalysis?: {
    summary: string;
    depthRating: string;
    details: string[];
    provenSkills?: string[];
    claimedButUnverified?: string[];
    responseQuality?: string;
  };
  jdMatch?: {
    requirements: Array<{ requirement: string; matchLevel: string; score: number; explanation: string }>;
    hardRequirementsAnalysis?: Array<{ requirement: string; met: boolean; analysis: string }>;
    extraSkillsFound: string[];
    summary: string;
  };
  behavioralAnalysis?: {
    summary: string;
    compatibility: string;
    details: string[];
  };
  interviewersKit?: {
    suggestedQuestions: string[];
    focusAreas: string[];
  };
  questionAnswerAssessment?: Array<{
    question: string;
    answer: string;
    score: number;
    correctness: string;
    thoughtProcess: string;
    logicalThinking: string;
    clarity: string;
    completeness: string;
  }>;
  levelAssessment?: string;
  expertAdvice?: string;
  suitableWorkTypes?: string[];
  cheatingAnalysis?: {
    suspicionScore: number;
    riskLevel: string;
    summary: string;
    indicators: Array<{ type: string; description: string; severity: string; evidence: string }>;
    authenticitySignals: string[];
    recommendation: string;
  };
}

interface InterviewData {
  id: string;
  candidateName: string;
  candidateEmail: string | null;
  jobTitle: string | null;
  status: string;
  type: string;
  videoUrl: string | null;
  resumeUrl: string | null;
  resumeText: string | null;
  parsedResume: Record<string, unknown> | null;
  jobDescription: string | null;
  jobRequirements: string | null;
  interviewRequirements: string | null;
  transcript: string | null;
  transcriptUrl: string | null;
  evaluationData: EvaluationReport | null;
  evaluationScore: number | null;
  evaluationVerdict: string | null;
  createdAt: string;
}

interface TranscriptSegment {
  speaker: string;
  timestamp: string;
  text: string;
}

// ---------------------------------------------------------------------------
// Inline SVG Icons
// ---------------------------------------------------------------------------

const ArrowLeftIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);

const BrainIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
  </svg>
);

const SpinnerIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={`${className} animate-spin`} fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
  </svg>
);

const RefreshIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

const CheckCircleIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const XCircleIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const WarningIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
  </svg>
);

const ThumbsUpIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21H6a2 2 0 01-2-2v-7a2 2 0 012-2h1.5l2.5-5.5V3a1 1 0 011-1h.5a2 2 0 012 2v2" />
  </svg>
);

const LightbulbIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
  </svg>
);

const CodeIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
  </svg>
);

const ListCheckIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
  </svg>
);

const UsersIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const HelpCircleIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const BriefcaseIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
  </svg>
);

const ShieldAlertIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01" />
  </svg>
);

const ShieldCheckIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
  </svg>
);

const ChevronDownIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

const ChevronUpIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
  </svg>
);

const EyeIcon = ({ className = 'w-3 h-3' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

const DocumentIcon = ({ className = 'w-5 h-5' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
  </svg>
);

const ExternalLinkIcon = ({ className = 'w-4 h-4' }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Parse "MM:SS" or "HH:MM:SS" timestamp to seconds */
function parseTimestamp(ts: string): number {
  const parts = ts.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

/** Try to parse transcript as JSON segments, otherwise return null */
function tryParseTranscript(raw: string): TranscriptSegment[] | null {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0].text === 'string') {
      return parsed as TranscriptSegment[];
    }
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Cheating Analysis Section (collapsible)
// ---------------------------------------------------------------------------

function CheatingAnalysisSection({
  analysis,
  t,
}: {
  analysis: NonNullable<EvaluationReport['cheatingAnalysis']>;
  t: (key: string, fallback?: string) => any;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  const getRiskStyles = () => {
    switch (analysis.riskLevel) {
      case 'Critical':
        return {
          bg: 'bg-red-50',
          border: 'border-red-200',
          text: 'text-red-800',
          icon: 'text-red-600',
          meter: 'bg-red-500',
          badge: 'bg-red-600 text-white text-xs font-bold px-2 py-0.5 rounded',
        };
      case 'High':
        return {
          bg: 'bg-orange-50',
          border: 'border-orange-200',
          text: 'text-orange-800',
          icon: 'text-orange-600',
          meter: 'bg-orange-500',
          badge: 'bg-orange-500 text-white text-xs font-bold px-2 py-0.5 rounded',
        };
      case 'Medium':
        return {
          bg: 'bg-amber-50',
          border: 'border-amber-200',
          text: 'text-amber-800',
          icon: 'text-amber-600',
          meter: 'bg-amber-500',
          badge: 'bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded',
        };
      default:
        return {
          bg: 'bg-green-50',
          border: 'border-green-200',
          text: 'text-green-800',
          icon: 'text-green-600',
          meter: 'bg-green-500',
          badge: 'bg-green-600 text-white text-xs font-bold px-2 py-0.5 rounded',
        };
    }
  };

  const styles = getRiskStyles();

  return (
    <div className={`rounded-lg border ${styles.border} ${styles.bg} shadow-sm overflow-hidden`}>
      {/* Header - Always visible */}
      <div
        className="p-4 cursor-pointer flex items-center justify-between"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          {analysis.riskLevel === 'Low' ? (
            <ShieldCheckIcon className={`w-5 h-5 ${styles.icon}`} />
          ) : (
            <ShieldAlertIcon className={`w-5 h-5 ${styles.icon}`} />
          )}
          <div>
            <h4 className={`text-sm font-bold ${styles.text} flex items-center gap-2`}>
              {t('goHireEval.cheatingAnalysis', 'Cheating Suspicion Analysis')}
            </h4>
            <p className={`text-xs ${styles.text} opacity-75 mt-0.5`}>
              {analysis.summary.length > 100
                ? `${analysis.summary.substring(0, 100)}...`
                : analysis.summary}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Score meter */}
          <div className="flex items-center gap-2">
            <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full ${styles.meter} transition-all duration-500`}
                style={{ width: `${analysis.suspicionScore}%` }}
              />
            </div>
            <span className={`text-sm font-bold ${styles.text}`}>{analysis.suspicionScore}</span>
          </div>
          {/* Risk level badge */}
          <span className={styles.badge}>{analysis.riskLevel}</span>
          {/* Expand/collapse chevron */}
          {isExpanded ? (
            <ChevronUpIcon className={`w-4 h-4 ${styles.text}`} />
          ) : (
            <ChevronDownIcon className={`w-4 h-4 ${styles.text}`} />
          )}
        </div>
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-200 pt-4">
          {/* Full summary */}
          <div>
            <h5 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${styles.text}`}>
              {t('goHireEval.cheatingSummary', 'Summary')}
            </h5>
            <p className={`text-sm ${styles.text}`}>{analysis.summary}</p>
          </div>

          {/* Suspicious indicators */}
          {analysis.indicators.length > 0 && (
            <div>
              <h5 className={`text-xs font-semibold uppercase tracking-wider mb-2 ${styles.text}`}>
                <EyeIcon className="w-3 h-3 inline mr-1" />
                {t('goHireEval.cheatingIndicators', 'Suspicious Indicators')}
              </h5>
              <div className="space-y-2">
                {analysis.indicators.map((indicator, idx) => (
                  <div
                    key={idx}
                    className="bg-white rounded-lg p-3 border border-gray-100"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-semibold text-gray-700">
                        {indicator.type}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded border font-medium ${
                          indicator.severity === 'High'
                            ? 'border-red-300 text-red-600 bg-red-50'
                            : indicator.severity === 'Medium'
                            ? 'border-amber-300 text-amber-600 bg-amber-50'
                            : 'border-gray-300 text-gray-600 bg-gray-50'
                        }`}
                      >
                        {indicator.severity}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mb-2">{indicator.description}</p>
                    {indicator.evidence && (
                      <div className="text-xs italic text-gray-500 bg-gray-50 p-2 rounded border-l-2 border-gray-300">
                        &ldquo;{indicator.evidence}&rdquo;
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {analysis.indicators.length === 0 && (
            <div className="text-sm text-green-600 flex items-center gap-2">
              <CheckCircleIcon className="w-4 h-4" />
              {t('goHireEval.noIndicators', 'No suspicious indicators detected')}
            </div>
          )}

          {/* Authenticity signals */}
          {analysis.authenticitySignals.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold uppercase tracking-wider mb-2 text-green-700">
                <ShieldCheckIcon className="w-3 h-3 inline mr-1" />
                {t('goHireEval.authenticitySignals', 'Authenticity Signals')}
              </h5>
              <ul className="space-y-1">
                {analysis.authenticitySignals.map((signal, idx) => (
                  <li key={idx} className="text-xs text-green-700 flex items-start gap-2">
                    <CheckCircleIcon className="w-3 h-3 mt-0.5 flex-none" />
                    <span>{signal}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Recommendation */}
          <div className={`p-3 rounded-lg ${styles.bg} border ${styles.border}`}>
            <h5 className={`text-xs font-semibold uppercase tracking-wider mb-1 ${styles.text}`}>
              {t('goHireEval.cheatingRecommendation', 'Recommendation')}
            </h5>
            <p className={`text-sm font-medium ${styles.text}`}>{analysis.recommendation}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function GoHireEvaluation() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const videoRef = useRef<HTMLVideoElement>(null);

  const [interview, setInterview] = useState<InterviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'resume' | 'jd' | 'transcript'>('jd');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isParsingResume, setIsParsingResume] = useState(false);
  const [parsedResumeMarkdown, setParsedResumeMarkdown] = useState<string | null>(null);
  const [resumeParseError, setResumeParseError] = useState<string | null>(null);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcribeError, setTranscribeError] = useState<string | null>(null);
  const [isLoadingTranscript, setIsLoadingTranscript] = useState(false);
  const [loadTranscriptError, setLoadTranscriptError] = useState<string | null>(null);

  // Fetch interview data
  useEffect(() => {
    if (!id) return;
    setLoading(true);
    axios
      .get(`/api/v1/gohire-interviews/${id}`)
      .then((res) => {
        setInterview(res.data.data);
      })
      .catch((err) => {
        setError(err.response?.data?.error || t('goHireEval.fetchError', 'Failed to load interview'));
      })
      .finally(() => setLoading(false));
  }, [id, t]);

  // Generate / re-generate evaluation
  const handleGenerateEvaluation = useCallback(async () => {
    if (!id || isGenerating) return;
    setIsGenerating(true);
    try {
      const res = await axios.post(`/api/v1/gohire-interviews/${id}/evaluate`, {
        language: 'zh-CN',
      });
      if (res.data.success && res.data.data) {
        setInterview((prev) =>
          prev
            ? {
                ...prev,
                evaluationData: res.data.data.evaluationData,
                evaluationScore: res.data.data.evaluationScore,
                evaluationVerdict: res.data.data.evaluationVerdict,
              }
            : prev,
        );
      }
    } catch (err) {
      console.error('Evaluation generation failed', err);
    } finally {
      setIsGenerating(false);
    }
  }, [id, isGenerating]);

  // Transcribe video via ASR
  const handleTranscribe = useCallback(async () => {
    if (!id || isTranscribing) return;
    setIsTranscribing(true);
    setTranscribeError(null);
    try {
      const res = await axios.post(`/api/v1/gohire-interviews/${id}/transcribe`);
      if (res.data.success && res.data.data) {
        setInterview((prev) =>
          prev ? { ...prev, transcript: JSON.stringify(res.data.data.segments) } : prev,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Transcription failed';
      setTranscribeError(msg);
      console.error('Transcription failed', err);
    } finally {
      setIsTranscribing(false);
    }
  }, [id, isTranscribing]);

  // Load pre-transcribed dialog from transcriptUrl
  const handleLoadTranscript = useCallback(async () => {
    if (!id || isLoadingTranscript) return;
    setIsLoadingTranscript(true);
    setLoadTranscriptError(null);
    try {
      const res = await axios.post(`/api/v1/gohire-interviews/${id}/load-transcript`);
      if (res.data.success && res.data.data) {
        setInterview((prev) =>
          prev ? { ...prev, transcript: JSON.stringify(res.data.data.segments) } : prev,
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load transcript';
      setLoadTranscriptError(msg);
      console.error('Load transcript failed', err);
    } finally {
      setIsLoadingTranscript(false);
    }
  }, [id, isLoadingTranscript]);

  // Seek video to timestamp
  const seekTo = useCallback((ts: string) => {
    if (videoRef.current) {
      videoRef.current.currentTime = parseTimestamp(ts);
      videoRef.current.play().catch(() => {});
    }
  }, []);

  // Build JD data for JdRenderer — parse Chinese section markers like 【职位概述】【主要职责】【任职要求】
  const jdData = useMemo(() => {
    if (!interview) return null;
    const raw = interview.jobDescription || '';
    // Try splitting by 【...】 section markers
    const sectionRegex = /【([^】]+)】/g;
    const sections: Record<string, string> = {};
    let match: RegExpExecArray | null;
    const markers: { key: string; start: number; headerEnd: number }[] = [];

    while ((match = sectionRegex.exec(raw)) !== null) {
      markers.push({ key: match[1], start: match.index, headerEnd: match.index + match[0].length });
    }

    if (markers.length > 0) {
      // Anything before the first marker is preamble
      const preamble = raw.slice(0, markers[0].start).trim();
      if (preamble) sections['_preamble'] = preamble;

      for (let i = 0; i < markers.length; i++) {
        const end = i + 1 < markers.length ? markers[i + 1].start : raw.length;
        sections[markers[i].key] = raw.slice(markers[i].headerEnd, end).trim();
      }
    }

    // Map sections to JdRenderer fields
    const descriptionKeys = ['职位概述', '岗位概述', '职位描述', '岗位描述', '概述', 'overview'];
    const responsibilityKeys = ['主要职责', '岗位职责', '工作职责', '职责', 'responsibilities'];
    const requirementKeys = ['任职要求', '岗位要求', '任职资格', '要求', 'requirements', '基本要求'];

    const findSection = (keys: string[]) => {
      for (const k of keys) {
        for (const [sk, sv] of Object.entries(sections)) {
          if (sk.toLowerCase().includes(k.toLowerCase())) return sv;
        }
      }
      return undefined;
    };

    const splitLines = (text?: string) =>
      text
        ? text.split(/\n/).map(l => l.replace(/^[\s•●○◦▪▫■□◆◇·∙✦✧\-–—*]+\s*/, '').replace(/^\d+[.、]\s*/, '').trim()).filter(Boolean)
        : undefined;

    const description = findSection(descriptionKeys) || (markers.length === 0 ? raw : sections['_preamble']) || undefined;
    const responsibilities = splitLines(findSection(responsibilityKeys));
    const parsedRequirements = splitLines(findSection(requirementKeys));

    // Also use explicit jobRequirements / interviewRequirements fields from DB if available
    const requirements = parsedRequirements
      || (interview.jobRequirements ? interview.jobRequirements.split('\n').filter(Boolean) : undefined);

    return {
      title: interview.jobTitle || undefined,
      description: description || undefined,
      requirements,
      responsibilities: responsibilities
        || (interview.interviewRequirements ? interview.interviewRequirements.split('\n').filter(Boolean) : undefined),
    };
  }, [interview]);

  // Extract JD keywords for resume highlighting
  const highlightKeywords = useMemo(() => {
    return extractJDKeywords(jdData as { requirements?: string[]; responsibilities?: string[]; description?: string } | null);
  }, [jdData]);

  // -----------------------------------------------------------------------
  // Loading / Error states
  // -----------------------------------------------------------------------

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <SpinnerIcon className="w-6 h-6" />
        <span className="ml-3 text-slate-500">{t('goHireEval.loading', 'Loading interview...')}</span>
      </div>
    );
  }

  if (error || !interview) {
    return (
      <div className="max-w-2xl mx-auto mt-16 text-center">
        <p className="text-red-600 mb-4">{error || t('goHireEval.notFound', 'Interview not found')}</p>
        <button
          onClick={() => navigate('/product/interview-hub')}
          className="inline-flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900"
        >
          <ArrowLeftIcon />
          {t('goHireEval.backToHub', 'Back to Interview Hub')}
        </button>
      </div>
    );
  }

  const evaluation = interview.evaluationData;

  // Parse transcript
  const parsedSegments: TranscriptSegment[] | null = interview.transcript
    ? tryParseTranscript(interview.transcript)
    : null;

  // Build resume markdown
  const resumeMarkdown = interview.parsedResume
    ? parsedDataToMarkdown(interview.parsedResume as Record<string, unknown>)
    : interview.resumeText || null;

  // Determine hiring decision styling
  const getDecisionBadge = (decision: string) => {
    const d = decision.toLowerCase();
    if (d.includes('strong') && !d.includes('no'))
      return 'bg-green-600 text-white text-sm px-3 py-1 rounded font-bold inline-block';
    if (d === 'hire' || d.includes('hire') && !d.includes('no') && !d.includes('weak'))
      return 'bg-green-600 text-white text-sm px-3 py-1 rounded font-bold inline-block';
    if (d.includes('weak'))
      return 'bg-blue-600 text-white text-sm px-3 py-1 rounded font-bold inline-block';
    if (d.includes('no'))
      return 'bg-red-600 text-white text-sm px-3 py-1 rounded font-bold inline-block';
    return 'bg-blue-600 text-white text-sm px-3 py-1 rounded font-bold inline-block';
  };

  const isNegativeDecision = (decision: string) => {
    const d = decision.toLowerCase();
    return d.includes('no') || d.includes('weak');
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-slate-50">
      {/* Header */}
      <header className="h-14 px-4 bg-white border-b border-slate-200 flex items-center justify-between flex-none">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            onClick={() => navigate('/product/interview-hub')}
            className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors flex-none"
          >
            <ArrowLeftIcon />
            {t('goHireEval.back', 'Back')}
          </button>
          <span className="text-slate-300 flex-none">|</span>
          <div className="min-w-0">
            <h1 className="text-sm sm:text-lg font-bold text-slate-800 truncate">
              {interview.candidateName}
            </h1>
            {interview.jobTitle && (
              <p className="text-xs text-slate-500 truncate">{interview.jobTitle}</p>
            )}
          </div>
        </div>
        {interview.evaluationVerdict && (
          <span className={getDecisionBadge(interview.evaluationVerdict)}>
            {interview.evaluationVerdict.replace(/_/g, ' ')}
          </span>
        )}
      </header>

      {/* Main two-column layout */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* ================================================================ */}
        {/* LEFT PANEL - Video + Context Tabs                                */}
        {/* ================================================================ */}
        <div className="w-full lg:w-1/2 flex flex-col overflow-hidden border-r border-slate-200">
          {/* Video player */}
          <div className="bg-black flex-none">
            <div className="aspect-video">
              {interview.videoUrl ? (
                <video
                  ref={videoRef}
                  src={interview.videoUrl}
                  className="w-full h-full object-cover"
                  controls
                  poster="https://placehold.co/600x400/1e293b/94a3b8/png?text=Interview+Recording"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-500 text-sm">
                  {t('goHireEval.noVideo', 'No video available')}
                </div>
              )}
            </div>
          </div>

          {/* Context tabs */}
          <div className="flex-1 flex flex-col min-h-0 bg-white">
            {/* Tab buttons */}
            <div className="flex border-b border-slate-200 flex-none">
              {(['resume', 'jd', 'transcript'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 px-4 py-2.5 text-sm font-medium transition-colors ${
                    activeTab === tab
                      ? 'text-slate-800 border-b-2 border-cyan-600 bg-slate-50'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {tab === 'resume'
                    ? t('goHireEval.tabResume', '简历')
                    : tab === 'jd'
                    ? t('goHireEval.tabJD', '职位描述')
                    : t('goHireEval.tabTranscript', '面试实录')}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* ---- Resume Tab ---- */}
              {activeTab === 'resume' && (
                <div>
                  {/* Action bar: view link + parse button */}
                  {interview.resumeUrl && (
                    <div className="flex items-center justify-between mb-4">
                      <a
                        href={interview.resumeUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        <DocumentIcon className="w-4 h-4" />
                        {t('goHireEval.viewResume', '查看简历')}
                        <ExternalLinkIcon className="w-3 h-3" />
                      </a>
                      {!parsedResumeMarkdown && !resumeMarkdown && (
                        <button
                          onClick={async () => {
                            setIsParsingResume(true);
                            setResumeParseError(null);
                            try {
                              const res = await axios.post(`/api/v1/gohire-interviews/${id}/parse-resume`, { force: true });
                              if (res.data?.success && res.data.data?.markdown) {
                                setParsedResumeMarkdown(res.data.data.markdown);
                              } else {
                                setResumeParseError(res.data?.error || 'Parse failed');
                              }
                            } catch (err: any) {
                              setResumeParseError(err.response?.data?.error || err.message || 'Parse failed');
                            } finally {
                              setIsParsingResume(false);
                            }
                          }}
                          disabled={isParsingResume}
                          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50 transition-colors disabled:opacity-50"
                        >
                          {isParsingResume ? (
                            <SpinnerIcon />
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          )}
                          {isParsingResume
                            ? t('goHireEval.parsingResume', '解析中...')
                            : t('goHireEval.parseResume', '解析简历')}
                        </button>
                      )}
                      {(parsedResumeMarkdown || resumeMarkdown) && (
                        <button
                          onClick={async () => {
                            setIsParsingResume(true);
                            setResumeParseError(null);
                            try {
                              const res = await axios.post(`/api/v1/gohire-interviews/${id}/parse-resume`, { force: true });
                              if (res.data?.success && res.data.data?.markdown) {
                                setParsedResumeMarkdown(res.data.data.markdown);
                              }
                            } catch (err: any) {
                              setResumeParseError(err.response?.data?.error || err.message);
                            } finally {
                              setIsParsingResume(false);
                            }
                          }}
                          disabled={isParsingResume}
                          className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md text-cyan-600 hover:text-cyan-700 hover:bg-cyan-50 transition-colors disabled:opacity-50"
                        >
                          {isParsingResume ? (
                            <SpinnerIcon />
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                          )}
                          {t('goHireEval.reparseResume', '重新解析')}
                        </button>
                      )}
                    </div>
                  )}
                  {/* Resume content */}
                  {resumeParseError && (
                    <p className="text-sm text-red-500 mb-3">{resumeParseError}</p>
                  )}
                  {(parsedResumeMarkdown || resumeMarkdown) ? (
                    <ResumeRenderer content={parsedResumeMarkdown || resumeMarkdown || ''} jdKeywords={highlightKeywords} />
                  ) : interview.resumeUrl ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <DocumentIcon className="w-10 h-10 text-slate-300 mb-3" />
                      <p className="text-sm text-slate-500 mb-3">
                        {t('goHireEval.resumeNotParsed', '简历尚未解析，点击上方按钮解析简历 PDF')}
                      </p>
                      <button
                        onClick={async () => {
                          setIsParsingResume(true);
                          setResumeParseError(null);
                          try {
                            const res = await axios.post(`/api/v1/gohire-interviews/${id}/parse-resume`, { force: true });
                            if (res.data?.success && res.data.data?.markdown) {
                              setParsedResumeMarkdown(res.data.data.markdown);
                            } else {
                              setResumeParseError(res.data?.error || 'Parse failed');
                            }
                          } catch (err: any) {
                            setResumeParseError(err.response?.data?.error || err.message || 'Parse failed');
                          } finally {
                            setIsParsingResume(false);
                          }
                        }}
                        disabled={isParsingResume}
                        className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700 transition-colors disabled:opacity-50"
                      >
                        {isParsingResume ? (
                          <>
                            <SpinnerIcon />
                            {t('goHireEval.parsingResume', '解析中...')}
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            {t('goHireEval.parseResume', '解析简历')}
                          </>
                        )}
                      </button>
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400 italic">
                      {t('goHireEval.noResume', 'No resume available for this interview.')}
                    </p>
                  )}
                </div>
              )}

              {/* ---- JD Tab ---- */}
              {activeTab === 'jd' && (
                <div>
                  {interview.jobDescription || interview.jobRequirements || interview.interviewRequirements ? (
                    <>
                      {interview.jobTitle && (
                        <h2 className="text-lg font-bold text-slate-800 mb-3">{interview.jobTitle}</h2>
                      )}
                      {jdData && <JdRenderer jd={jdData} />}
                      {/* AI Optimize placeholder */}
                      <div className="mt-4">
                        <button
                          className="px-4 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-lg hover:bg-indigo-100 transition-colors cursor-not-allowed opacity-60"
                          disabled
                        >
                          {t('goHireEval.aiOptimize', 'AI 优化')}
                        </button>
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-slate-400 italic">
                      {t('goHireEval.noJD', 'No job description available.')}
                    </p>
                  )}
                </div>
              )}

              {/* ---- Transcript Tab ---- */}
              {activeTab === 'transcript' && (
                <div>
                  {parsedSegments ? (
                    <div>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs text-slate-400">
                          {parsedSegments.length} {t('goHireEval.segments', 'segments')}
                        </span>
                        <div className="flex items-center gap-2">
                          {interview.transcriptUrl && (
                            <button
                              onClick={handleLoadTranscript}
                              disabled={isLoadingTranscript}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
                            >
                              {isLoadingTranscript && <SpinnerIcon className="w-3 h-3" />}
                              {t('goHireEval.reloadTranscript', '重新加载面试记录')}
                            </button>
                          )}
                          {interview.videoUrl && (
                            <button
                              onClick={handleTranscribe}
                              disabled={isTranscribing}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
                            >
                              {isTranscribing && <SpinnerIcon className="w-3 h-3" />}
                              {t('goHireEval.regenerateTranscript', '重新生成转录')}
                            </button>
                          )}
                        </div>
                      </div>
                      {transcribeError && (
                        <p className="text-xs text-red-500 mb-2">{transcribeError}</p>
                      )}
                      <div className="space-y-3">
                        {parsedSegments.map((seg, i) => {
                          const isRecruiter =
                            seg.speaker.toLowerCase().includes('recruiter') ||
                            seg.speaker.toLowerCase().includes('interviewer') ||
                            seg.speaker === 'Q';
                          return (
                            <div
                              key={i}
                              className="flex gap-3 p-3 rounded-lg hover:bg-slate-50 cursor-pointer transition-colors border border-transparent hover:border-slate-200"
                              onClick={() => seg.timestamp && seekTo(seg.timestamp)}
                            >
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1">
                                  <span
                                    className={`text-xs font-bold ${
                                      isRecruiter ? 'text-cyan-600' : 'text-slate-700'
                                    }`}
                                  >
                                    {seg.speaker}
                                  </span>
                                  {seg.timestamp && (
                                    <span className="text-xs text-slate-400 font-mono flex-none">
                                      {seg.timestamp}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-slate-600 leading-relaxed">{seg.text}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : interview.transcript ? (
                    <div>
                      {interview.videoUrl && (
                        <div className="flex justify-end mb-3">
                          <button
                            onClick={handleTranscribe}
                            disabled={isTranscribing}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
                          >
                            {isTranscribing && <SpinnerIcon className="w-3 h-3" />}
                            {t('goHireEval.regenerateTranscript', '重新生成转录')}
                          </button>
                        </div>
                      )}
                      {transcribeError && (
                        <p className="text-xs text-red-500 mb-2">{transcribeError}</p>
                      )}
                      <pre className="text-sm text-slate-600 whitespace-pre-wrap font-sans leading-relaxed">
                        {interview.transcript}
                      </pre>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                      <p className="text-sm text-slate-400 mb-4">
                        {t('goHireEval.noTranscript', 'No transcript available.')}
                      </p>
                      {transcribeError && (
                        <p className="text-xs text-red-500 mb-4">{transcribeError}</p>
                      )}
                      {loadTranscriptError && (
                        <p className="text-xs text-red-500 mb-4">{loadTranscriptError}</p>
                      )}
                      <div className="flex items-center gap-3">
                        {interview.transcriptUrl && (
                          <button
                            onClick={handleLoadTranscript}
                            disabled={isLoadingTranscript}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-cyan-600 bg-cyan-50 border border-cyan-200 rounded-lg hover:bg-cyan-100 transition-colors disabled:opacity-50"
                          >
                            {isLoadingTranscript && <SpinnerIcon className="w-4 h-4" />}
                            {t('goHireEval.loadTranscript', '加载面试记录')}
                          </button>
                        )}
                        {interview.videoUrl && (
                          <button
                            onClick={handleTranscribe}
                            disabled={isTranscribing}
                            className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-slate-600 bg-slate-50 border border-slate-200 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-50"
                          >
                            {isTranscribing && <SpinnerIcon className="w-4 h-4" />}
                            {t('goHireEval.generateTranscript', '生成转录')}
                          </button>
                        )}
                      </div>
                      {!interview.transcriptUrl && !interview.videoUrl && (
                        <p className="text-xs text-slate-300">
                          {t('goHireEval.noVideoForTranscript', '无视频文件，无法生成转录')}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ================================================================ */}
        {/* RIGHT PANEL - Evaluation Report                                  */}
        {/* ================================================================ */}
        <div className="w-full lg:w-1/2 flex flex-col overflow-hidden bg-white">
          {/* Report header */}
          <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100 flex-none">
            <div className="flex items-center gap-2.5">
              <div className="p-1.5 bg-purple-50 text-purple-600 rounded-md">
                <BrainIcon className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-slate-800">
                {t('goHireEval.evaluation', 'Evaluation')}
              </h2>
            </div>
            {evaluation && (
              <button
                onClick={handleGenerateEvaluation}
                disabled={isGenerating}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors disabled:opacity-50"
              >
                <RefreshIcon className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
                {t('goHireEval.regenerate', 'Re-generate')}
              </button>
            )}
          </div>

          {/* Report content area */}
          {!evaluation ? (
            /* ---------- Empty state ---------- */
            <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
              <BrainIcon className="w-12 h-12 text-slate-200 mb-4" />
              <h3 className="text-lg font-medium text-slate-800 mb-2">
                {isGenerating
                  ? t('goHireEval.generating', 'Generating evaluation...')
                  : t('goHireEval.noEvaluation', '暂无评估')}
              </h3>
              <button
                onClick={handleGenerateEvaluation}
                disabled={isGenerating}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-cyan-600 hover:bg-cyan-700 rounded-lg transition-colors disabled:opacity-50"
              >
                {isGenerating ? (
                  <>
                    <SpinnerIcon className="w-4 h-4" />
                    {t('goHireEval.generating', 'Generating...')}
                  </>
                ) : (
                  t('goHireEval.generateEvaluation', '生成评估')
                )}
              </button>
            </div>
          ) : (
            /* ---------- Report with data ---------- */
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
              {/* ---- Score & Decision Banner ---- */}
              <div className="flex-none border-b">
                {/* Cheating warning banner */}
                {evaluation.cheatingAnalysis &&
                  evaluation.cheatingAnalysis.riskLevel !== 'Low' && (
                    <div
                      className={`p-3 border-b ${
                        evaluation.cheatingAnalysis.riskLevel === 'Critical'
                          ? 'bg-red-100 border-red-300'
                          : evaluation.cheatingAnalysis.riskLevel === 'High'
                          ? 'bg-orange-100 border-orange-300'
                          : 'bg-amber-100 border-amber-300'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <ShieldAlertIcon
                          className={`w-5 h-5 mt-0.5 flex-none ${
                            evaluation.cheatingAnalysis.riskLevel === 'Critical'
                              ? 'text-red-600'
                              : evaluation.cheatingAnalysis.riskLevel === 'High'
                              ? 'text-orange-600'
                              : 'text-amber-600'
                          }`}
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span
                              className={`text-sm font-bold ${
                                evaluation.cheatingAnalysis.riskLevel === 'Critical'
                                  ? 'text-red-800'
                                  : evaluation.cheatingAnalysis.riskLevel === 'High'
                                  ? 'text-orange-800'
                                  : 'text-amber-800'
                              }`}
                            >
                              {t('goHireEval.cheatingWarning', '作弊嫌疑警告')}
                            </span>
                            <span
                              className={`text-[10px] px-1.5 py-0.5 rounded text-white font-bold ${
                                evaluation.cheatingAnalysis.riskLevel === 'Critical'
                                  ? 'bg-red-600'
                                  : evaluation.cheatingAnalysis.riskLevel === 'High'
                                  ? 'bg-orange-500'
                                  : 'bg-amber-500'
                              }`}
                            >
                              {evaluation.cheatingAnalysis.riskLevel}
                            </span>
                          </div>
                          <p
                            className={`text-xs mb-1 ${
                              evaluation.cheatingAnalysis.riskLevel === 'Critical'
                                ? 'text-red-800'
                                : evaluation.cheatingAnalysis.riskLevel === 'High'
                                ? 'text-orange-800'
                                : 'text-amber-800'
                            }`}
                          >
                            {evaluation.cheatingAnalysis.summary.length > 150
                              ? `${evaluation.cheatingAnalysis.summary.substring(0, 150)}...`
                              : evaluation.cheatingAnalysis.summary}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                {/* Score and hiring decision */}
                <div className="p-4 bg-gray-50 flex items-center justify-between">
                  <div>
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      {t('goHireEval.matchScore', '匹配得分')}
                    </span>
                    <div className="text-3xl font-bold text-cyan-600">{evaluation.score}/100</div>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block mb-1">
                      {t('goHireEval.hiringDecision', '录用建议')}
                    </span>
                    <span className={getDecisionBadge(evaluation.hiringDecision)}>
                      {evaluation.hiringDecision.replace(/_/g, ' ')}
                    </span>
                  </div>
                </div>
              </div>

              {/* ---- Scrollable report body ---- */}
              <div className="flex-1 overflow-y-auto p-5 min-h-0">
                <div className="space-y-8">
                  {/* 1. Recommendation */}
                  <div
                    className={`p-4 rounded-lg border shadow-sm ${
                      isNegativeDecision(evaluation.hiringDecision)
                        ? 'bg-red-50 border-red-100'
                        : 'bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-100'
                    }`}
                  >
                    <h4
                      className={`text-sm font-bold mb-2 flex items-center gap-2 ${
                        isNegativeDecision(evaluation.hiringDecision)
                          ? 'text-red-900'
                          : 'text-blue-900'
                      }`}
                    >
                      {isNegativeDecision(evaluation.hiringDecision) ? (
                        <XCircleIcon className="w-4 h-4" />
                      ) : (
                        <ThumbsUpIcon className="w-4 h-4" />
                      )}
                      {t('goHireEval.recommendation', '建议')}
                    </h4>
                    <MarkdownRenderer
                      content={evaluation.recommendation}
                      className={`text-sm font-medium leading-relaxed ${
                        isNegativeDecision(evaluation.hiringDecision)
                          ? 'text-red-900'
                          : 'text-blue-900'
                      }`}
                      keywords={highlightKeywords}
                    />
                  </div>

                  {/* 2. Expert Insight */}
                  {(evaluation.levelAssessment || evaluation.expertAdvice) && (
                    <div className="bg-fuchsia-50 p-4 rounded-lg border border-fuchsia-100 shadow-sm">
                      <div className="flex items-center justify-between mb-2">
                        <h4 className="text-sm font-bold text-fuchsia-900 flex items-center gap-2">
                          <LightbulbIcon className="w-4 h-4" />
                          {t('goHireEval.expertInsight', 'Expert Insight')}
                        </h4>
                        {evaluation.levelAssessment && (
                          <span className="bg-fuchsia-600 text-white text-xs font-bold px-2 py-0.5 rounded">
                            {evaluation.levelAssessment} Level
                          </span>
                        )}
                      </div>
                      {evaluation.expertAdvice && (
                        <MarkdownRenderer
                          content={evaluation.expertAdvice}
                          className="text-sm text-fuchsia-900 leading-relaxed"
                          keywords={highlightKeywords}
                        />
                      )}
                    </div>
                  )}

                  {/* 3. Summary */}
                  <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                    <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                      <BrainIcon className="w-4 h-4" />
                      {t('goHireEval.summary', '总结摘要')}
                    </h4>
                    <MarkdownRenderer
                      content={evaluation.summary}
                      className="text-sm text-gray-700"
                      keywords={highlightKeywords}
                    />
                  </div>

                  {/* 4. Strengths */}
                  {evaluation.strengths.length > 0 && (
                    <div className="bg-green-50 p-4 rounded-lg border border-green-100 shadow-sm">
                      <h4 className="text-sm font-bold text-green-800 flex items-center gap-2 mb-3">
                        <CheckCircleIcon className="w-4 h-4" />
                        {t('goHireEval.strengths', '优势')}
                      </h4>
                      <ul className="space-y-2">
                        {evaluation.strengths.map((s, i) => (
                          <li
                            key={i}
                            className="text-xs text-green-900 flex items-start gap-2"
                          >
                            <span className="block w-1.5 h-1.5 bg-green-400 rounded-full mt-1.5 flex-none" />
                            <span className="leading-relaxed">{s}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 5. Weaknesses */}
                  {evaluation.weaknesses.length > 0 && (
                    <div className="bg-red-50 p-4 rounded-lg border border-red-100 shadow-sm">
                      <h4 className="text-sm font-bold text-red-800 flex items-center gap-2 mb-3">
                        <WarningIcon className="w-4 h-4" />
                        {t('goHireEval.weaknesses', '劣势')}
                      </h4>
                      <ul className="space-y-2">
                        {evaluation.weaknesses.map((w, i) => (
                          <li
                            key={i}
                            className="text-xs text-red-900 flex items-start gap-2"
                          >
                            <span className="block w-1.5 h-1.5 bg-red-400 rounded-full mt-1.5 flex-none" />
                            <span className="leading-relaxed">{w}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* 6. Technical Analysis */}
                  {evaluation.technicalAnalysis && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <CodeIcon className="w-4 h-4" />
                        {t('goHireEval.technicalAnalysis', '技术能力')}
                      </h4>
                      <div className="bg-white border rounded-lg p-4 shadow-sm space-y-4">
                        {/* Ratings row */}
                        <div className="flex items-center justify-between flex-wrap gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-600">
                              {t('goHireEval.depthRating', 'Depth Rating')}
                            </span>
                            <span
                              className={`text-[10px] px-2 py-0.5 rounded border font-medium ${
                                evaluation.technicalAnalysis.depthRating === 'Expert'
                                  ? 'bg-purple-100 text-purple-700 border-purple-200'
                                  : evaluation.technicalAnalysis.depthRating === 'Advanced'
                                  ? 'bg-blue-100 text-blue-700 border-blue-200'
                                  : evaluation.technicalAnalysis.depthRating === 'Intermediate'
                                  ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
                                  : 'bg-gray-100 text-gray-700 border-gray-200'
                              }`}
                            >
                              {evaluation.technicalAnalysis.depthRating}
                            </span>
                          </div>
                          {evaluation.technicalAnalysis.responseQuality && (
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium text-gray-600">
                                {t('goHireEval.responseQuality', 'Response Quality')}
                              </span>
                              <span
                                className={`text-[10px] px-2 py-0.5 rounded border font-medium ${
                                  evaluation.technicalAnalysis.responseQuality === 'High'
                                    ? 'bg-green-100 text-green-700 border-green-200'
                                    : evaluation.technicalAnalysis.responseQuality === 'Medium'
                                    ? 'bg-yellow-100 text-yellow-700 border-yellow-200'
                                    : 'bg-red-100 text-red-700 border-red-200'
                                }`}
                              >
                                {evaluation.technicalAnalysis.responseQuality}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Summary */}
                        <p className="text-sm text-gray-700">
                          {evaluation.technicalAnalysis.summary}
                        </p>

                        {/* Details */}
                        {evaluation.technicalAnalysis.details.length > 0 && (
                          <ul className="space-y-1">
                            {evaluation.technicalAnalysis.details.map((d, i) => (
                              <li
                                key={i}
                                className="text-xs text-gray-600 flex items-start gap-2"
                              >
                                <span className="block w-1 h-1 bg-gray-400 rounded-full mt-1.5 flex-none" />
                                {d}
                              </li>
                            ))}
                          </ul>
                        )}

                        {/* Proven skills */}
                        {evaluation.technicalAnalysis.provenSkills &&
                          evaluation.technicalAnalysis.provenSkills.length > 0 && (
                            <div className="pt-2 border-t border-gray-100">
                              <h5 className="text-xs font-semibold text-green-700 mb-2 flex items-center gap-1">
                                <CheckCircleIcon className="w-3 h-3" />
                                {t('goHireEval.provenSkills', 'Proven Skills (有实际证明)')}
                              </h5>
                              <div className="flex flex-wrap gap-1.5">
                                {evaluation.technicalAnalysis.provenSkills.map((skill, i) => (
                                  <span
                                    key={i}
                                    className="text-[10px] px-2 py-0.5 rounded border bg-green-50 text-green-700 border-green-200"
                                  >
                                    {skill}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}

                        {/* Claimed but unverified */}
                        {evaluation.technicalAnalysis.claimedButUnverified &&
                          evaluation.technicalAnalysis.claimedButUnverified.length > 0 && (
                            <div className="pt-2 border-t border-gray-100">
                              <h5 className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1">
                                <WarningIcon className="w-3 h-3" />
                                {t(
                                  'goHireEval.claimedUnverified',
                                  'Claimed but Unverified (声称但未验证)',
                                )}
                              </h5>
                              <div className="flex flex-wrap gap-1.5">
                                {evaluation.technicalAnalysis.claimedButUnverified.map(
                                  (skill, i) => (
                                    <span
                                      key={i}
                                      className="text-[10px] px-2 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200"
                                    >
                                      {skill}
                                    </span>
                                  ),
                                )}
                              </div>
                            </div>
                          )}
                      </div>
                    </div>
                  )}

                  {/* 7. Hard Requirements Check */}
                  {evaluation.jdMatch?.hardRequirementsAnalysis &&
                    evaluation.jdMatch.hardRequirementsAnalysis.length > 0 && (
                      <div className="bg-orange-50 p-4 rounded-lg border border-orange-100 shadow-sm">
                        <h4 className="text-sm font-bold text-orange-900 mb-3 flex items-center gap-2">
                          <WarningIcon className="w-4 h-4" />
                          {t('goHireEval.hardRequirements', 'Mandatory Requirements Check')}
                        </h4>
                        <div className="space-y-3">
                          {evaluation.jdMatch.hardRequirementsAnalysis.map((req, i) => (
                            <div
                              key={i}
                              className="flex gap-3 items-start bg-white p-3 rounded border border-orange-100"
                            >
                              <div
                                className={`mt-0.5 w-5 h-5 rounded-full flex items-center justify-center flex-none ${
                                  req.met
                                    ? 'bg-green-100 text-green-600'
                                    : 'bg-red-100 text-red-600'
                                }`}
                              >
                                {req.met ? (
                                  <CheckCircleIcon className="w-3.5 h-3.5" />
                                ) : (
                                  <XCircleIcon className="w-3.5 h-3.5" />
                                )}
                              </div>
                              <div>
                                <p className="text-sm font-semibold text-gray-900 mb-1">
                                  {req.requirement}
                                </p>
                                <p className="text-xs text-gray-600">{req.analysis}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* 8. JD Requirements Match */}
                  {evaluation.jdMatch && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <ListCheckIcon className="w-4 h-4" />
                        {t('goHireEval.jdMatch', 'JD Requirements Match')}
                      </h4>
                      <div className="space-y-3">
                        {evaluation.jdMatch.requirements.map((req, i) => (
                          <div
                            key={i}
                            className="bg-white border rounded-lg p-3 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3 mb-2">
                              <span className="text-xs font-medium text-gray-800 flex-1">
                                {req.requirement}
                              </span>
                              <span
                                className={`flex-none text-[10px] px-2 py-0.5 rounded font-medium ${
                                  req.matchLevel === 'High'
                                    ? 'bg-green-100 text-green-700'
                                    : req.matchLevel === 'Medium'
                                    ? 'bg-yellow-100 text-yellow-700'
                                    : req.matchLevel === 'Low'
                                    ? 'bg-orange-100 text-orange-700'
                                    : 'bg-red-100 text-red-700'
                                }`}
                              >
                                {req.matchLevel}
                              </span>
                            </div>
                            <p className="text-xs text-gray-600 leading-relaxed bg-gray-50 p-2 rounded">
                              {req.explanation}
                            </p>
                          </div>
                        ))}
                      </div>

                      {/* Bonus skills */}
                      {evaluation.jdMatch.extraSkillsFound &&
                        evaluation.jdMatch.extraSkillsFound.length > 0 && (
                          <div className="mt-4 bg-amber-50 border border-amber-100 rounded-lg p-3">
                            <h5 className="text-xs font-semibold text-amber-900 mb-2">
                              {t('goHireEval.bonusSkills', 'Bonus Skills Identified')}
                            </h5>
                            <div className="flex flex-wrap gap-2">
                              {evaluation.jdMatch.extraSkillsFound.map((skill, i) => (
                                <span
                                  key={i}
                                  className="bg-white text-amber-800 border border-amber-200 text-[10px] px-2 py-0.5 rounded"
                                >
                                  {skill}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  )}

                  {/* 9. Behavioral Analysis */}
                  {evaluation.behavioralAnalysis && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <UsersIcon className="w-4 h-4" />
                        {t('goHireEval.behavioralAnalysis', 'Behavioral Analysis')}
                      </h4>
                      <div className="bg-white border rounded-lg p-4 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-sm font-medium text-gray-600">
                            {t('goHireEval.culturalFit', 'Cultural Fit')}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded border font-medium ${
                              evaluation.behavioralAnalysis.compatibility === 'High'
                                ? 'bg-green-50 text-green-700 border-green-200'
                                : evaluation.behavioralAnalysis.compatibility === 'Medium'
                                ? 'bg-yellow-50 text-yellow-700 border-yellow-200'
                                : 'bg-red-50 text-red-700 border-red-200'
                            }`}
                          >
                            {evaluation.behavioralAnalysis.compatibility}
                          </span>
                        </div>
                        <p className="text-sm text-gray-700 mb-3">
                          {evaluation.behavioralAnalysis.summary}
                        </p>
                        {evaluation.behavioralAnalysis.details.length > 0 && (
                          <ul className="space-y-1">
                            {evaluation.behavioralAnalysis.details.map((d, i) => (
                              <li
                                key={i}
                                className="text-xs text-gray-600 flex items-start gap-2"
                              >
                                <span className="block w-1 h-1 bg-blue-400 rounded-full mt-1.5 flex-none" />
                                {d}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 10. Interviewer's Kit */}
                  {evaluation.interviewersKit && (
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 mb-3 flex items-center gap-2">
                        <HelpCircleIcon className="w-4 h-4" />
                        {t('goHireEval.interviewersKit', "Interviewer's Kit")}
                      </h4>
                      <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4">
                        <h5 className="text-xs font-bold text-indigo-900 uppercase tracking-wider mb-2">
                          {t(
                            'goHireEval.suggestedQuestions',
                            'Suggested Follow-up Questions',
                          )}
                        </h5>
                        <ul className="space-y-2 mb-4">
                          {evaluation.interviewersKit.suggestedQuestions.map((q, i) => (
                            <li
                              key={i}
                              className="text-sm text-indigo-800 flex items-start gap-2 bg-white p-2 rounded"
                            >
                              <span className="text-indigo-400 font-bold flex-none">
                                Q{i + 1}:
                              </span>
                              <span>{q}</span>
                            </li>
                          ))}
                        </ul>

                        {evaluation.interviewersKit.focusAreas.length > 0 && (
                          <>
                            <h5 className="text-xs font-bold text-indigo-900 uppercase tracking-wider mb-2">
                              {t('goHireEval.focusAreas', 'Key Focus Areas')}
                            </h5>
                            <div className="flex flex-wrap gap-2">
                              {evaluation.interviewersKit.focusAreas.map((area, i) => (
                                <span
                                  key={i}
                                  className="bg-indigo-200 text-indigo-800 text-xs font-medium px-2 py-1 rounded"
                                >
                                  {area}
                                </span>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* 11. Suitable Work Types */}
                  {evaluation.suitableWorkTypes &&
                    evaluation.suitableWorkTypes.length > 0 && (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                        <h4 className="text-sm font-bold text-slate-800 mb-3 flex items-center gap-2">
                          <BriefcaseIcon className="w-4 h-4" />
                          {t('goHireEval.suitableWorkTypes', 'Suitable For Roles')}
                        </h4>
                        <div className="flex flex-wrap gap-2">
                          {evaluation.suitableWorkTypes.map((type, i) => (
                            <span
                              key={i}
                              className="bg-white border border-slate-300 text-slate-700 text-xs font-medium px-2 py-1 rounded"
                            >
                              {type}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* 12. Cheating Analysis (collapsible) */}
                  {evaluation.cheatingAnalysis && (
                    <CheatingAnalysisSection
                      analysis={evaluation.cheatingAnalysis}
                      t={t as any}
                    />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
