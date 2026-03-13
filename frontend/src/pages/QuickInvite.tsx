import { useState, useRef, useCallback, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import axios from '../lib/axios';
import LanguageSelector from '../components/LanguageSelector';
import SEO from '../components/SEO';

const DOC_ACCEPT = '.pdf,.docx,.doc,.xlsx,.xls,.txt,.md,.markdown,.json';

interface FormattedResume {
  name: string;
  title: string;
  contact: { type: string; value: string }[];
  summary: string;
  experience: {
    company: string;
    role: string;
    period: string;
    location: string;
    bullets: string[];
  }[];
  education: {
    institution: string;
    degree: string;
    field: string;
    period: string;
  }[];
  skills: { category: string; items: string[] }[];
  certifications: string[];
  projects: {
    name: string;
    description: string;
    technologies: string[];
  }[];
  languages: string[];
  awards: string[];
}

interface FormattedJD {
  jobTitle: string;
  company: string;
  location: string;
  employmentType: string;
  department: string;
  salary: string;
  overview: string;
  responsibilities: string[];
  requirements: string[];
  preferredQualifications: string[];
  benefits: string[];
  skills: string[];
  about: string;
  other: { heading: string; content: string }[];
}

interface ResumeEntry {
  id: string;
  fileName: string;
  text: string;
  status: 'ready' | 'sending' | 'sent' | 'error';
  result?: InvitationResult;
  error?: string;
}

interface InvitationResult {
  email: string;
  name: string;
  login_url: string;
  job_title: string;
  message: string;
  qrcode_url: string;
  company_name?: string;
}

type Step = 'setup' | 'review' | 'results';

type JsonMap = Record<string, unknown>;

interface ResumeReviewInfo {
  name: string | null;
  email: string | null;
  phone: string | null;
  role: string | null;
  summary: string | null;
}

interface JdReviewInfo {
  title: string | null;
  company: string | null;
  location: string | null;
  employmentType: string | null;
  requirementsCount: number;
  summary: string | null;
}

const isJsonMap = (value: unknown): value is JsonMap =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const cleanText = (value: string) => value.replace(/\s+/g, ' ').trim();

const truncateText = (value: string, maxLength = 120) => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 1)}...`;
};

const asNonEmptyString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};

const getByPath = (obj: JsonMap, path: string[]): unknown => {
  let current: unknown = obj;
  for (const key of path) {
    if (!isJsonMap(current)) return undefined;
    current = current[key];
  }
  return current;
};

const getFirstStringByPaths = (obj: JsonMap | null, paths: string[][]): string | null => {
  if (!obj) return null;
  for (const path of paths) {
    const value = asNonEmptyString(getByPath(obj, path));
    if (value) return value;
  }
  return null;
};

const getArrayLengthByPaths = (obj: JsonMap | null, paths: string[][]): number => {
  if (!obj) return 0;
  for (const path of paths) {
    const value = getByPath(obj, path);
    if (Array.isArray(value)) {
      return value.filter(
        (item) => (typeof item === 'string' ? Boolean(item.trim()) : item !== null && item !== undefined)
      ).length;
    }
  }
  return 0;
};

const parsePossibleJson = (text: string): unknown | null => {
  const raw = text.trim();
  if (!raw) return null;

  const candidates = [raw];
  if (raw.startsWith('```')) {
    const unfenced = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    if (unfenced.trim()) {
      candidates.push(unfenced.trim());
    }
  }

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch {
      // ignore parse failures and continue
    }
  }

  const firstBrace = raw.indexOf('{');
  const lastBrace = raw.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    try {
      return JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    } catch {
      // ignore
    }
  }

  return null;
};

const unwrapDataPayload = (value: unknown): JsonMap | null => {
  if (!isJsonMap(value)) return null;
  if (isJsonMap(value.data)) return value.data;
  return value;
};

const extractEmail = (text: string): string | null => {
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
  return email ? email.trim() : null;
};

const extractPhone = (text: string): string | null => {
  const phone = text.match(/(?:\+?\d[\d\s\-().]{7,}\d)/)?.[0] ?? null;
  return phone ? phone.trim() : null;
};

const sanitizeCandidateName = (value: string): string | null => {
  const cleaned = value
    .replace(/^["'`]+|["'`,.，。;；:：]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  if (cleaned.length > 80) return null;
  if (cleaned.includes('@')) return null;
  if (/^[\d\W_]+$/.test(cleaned)) return null;
  return cleaned;
};

const titleCase = (value: string) =>
  value
    .split(' ')
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');

const extractNameFromRawResume = (resumeText: string, email?: string | null): string | null => {
  const patterns = [
    /"(?:name|fullName|candidateName|candidate_name)"\s*:\s*"([^"]+)"/i,
    /(?:^|\n)\s*(?:name|full\s*name|candidate\s*name)\s*[:：]\s*([^\n]+)/i,
    /(?:^|\n)\s*(?:姓名|候选人姓名|名字)\s*[:：]\s*([^\n]+)/i,
  ];

  for (const pattern of patterns) {
    const match = resumeText.match(pattern);
    const candidate = match?.[1] ? sanitizeCandidateName(match[1]) : null;
    if (candidate) return candidate;
  }

  const lines = resumeText
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 10);

  for (const line of lines) {
    const compact = line.replace(/^[-*#\d.)\s]+/, '').trim();
    if (!compact) continue;
    if (compact.length > 40) continue;
    if (/[{}[\]":]/.test(compact)) continue;
    if (/@/.test(compact)) continue;
    if (/\d{3,}/.test(compact)) continue;
    if (/^(name|email|phone|summary|experience|education|skills|职位|邮箱|电话)\b/i.test(compact)) continue;

    const firstSegment = compact.split(/[，,|]/)[0] ?? compact;
    const candidate = sanitizeCandidateName(firstSegment);
    if (candidate) return candidate;
  }

  if (email) {
    const localPart = email.split('@')[0]?.replace(/[._-]+/g, ' ').trim();
    const fallback = localPart ? sanitizeCandidateName(titleCase(localPart)) : null;
    if (fallback) return fallback;
  }

  return null;
};

const extractTitleFromRawJd = (jdText: string): string | null => {
  const normalized = jdText.replace(/\r/g, '').trim();
  if (!normalized) return null;

  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const headingStripped = line.replace(/^#+\s*/, '').trim();
    const match = headingStripped.match(
      /^(?:job\s*title|position|role|职位|职位名称|岗位|岗位名称)\s*[:：-]\s*(.+)$/i
    );
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }

  const firstContentLine = lines[0]?.replace(/^#+\s*/, '').trim();
  if (firstContentLine) {
    return firstContentLine;
  }

  return null;
};

const extractResumeReviewInfo = (resumeText: string): ResumeReviewInfo => {
  const parsed = parsePossibleJson(resumeText);
  const payload = unwrapDataPayload(parsed);

  const nameFromPayload = getFirstStringByPaths(payload, [
    ['name'],
    ['candidateName'],
    ['fullName'],
    ['candidate', 'name'],
    ['profile', 'name'],
  ]);

  const emailFromPayload = getFirstStringByPaths(payload, [
    ['email'],
    ['candidateEmail'],
    ['contact', 'email'],
    ['candidate', 'email'],
  ]);

  const phoneFromPayload = getFirstStringByPaths(payload, [
    ['phone'],
    ['mobile'],
    ['contact', 'phone'],
    ['candidate', 'phone'],
  ]);

  const role = getFirstStringByPaths(payload, [
    ['title'],
    ['currentRole'],
    ['position'],
    ['jobTitle'],
    ['candidate', 'title'],
  ]);

  const summaryFromPayload = getFirstStringByPaths(payload, [
    ['summary'],
    ['professionalSummary'],
    ['overview'],
  ]);

  const email = emailFromPayload ?? extractEmail(resumeText);
  const name = sanitizeCandidateName(nameFromPayload || '') ?? extractNameFromRawResume(resumeText, email);

  return {
    name,
    email,
    phone: phoneFromPayload ?? extractPhone(resumeText),
    role,
    summary: summaryFromPayload ? truncateText(cleanText(summaryFromPayload), 140) : null,
  };
};

const extractJdReviewInfo = (jdText: string): JdReviewInfo => {
  const parsed = parsePossibleJson(jdText);
  const payload = unwrapDataPayload(parsed);

  const title = getFirstStringByPaths(payload, [
    ['title'],
    ['jobTitle'],
    ['position'],
    ['role'],
  ]);

  const company = getFirstStringByPaths(payload, [
    ['company'],
    ['companyName'],
    ['organization'],
  ]);

  const location = getFirstStringByPaths(payload, [
    ['location'],
    ['workLocation'],
  ]);

  const employmentType = getFirstStringByPaths(payload, [
    ['employmentType'],
    ['type'],
    ['jobType'],
  ]);

  const summary = getFirstStringByPaths(payload, [
    ['overview'],
    ['summary'],
    ['description'],
  ]);

  const requirementsCount = getArrayLengthByPaths(payload, [
    ['requirements'],
    ['mustHave'],
    ['qualifications'],
  ]);

  const fallbackTitle = extractTitleFromRawJd(jdText);

  return {
    title: title ?? fallbackTitle,
    company,
    location,
    employmentType,
    requirementsCount,
    summary: summary ? truncateText(cleanText(summary), 140) : null,
  };
};

export default function QuickInvite() {
  const { t } = useTranslation();
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jdFileInputRef = useRef<HTMLInputElement>(null);

  // Step state
  const [step, setStep] = useState<Step>('setup');

  // Form data
  const [jd, setJd] = useState('');
  const [jdFileName, setJdFileName] = useState<string | null>(null);
  const [jdUploading, setJdUploading] = useState(false);
  const [recruiterEmail, setRecruiterEmail] = useState(user?.email || 'hr@lightark.ai');
  const [interviewerRequirement, setInterviewerRequirement] = useState('');
  const [resumes, setResumes] = useState<ResumeEntry[]>([]);

  // UI state
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [pasteMode, setPasteMode] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [previewResume, setPreviewResume] = useState<ResumeEntry | null>(null);
  const [formattedResume, setFormattedResume] = useState<FormattedResume | null>(null);
  const [formatting, setFormatting] = useState(false);
  const [previewJd, setPreviewJd] = useState(false);
  const [formattedJd, setFormattedJd] = useState<FormattedJD | null>(null);
  const [formattingJd, setFormattingJd] = useState(false);

  const requireAuth = () => {
    if (!user) {
      navigate('/login', { state: { from: location } });
      return false;
    }
    return true;
  };

  // Format JD with LLM
  const formatJd = async (text: string) => {
    if (!requireAuth()) return;
    setFormattedJd(null);
    setFormattingJd(true);
    try {
      const response = await axios.post('/api/v1/format-jd', { text });
      if (response.data?.success && response.data.data) {
        setFormattedJd(response.data.data);
      }
    } catch {
      // silently fail
    } finally {
      setFormattingJd(false);
    }
  };

  // Open JD preview
  const handlePreviewJd = () => {
    if (!jd.trim()) return;
    setPreviewJd(true);
    if (!formattedJd) {
      formatJd(jd.trim());
    }
  };

  // Open resume preview — call LLM to format
  const handlePreviewResume = async (r: ResumeEntry) => {
    if (!requireAuth()) return;
    setPreviewResume(r);
    setFormattedResume(null);
    setFormatting(true);
    try {
      const response = await axios.post('/api/v1/format-resume', { text: r.text });
      if (response.data?.success && response.data.data) {
        setFormattedResume(response.data.data);
      }
    } catch {
      // silently fail — the modal will show raw text as fallback
    } finally {
      setFormatting(false);
    }
  };

  // Generate unique ID
  const genId = () => Math.random().toString(36).slice(2, 10);
  const createPastedResumeEntry = (text: string, index: number): ResumeEntry => ({
    id: genId(),
    fileName: t('pages.quickInvite.pastedResume', { num: index }),
    text: text.trim(),
    status: 'ready',
  });

  // Upload JD file (PDF, DOCX, XLSX, TXT)
  const handleJdFileUpload = async (files: FileList | null) => {
    if (!requireAuth()) return;
    if (!files || files.length === 0) return;
    const file = files[0];
    setJdUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await axios.post('/api/v1/extract-document', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (response.data?.data?.text) {
        const extractedText = response.data.data.text;
        setJd(extractedText);
        setJdFileName(file.name);
        setFormattedJd(null);
        // Auto-format JD in background
        formatJd(extractedText);
      }
    } catch (err) {
      const msg = axios.isAxiosError(err)
        ? err.response?.data?.error || err.message
        : String(err);
      setError(msg);
    } finally {
      setJdUploading(false);
      if (jdFileInputRef.current) jdFileInputRef.current.value = '';
    }
  };

  // Handle resume file upload (PDF, DOCX, XLSX, TXT)
  const handleFileUpload = useCallback(async (files: FileList | null) => {
    if (!user) { navigate('/login', { state: { from: location } }); return; }
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);

    const newEntries: ResumeEntry[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const formData = new FormData();
        formData.append('file', file);
        const response = await axios.post('/api/v1/extract-document', formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        });
        if (response.data?.data?.text) {
          newEntries.push({
            id: genId(),
            fileName: file.name,
            text: response.data.data.text,
            status: 'ready',
          });
        } else {
          newEntries.push({
            id: genId(),
            fileName: file.name,
            text: '',
            status: 'error',
            error: t('pages.quickInvite.extractFailed'),
          });
        }
      } catch (err) {
        const msg = axios.isAxiosError(err)
          ? err.response?.data?.error || err.message
          : String(err);
        newEntries.push({
          id: genId(),
          fileName: file.name,
          text: '',
          status: 'error',
          error: msg,
        });
      }
    }

    setResumes(prev => [...prev, ...newEntries]);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }, [t, user, navigate, location]);

  // Add resume from paste
  const handleAddPaste = () => {
    const trimmedPaste = pasteText.trim();
    if (!trimmedPaste) return;
    setResumes(prev => [...prev, createPastedResumeEntry(trimmedPaste, prev.length + 1)]);
    setPasteText('');
    setPasteMode(false);
  };

  // Remove resume
  const handleRemoveResume = (id: string) => {
    setResumes(prev => prev.filter(r => r.id !== id));
  };

  // Proceed to review
  const handleProceedToReview = () => {
    if (!jd.trim()) {
      setError(t('pages.quickInvite.errorNoJd'));
      return;
    }
    const readyResumes = resumes.filter(r => r.status === 'ready' && r.text.trim());
    const trimmedPaste = pasteText.trim();
    if (trimmedPaste) {
      const pastedEntry = createPastedResumeEntry(trimmedPaste, resumes.length + 1);
      readyResumes.push(pastedEntry);
      setResumes(prev => [...prev, pastedEntry]);
      setPasteText('');
      setPasteMode(false);
    }

    if (readyResumes.length === 0) {
      setError(t('pages.quickInvite.errorNoResumes'));
      return;
    }
    setError(null);
    setStep('review');
  };

  // Send all invitations
  const handleSendAll = async () => {
    if (!requireAuth()) return;
    setSending(true);
    setError(null);

    const readyResumes = resumes.filter(r => r.status === 'ready' && r.text.trim());

    // Update all to "sending"
    setResumes(prev =>
      prev.map(r =>
        r.status === 'ready' && r.text.trim()
          ? { ...r, status: 'sending' as const }
          : r
      )
    );

    // Send each resume individually via /api/v1/invite-candidate
    let stopped = false;
    for (const entry of readyResumes) {
      if (stopped) {
        // Mark remaining as ready (not sent) if we stopped early
        setResumes(prev =>
          prev.map(r => r.id === entry.id && r.status === 'sending' ? { ...r, status: 'ready' as const } : r)
        );
        continue;
      }

      try {
        const response = await axios.post('/api/v1/invite-candidate', {
          resume: entry.text,
          jd,
          recruiter_email: recruiterEmail,
          interviewer_requirement: interviewerRequirement || undefined,
        });

        if (response.data?.success && response.data.data) {
          setResumes(prev =>
            prev.map(r => r.id === entry.id ? { ...r, status: 'sent' as const, result: response.data.data } : r)
          );
        } else {
          setResumes(prev =>
            prev.map(r => r.id === entry.id ? { ...r, status: 'error' as const, error: response.data?.error || 'Failed' } : r)
          );
        }
      } catch (err) {
        const status = axios.isAxiosError(err) ? err.response?.status : undefined;
        const msg = axios.isAxiosError(err)
          ? err.response?.data?.error || err.message
          : String(err);

        setResumes(prev =>
          prev.map(r => r.id === entry.id ? { ...r, status: 'error' as const, error: msg } : r)
        );

        // Stop sending remaining resumes on 402 (usage limit exceeded)
        if (status === 402) {
          stopped = true;
          setError(msg);
        }
      }
    }

    setStep('results');
    setSending(false);
    void refreshUser();
  };

  // Stats
  const readyCount =
    resumes.filter(r => r.status === 'ready' && r.text.trim()).length +
    (pasteText.trim() ? 1 : 0);
  const sentCount = resumes.filter(r => r.status === 'sent').length;
  const errorCount = resumes.filter(r => r.status === 'error').length;
  const reviewResumes = useMemo(
    () =>
      resumes
        .filter((r) => r.status === 'ready' && r.text.trim())
        .map((entry) => ({ entry, info: extractResumeReviewInfo(entry.text) })),
    [resumes]
  );
  const recipientEmails = useMemo(
    () =>
      Array.from(
        new Set(
          reviewResumes
            .map(({ info }) => info.email)
            .filter((email): email is string => Boolean(email))
        )
      ),
    [reviewResumes]
  );
  const unresolvedRecipientCount = reviewResumes.filter(({ info }) => !info.email).length;
  const jdReviewInfo = useMemo(() => extractJdReviewInfo(jd), [jd]);
  const targetJobTitle = jdReviewInfo.title || t('pages.quickInvite.notSpecified', 'Not specified');

  return (
    <div className="landing-page min-h-screen">
      <SEO title={t('seo.quickInvite.title', 'Quick Interview Invite')} description={t('seo.quickInvite.desc', 'Upload resumes and job descriptions, then send interview invitations with QR codes and links to all candidates in one click.')} url="https://robohire.io/quick-invite" keywords={t('seo.quickInvite.keywords', 'batch interview invite, QR code interview, one-click hiring, candidate invitation, bulk resume upload')} />
      {/* Header */}
      <header className="landing-glass border-b border-slate-200/80 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center transition-opacity hover:opacity-80">
            <img src="/logo2.png" alt="RoboHire" className="h-7" />
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSelector variant="compact" className="rounded-full border border-slate-200 bg-white/90 px-1" />
            {user ? (
              <button
                onClick={() => navigate('/dashboard')}
                className="text-sm text-slate-600 hover:text-blue-700 transition-colors"
              >
                {t('apiPlayground.dashboard', 'Dashboard')}
              </button>
            ) : (
              <Link
                to="/login"
                className="text-sm text-white px-5 py-2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 shadow-[0_14px_28px_-16px_rgba(37,99,235,0.9)] transition-all hover:-translate-y-0.5"
              >
                {t('apiPlayground.signIn', 'Sign In')}
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Page Title */}
        <div className="mb-8">
          <h1 className="landing-display text-3xl font-semibold text-slate-900 sm:text-4xl">{t('pages.quickInvite.title')}</h1>
          <p className="text-slate-500 mt-2">{t('pages.quickInvite.subtitle')}</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-4 mb-8">
          {[
            { key: 'setup', label: t('pages.quickInvite.stepSetup'), num: 1 },
            { key: 'review', label: t('pages.quickInvite.stepReview'), num: 2 },
            { key: 'results', label: t('pages.quickInvite.stepResults'), num: 3 },
          ].map((s, i) => {
            const isCurrent = step === s.key;
            const isDone =
              (s.key === 'setup' && (step === 'review' || step === 'results')) ||
              (s.key === 'review' && step === 'results');
            return (
              <div key={s.key} className="flex items-center gap-2">
                {i > 0 && (
                  <div className={`w-8 sm:w-16 h-0.5 ${isDone || isCurrent ? 'bg-blue-500' : 'bg-gray-300'}`} />
                )}
                <div className="flex items-center gap-2">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
                      isDone
                        ? 'bg-blue-600 text-white'
                        : isCurrent
                          ? 'bg-blue-600 text-white ring-4 ring-blue-100'
                          : 'bg-gray-200 text-gray-500'
                    }`}
                  >
                    {isDone ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    ) : (
                      s.num
                    )}
                  </div>
                  <span className={`text-sm font-medium hidden sm:inline ${isCurrent ? 'text-blue-700' : isDone ? 'text-blue-600' : 'text-gray-400'}`}>
                    {s.label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Error Banner */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Auth Warning */}
        {!user && (
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm">
              <p className="font-medium text-blue-800">{t('pages.quickInvite.authRequired')}</p>
              <p className="text-blue-700 mt-1">{t('pages.quickInvite.authRequiredDesc')}</p>
            </div>
          </div>
        )}

        {/* ======================= STEP 1: SETUP ======================= */}
        {step === 'setup' && (
          <div className="space-y-6">
            {/* Job Description */}
            <div className="landing-gradient-stroke rounded-[28px] bg-white p-7 shadow-[0_28px_56px_-42px_rgba(15,23,42,0.7)]">
              <div className="flex items-center justify-between mb-1">
                <h2 className="landing-display text-lg font-semibold text-slate-900">
                  {t('pages.quickInvite.jdTitle')}
                </h2>
                <div className="flex items-center gap-2">
                  {jdFileName && (
                    <span className="text-xs text-blue-600 bg-blue-50 px-2 py-1 rounded-full flex items-center gap-1.5">
                      {jdFileName}
                      {formattingJd && (
                        <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                      )}
                    </span>
                  )}
                  {/* View formatted JD */}
                  {jd.trim() && (formattedJd || jdFileName) && (
                    <button
                      onClick={handlePreviewJd}
                      className="text-gray-400 hover:text-blue-600 transition-colors p-1"
                      title={t('pages.quickInvite.viewJd', 'View formatted JD')}
                    >
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={() => jdFileInputRef.current?.click()}
                    disabled={jdUploading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50"
                  >
                    {jdUploading ? (
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                    )}
                    {t('pages.quickInvite.uploadJd')}
                  </button>
                  <input
                    ref={jdFileInputRef}
                    type="file"
                    accept={DOC_ACCEPT}
                    onChange={(e) => handleJdFileUpload(e.target.files)}
                    className="hidden"
                  />
                </div>
              </div>
              <p className="text-sm text-slate-500 mb-4">
                {t('pages.quickInvite.jdDesc')}
                <span className="text-xs text-slate-400 ml-1">({t('pages.quickInvite.jdFormats')})</span>
              </p>
              <textarea
                value={jd}
                onChange={(e) => { setJd(e.target.value); setJdFileName(null); setFormattedJd(null); }}
                placeholder={t('pages.quickInvite.jdPlaceholder')}
                rows={8}
                className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm transition-colors resize-y"
              />
            </div>

            {/* Resumes Upload */}
            <div className="landing-gradient-stroke rounded-[28px] bg-white p-7 shadow-[0_28px_56px_-42px_rgba(15,23,42,0.7)]">
              <h2 className="landing-display text-lg font-semibold text-slate-900 mb-1">
                {t('pages.quickInvite.resumesTitle')}
              </h2>
              <p className="text-sm text-slate-500 mb-4">{t('pages.quickInvite.resumesDesc')}</p>

              {/* Upload Zone */}
              <div
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('border-blue-500', 'bg-blue-50'); }}
                onDragLeave={(e) => { e.preventDefault(); e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50'); }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.currentTarget.classList.remove('border-blue-500', 'bg-blue-50');
                  handleFileUpload(e.dataTransfer.files);
                }}
                className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept={DOC_ACCEPT}
                  multiple
                  onChange={(e) => handleFileUpload(e.target.files)}
                  className="hidden"
                />
                {uploading ? (
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                    <span className="text-blue-700 font-medium">{t('pages.quickInvite.uploading')}</span>
                  </div>
                ) : (
                  <>
                    <div className="text-4xl mb-2">📄</div>
                    <p className="text-gray-700 font-medium">{t('pages.quickInvite.dropResumes')}</p>
                    <p className="text-gray-400 text-sm mt-1">{t('pages.quickInvite.supportedFormats')}</p>
                  </>
                )}
              </div>

              {/* Paste Option */}
              <div className="mt-3 flex items-center gap-2">
                <button
                  onClick={() => setPasteMode(!pasteMode)}
                  className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
                >
                  {pasteMode ? t('pages.quickInvite.hideTextInput') : t('pages.quickInvite.pasteInstead')}
                </button>
              </div>

              {pasteMode && (
                <div className="mt-3 space-y-2">
                  <textarea
                    value={pasteText}
                    onChange={(e) => setPasteText(e.target.value)}
                    placeholder={t('pages.quickInvite.pastePlaceholder')}
                    rows={6}
                    className="w-full px-4 py-3 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                  <button
                    onClick={handleAddPaste}
                    disabled={!pasteText.trim()}
                    className="px-4 py-2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:-translate-y-0.5"
                  >
                    {t('pages.quickInvite.addResume')}
                  </button>
                </div>
              )}

              {/* Resume List */}
              {resumes.length > 0 && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm font-medium text-gray-700">
                    {t('pages.quickInvite.resumeCount', { count: resumes.length })}
                  </p>
                  {resumes.map((r) => (
                    <div
                      key={r.id}
                      className={`flex items-center justify-between px-4 py-3 rounded-lg border ${
                        r.status === 'error'
                          ? 'bg-red-50 border-red-200'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-lg flex-shrink-0">
                          {r.status === 'error' ? '❌' : '📄'}
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{r.fileName}</p>
                          {r.error && <p className="text-xs text-red-600">{r.error}</p>}
                          {r.text && !r.error && (
                            <p className="text-xs text-gray-500 truncate">
                              {r.text.substring(0, 80)}...
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        {r.text && !r.error && (
                          <button
                            onClick={() => handlePreviewResume(r)}
                            className="text-gray-400 hover:text-blue-600 transition-colors p-1"
                            title={t('pages.quickInvite.viewResume')}
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                            </svg>
                          </button>
                        )}
                        <button
                          onClick={() => handleRemoveResume(r.id)}
                          className="text-gray-400 hover:text-red-500 transition-colors p-1"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Settings (collapsible) */}
            <div className="landing-gradient-stroke rounded-[28px] bg-white p-7 shadow-[0_28px_56px_-42px_rgba(15,23,42,0.7)]">
              <h2 className="landing-display text-lg font-semibold text-slate-900 mb-4">
                {t('pages.quickInvite.settingsTitle')}
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t('pages.quickInvite.recruiterEmail')}
                  </label>
                  <input
                    type="email"
                    value={recruiterEmail}
                    onChange={(e) => setRecruiterEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    {t('pages.quickInvite.interviewerReq')} <span className="text-slate-400">({t('pages.quickInvite.optional')})</span>
                  </label>
                  <input
                    type="text"
                    value={interviewerRequirement}
                    onChange={(e) => setInterviewerRequirement(e.target.value)}
                    placeholder={t('pages.quickInvite.interviewerPlaceholder')}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Next Button */}
            <div className="flex justify-end">
              <button
                onClick={handleProceedToReview}
                disabled={!jd.trim() || readyCount === 0}
                className="px-8 py-3 rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold shadow-[0_20px_35px_-20px_rgba(37,99,235,0.95)] disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_42px_-20px_rgba(37,99,235,0.95)]"
              >
                {t('pages.quickInvite.reviewAndSend')} ({readyCount})
              </button>
            </div>
          </div>
        )}

        {/* ======================= STEP 2: REVIEW ======================= */}
        {step === 'review' && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="landing-gradient-stroke rounded-[28px] bg-white p-7 shadow-[0_28px_56px_-42px_rgba(15,23,42,0.7)]">
              <h2 className="landing-display text-lg font-semibold text-slate-900 mb-4">
                {t('pages.quickInvite.reviewTitle')}
              </h2>

              <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t('pages.quickInvite.invitationOverview', 'Invitation overview')}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {t(
                    'pages.quickInvite.inviteScope',
                    'All {{count}} candidate(s) below will be invited to interview for this one position.',
                    { count: readyCount }
                  )}
                </p>
                <h3 className="mt-2 text-xl font-semibold text-slate-900 leading-snug break-words">
                  {targetJobTitle}
                </h3>
                {(jdReviewInfo.company || jdReviewInfo.location || jdReviewInfo.employmentType) && (
                  <p className="mt-2 text-sm text-slate-600 break-words">
                    {[jdReviewInfo.company, jdReviewInfo.location, jdReviewInfo.employmentType]
                      .filter(Boolean)
                      .join(' • ')}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-5">
                <div className="bg-blue-50 rounded-2xl p-4 text-center">
                  <p className="landing-display text-3xl font-bold text-blue-600">{readyCount}</p>
                  <p className="text-sm text-blue-700">{t('pages.quickInvite.candidatesReady')}</p>
                </div>
                <div className="bg-cyan-50 rounded-2xl p-4 text-center">
                  <p className="text-sm font-medium text-cyan-700 mb-1">{t('pages.quickInvite.from')}</p>
                  <p className="text-sm text-cyan-700 break-all">{recruiterEmail}</p>
                </div>
                <div className="bg-violet-50 rounded-2xl p-4 text-center">
                  <p className="text-sm font-medium text-violet-700 mb-1">
                    {t('pages.quickInvite.recipientsRecognized', 'Recipients recognized')}
                  </p>
                  <p className="landing-display text-3xl font-bold text-violet-600">{recipientEmails.length}</p>
                  {unresolvedRecipientCount > 0 ? (
                    <p className="text-xs text-violet-600 mt-1">
                      {t('pages.quickInvite.unresolvedRecipients', '{{count}} resume(s) without visible email', {
                        count: unresolvedRecipientCount,
                      })}
                    </p>
                  ) : (
                    <p className="text-xs text-violet-500 mt-1">
                      {t('pages.quickInvite.allRecipientsReady', 'All recipients have visible emails')}
                    </p>
                  )}
                </div>
              </div>

              <div className="mb-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">
                  {t('pages.quickInvite.toLabel', 'To')}
                </p>
                {recipientEmails.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {recipientEmails.map((email) => (
                      <span
                        key={email}
                        className="rounded-full bg-violet-50 border border-violet-200 px-2.5 py-1 text-xs text-violet-700"
                      >
                        {email}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-violet-600">
                    {t('pages.quickInvite.emailMissing', 'Email will be extracted when sending')}
                  </p>
                )}
              </div>

              {(jdReviewInfo.summary || jdReviewInfo.requirementsCount > 0 || interviewerRequirement.trim()) && (
                <div className="mb-5 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
                    {t('pages.quickInvite.jdSummary', 'What will be sent')}
                  </p>
                  {jdReviewInfo.summary && (
                    <p className="text-sm text-slate-700 mb-1">{jdReviewInfo.summary}</p>
                  )}
                  <div className="flex flex-wrap gap-2 text-xs text-slate-600">
                    {jdReviewInfo.requirementsCount > 0 && (
                      <span className="rounded-full bg-white px-2.5 py-1 border border-slate-200">
                        {t('pages.quickInvite.requirementsCount', '{{count}} requirements', {
                          count: jdReviewInfo.requirementsCount,
                        })}
                      </span>
                    )}
                    {interviewerRequirement.trim() && (
                      <span className="rounded-full bg-white px-2.5 py-1 border border-slate-200">
                        {t('pages.quickInvite.interviewerReq', 'Interviewer Requirement')}:{' '}
                        {truncateText(cleanText(interviewerRequirement.trim()), 80)}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Candidate Preview List */}
              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-700 mb-2">
                  {t('pages.quickInvite.candidateReviewTitle', 'Candidates receiving this invitation')}
                </p>
                {reviewResumes.map(({ entry, info }, i) => {
                  const candidateDisplayName =
                    info.name ||
                    (info.email ? info.email.split('@')[0] : null) ||
                    t('pages.quickInvite.candidateFallback', 'Candidate #{{num}}', { num: i + 1 });

                  return (
                    <div key={entry.id} className="px-4 py-3 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="flex items-start gap-3">
                        <span className="text-sm font-bold text-slate-400 w-6 pt-0.5">{i + 1}</span>
                        <span className="text-lg">📄</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <p className="text-sm font-semibold text-slate-800 truncate">
                              {candidateDisplayName}
                            </p>
                            <span className="text-xs text-slate-500 truncate">
                              {t('pages.quickInvite.sourceLabel', 'Source')}: {entry.fileName}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mb-2 break-words">
                            {t('pages.quickInvite.invitedPositionLabel', 'Invited Position')}:{' '}
                            <span className="font-medium text-slate-700">{targetJobTitle}</span>
                          </p>
                          <div className="flex flex-wrap gap-2 text-xs">
                            <span className="rounded-full bg-white px-2.5 py-1 border border-slate-200 text-slate-600">
                              {t('pages.quickInvite.email', 'Email')}:{' '}
                              {info.email || t('pages.quickInvite.notFound', 'Not found')}
                            </span>
                            {info.phone && (
                              <span className="rounded-full bg-white px-2.5 py-1 border border-slate-200 text-slate-600">
                                {t('pages.quickInvite.phoneLabel', 'Phone')}: {info.phone}
                              </span>
                            )}
                            {info.role && (
                              <span className="rounded-full bg-white px-2.5 py-1 border border-slate-200 text-slate-600">
                                {t('pages.quickInvite.roleLabel', 'Role')}: {info.role}
                              </span>
                            )}
                          </div>
                          {info.summary && (
                            <p className="text-xs text-slate-500 mt-2">{info.summary}</p>
                          )}
                          {!info.email && (
                            <p className="text-xs text-amber-600 mt-2">
                              {t(
                                'pages.quickInvite.emailMissingCandidate',
                                'Email is not visible in this resume. Please confirm before sending.'
                              )}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => setStep('setup')}
                className="px-6 py-3 text-gray-600 font-medium hover:text-gray-800 transition-colors"
              >
                {t('pages.quickInvite.back')}
              </button>
              <button
                onClick={handleSendAll}
                disabled={sending || readyCount === 0}
                className="px-8 py-3 rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold shadow-[0_20px_35px_-20px_rgba(37,99,235,0.95)] disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_42px_-20px_rgba(37,99,235,0.95)] flex items-center gap-2"
              >
                {sending ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    {t('pages.quickInvite.sending')}
                  </>
                ) : (
                  <>
                    {t('pages.quickInvite.sendInvitations')} ({readyCount})
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* ======================= STEP 3: RESULTS ======================= */}
        {step === 'results' && (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-green-50 border border-green-200 rounded-2xl p-5 text-center">
                <p className="landing-display text-3xl font-bold text-green-600">{sentCount}</p>
                <p className="text-sm text-green-700">{t('pages.quickInvite.sentSuccess')}</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-2xl p-5 text-center">
                <p className="landing-display text-3xl font-bold text-red-600">{errorCount}</p>
                <p className="text-sm text-red-700">{t('pages.quickInvite.sentFailed')}</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5 text-center">
                <p className="landing-display text-3xl font-bold text-blue-600">{resumes.length}</p>
                <p className="text-sm text-blue-700">{t('pages.quickInvite.totalProcessed')}</p>
              </div>
            </div>

            {/* Results List */}
            <div className="space-y-4">
              {resumes.map((r) => (
                <div
                  key={r.id}
                  className={`bg-white rounded-2xl border p-6 ${
                    r.status === 'sent'
                      ? 'border-green-200'
                      : r.status === 'error'
                        ? 'border-red-200'
                        : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    <div className="text-2xl flex-shrink-0">
                      {r.status === 'sent' ? '✅' : r.status === 'error' ? '❌' : '⏳'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-gray-800">{r.fileName}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          r.status === 'sent'
                            ? 'bg-green-100 text-green-700'
                            : r.status === 'error'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-gray-100 text-gray-700'
                        }`}>
                          {r.status === 'sent'
                            ? t('pages.quickInvite.statusSent')
                            : r.status === 'error'
                              ? t('pages.quickInvite.statusFailed')
                              : t('pages.quickInvite.statusPending')}
                        </span>
                      </div>

                      {r.status === 'error' && r.error && (
                        <p className="text-sm text-red-600">{r.error}</p>
                      )}

                      {r.status === 'sent' && r.result && (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                          {/* Candidate Info */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 w-16">{t('pages.quickInvite.name')}</span>
                              <span className="text-sm font-medium">{r.result.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 w-16">{t('pages.quickInvite.email')}</span>
                              <span className="text-sm font-medium">{r.result.email}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 w-16">{t('pages.quickInvite.position')}</span>
                              <span className="text-sm font-medium">{r.result.job_title}</span>
                            </div>
                            <div className="mt-2">
                              <a
                                href={r.result.login_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm text-blue-600 hover:text-blue-800 break-all"
                              >
                                {r.result.login_url}
                              </a>
                            </div>
                          </div>

                          {/* QR Code */}
                          {r.result.qrcode_url && (
                            <div className="flex items-center gap-3">
                              <div className="bg-white rounded-lg p-2 border border-gray-200 shadow-sm">
                                <img
                                  src={r.result.qrcode_url}
                                  alt={t('pages.quickInvite.qrAlt')}
                                  className="w-28 h-28"
                                />
                              </div>
                              <div className="text-xs text-gray-500">
                                <p className="font-medium">{t('pages.quickInvite.scanQr')}</p>
                                <p>{t('pages.quickInvite.qrHint')}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4">
              <button
                onClick={() => {
                  setResumes([]);
                  setJd('');
                  setStep('setup');
                  setError(null);
                }}
                className="px-6 py-3 text-blue-600 font-medium hover:text-blue-700 transition-colors"
              >
                {t('pages.quickInvite.startNew')}
              </button>
              <button
                onClick={() => navigate('/product/talent')}
                className="px-6 py-3 rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 text-white font-semibold shadow-[0_20px_35px_-20px_rgba(37,99,235,0.95)] transition-all hover:-translate-y-0.5 hover:shadow-[0_24px_42px_-20px_rgba(37,99,235,0.95)]"
              >
                {t('pages.quickInvite.viewResumeLibrary')}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Resume Preview Modal — Professional Layout */}
      {previewResume && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => { setPreviewResume(null); setFormattedResume(null); }}
        >
          <div
            className="bg-white rounded-[28px] shadow-[0_40px_72px_-48px_rgba(15,23,42,0.8)] max-w-3xl w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="min-w-0">
                <h3 className="landing-display text-lg font-semibold text-slate-900 truncate">
                  {previewResume.fileName}
                </h3>
                <p className="text-xs text-gray-500">
                  {formatting
                    ? t('pages.quickInvite.formattingResume', 'Formatting with AI...')
                    : t('pages.quickInvite.resumePreviewChars', { count: previewResume.text.length })}
                </p>
              </div>
              <button
                onClick={() => { setPreviewResume(null); setFormattedResume(null); }}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto">
              {formatting ? (
                /* Loading skeleton */
                <div className="p-8 space-y-6 animate-pulse">
                  <div className="text-center space-y-3">
                    <div className="h-8 bg-gray-200 rounded w-48 mx-auto" />
                    <div className="h-4 bg-gray-100 rounded w-32 mx-auto" />
                    <div className="flex justify-center gap-4 mt-2">
                      <div className="h-3 bg-gray-100 rounded w-28" />
                      <div className="h-3 bg-gray-100 rounded w-28" />
                    </div>
                  </div>
                  <div className="h-px bg-gray-200" />
                  <div className="space-y-2">
                    <div className="h-5 bg-gray-200 rounded w-36" />
                    <div className="h-3 bg-gray-100 rounded w-full" />
                    <div className="h-3 bg-gray-100 rounded w-5/6" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-5 bg-gray-200 rounded w-28" />
                    <div className="h-4 bg-gray-100 rounded w-56" />
                    <div className="h-3 bg-gray-100 rounded w-full" />
                    <div className="h-3 bg-gray-100 rounded w-4/5" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-5 bg-gray-200 rounded w-24" />
                    <div className="flex gap-2 flex-wrap">
                      {[1,2,3,4,5].map(i => <div key={i} className="h-6 bg-gray-100 rounded-full w-16" />)}
                    </div>
                  </div>
                </div>
              ) : formattedResume && formattedResume.name ? (
                /* Professionally formatted resume */
                <div className="p-8">
                  {/* Header — Name & Title */}
                  <div className="text-center mb-1">
                    <h1 className="text-2xl font-bold text-gray-900 tracking-wide">
                      {formattedResume.name}
                    </h1>
                    {formattedResume.title && (
                      <p className="text-base text-blue-600 font-medium mt-1">{formattedResume.title}</p>
                    )}
                  </div>

                  {/* Contact Row */}
                  {formattedResume.contact.length > 0 && (
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 mt-3 text-xs text-gray-500">
                      {formattedResume.contact.filter(c => c.value).map((c, i) => (
                        <span key={i} className="flex items-center gap-1">
                          {c.type === 'email' && (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                          )}
                          {c.type === 'phone' && (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" /></svg>
                          )}
                          {c.type === 'location' && (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          )}
                          {c.type === 'linkedin' && (
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
                          )}
                          {c.type === 'github' && (
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.374 0 0 5.373 0 12c0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z" /></svg>
                          )}
                          {!['email','phone','location','linkedin','github'].includes(c.type) && (
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" /></svg>
                          )}
                          <span>{c.value}</span>
                        </span>
                      ))}
                    </div>
                  )}

                  <div className="border-t border-slate-200 mt-4 mb-5" />

                  {/* Summary */}
                  {formattedResume.summary && (
                    <div className="mb-5">
                      <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <span className="w-4 h-px bg-slate-300" />
                        {t('pages.quickInvite.resumeSections.summary', 'Summary')}
                      </h2>
                      <p className="text-sm text-gray-700 leading-relaxed">{formattedResume.summary}</p>
                    </div>
                  )}

                  {/* Experience */}
                  {formattedResume.experience.length > 0 && (
                    <div className="mb-5">
                      <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <span className="w-4 h-px bg-slate-300" />
                        {t('pages.quickInvite.resumeSections.experience', 'Experience')}
                      </h2>
                      <div className="space-y-4">
                        {formattedResume.experience.map((exp, i) => (
                          <div key={i}>
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <h3 className="text-sm font-semibold text-gray-900">{exp.role}</h3>
                                <p className="text-sm text-blue-600 font-medium">
                                  {exp.company}
                                  {exp.location && <span className="text-gray-400 font-normal"> · {exp.location}</span>}
                                </p>
                              </div>
                              {exp.period && (
                                <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0 pt-0.5">{exp.period}</span>
                              )}
                            </div>
                            {exp.bullets.length > 0 && (
                              <ul className="mt-1.5 space-y-1">
                                {exp.bullets.map((b, j) => (
                                  <li key={j} className="text-xs text-gray-600 leading-relaxed flex gap-2">
                                    <span className="text-blue-400 mt-1.5 flex-shrink-0">•</span>
                                    <span>{b}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Education */}
                  {formattedResume.education.length > 0 && (
                    <div className="mb-5">
                      <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <span className="w-4 h-px bg-slate-300" />
                        {t('pages.quickInvite.resumeSections.education', 'Education')}
                      </h2>
                      <div className="space-y-2">
                        {formattedResume.education.map((edu, i) => (
                          <div key={i} className="flex items-start justify-between gap-2">
                            <div>
                              <h3 className="text-sm font-semibold text-gray-900">{edu.institution}</h3>
                              <p className="text-xs text-gray-600">
                                {edu.degree}{edu.field && ` — ${edu.field}`}
                              </p>
                            </div>
                            {edu.period && (
                              <span className="text-xs text-gray-400 whitespace-nowrap flex-shrink-0 pt-0.5">{edu.period}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Skills */}
                  {formattedResume.skills.length > 0 && (
                    <div className="mb-5">
                      <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <span className="w-4 h-px bg-slate-300" />
                        {t('pages.quickInvite.resumeSections.skills', 'Skills')}
                      </h2>
                      <div className="space-y-2">
                        {formattedResume.skills.map((cat, i) => (
                          <div key={i}>
                            <span className="text-xs font-semibold text-gray-700">{cat.category}: </span>
                            <span className="text-xs text-gray-600">{cat.items.join(' · ')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Projects */}
                  {formattedResume.projects.length > 0 && (
                    <div className="mb-5">
                      <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <span className="w-4 h-px bg-slate-300" />
                        {t('pages.quickInvite.resumeSections.projects', 'Projects')}
                      </h2>
                      <div className="space-y-3">
                        {formattedResume.projects.map((proj, i) => (
                          <div key={i}>
                            <h3 className="text-sm font-semibold text-gray-900">{proj.name}</h3>
                            {proj.description && (
                              <p className="text-xs text-gray-600 mt-0.5">{proj.description}</p>
                            )}
                            {proj.technologies.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1">
                                {proj.technologies.map((tech, j) => (
                                  <span key={j} className="px-1.5 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px] font-medium">
                                    {tech}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Certifications */}
                  {formattedResume.certifications.length > 0 && (
                    <div className="mb-5">
                      <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <span className="w-4 h-px bg-slate-300" />
                        {t('pages.quickInvite.resumeSections.certifications', 'Certifications')}
                      </h2>
                      <ul className="space-y-1">
                        {formattedResume.certifications.map((c, i) => (
                          <li key={i} className="text-xs text-gray-600 flex gap-2">
                            <span className="text-blue-400">•</span>
                            <span>{c}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Languages */}
                  {formattedResume.languages.length > 0 && (
                    <div className="mb-5">
                      <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <span className="w-4 h-px bg-slate-300" />
                        {t('pages.quickInvite.resumeSections.languages', 'Languages')}
                      </h2>
                      <p className="text-xs text-gray-600">{formattedResume.languages.join(' · ')}</p>
                    </div>
                  )}

                  {/* Awards */}
                  {formattedResume.awards.length > 0 && (
                    <div className="mb-5">
                      <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <span className="w-4 h-px bg-slate-300" />
                        {t('pages.quickInvite.resumeSections.awards', 'Awards')}
                      </h2>
                      <ul className="space-y-1">
                        {formattedResume.awards.map((a, i) => (
                          <li key={i} className="text-xs text-gray-600 flex gap-2">
                            <span className="text-amber-400">★</span>
                            <span>{a}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                /* Fallback: raw text if formatting failed */
                <div className="p-6">
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                    {previewResume.text}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* JD Preview Modal — Professional Layout */}
      {previewJd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setPreviewJd(false)}
        >
          <div
            className="bg-white rounded-[28px] shadow-[0_40px_72px_-48px_rgba(15,23,42,0.8)] max-w-3xl w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
              <div className="min-w-0">
                <h3 className="landing-display text-lg font-semibold text-slate-900 truncate">
                  {jdFileName || t('pages.quickInvite.jdTitle')}
                </h3>
                <p className="text-xs text-gray-500">
                  {formattingJd
                    ? t('pages.quickInvite.formattingJd', 'Formatting with AI...')
                    : t('pages.quickInvite.jdPreviewChars', { count: jd.length, defaultValue: '{{count}} characters' })}
                </p>
              </div>
              <button
                onClick={() => setPreviewJd(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-auto">
              {formattingJd ? (
                /* Loading skeleton */
                <div className="p-8 space-y-6 animate-pulse">
                  <div className="space-y-3">
                    <div className="h-8 bg-gray-200 rounded w-64" />
                    <div className="flex gap-3">
                      <div className="h-4 bg-gray-100 rounded w-32" />
                      <div className="h-4 bg-gray-100 rounded w-24" />
                      <div className="h-4 bg-gray-100 rounded w-28" />
                    </div>
                  </div>
                  <div className="h-px bg-gray-200" />
                  <div className="space-y-2">
                    <div className="h-5 bg-gray-200 rounded w-24" />
                    <div className="h-3 bg-gray-100 rounded w-full" />
                    <div className="h-3 bg-gray-100 rounded w-5/6" />
                    <div className="h-3 bg-gray-100 rounded w-4/5" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-5 bg-gray-200 rounded w-36" />
                    <div className="h-3 bg-gray-100 rounded w-full" />
                    <div className="h-3 bg-gray-100 rounded w-full" />
                    <div className="h-3 bg-gray-100 rounded w-3/4" />
                  </div>
                  <div className="space-y-2">
                    <div className="h-5 bg-gray-200 rounded w-28" />
                    <div className="flex gap-2 flex-wrap">
                      {[1,2,3,4,5,6].map(i => <div key={i} className="h-6 bg-gray-100 rounded-full w-20" />)}
                    </div>
                  </div>
                </div>
              ) : formattedJd && formattedJd.jobTitle ? (
                /* Professionally formatted JD */
                <div className="p-8">
                  {/* Header — Title & Meta */}
                  <div className="mb-1">
                    <h1 className="text-2xl font-bold text-gray-900">
                      {formattedJd.jobTitle}
                    </h1>
                    <div className="flex flex-wrap items-center gap-3 mt-2">
                      {formattedJd.company && (
                        <span className="flex items-center gap-1 text-sm text-blue-600 font-medium">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
                          {formattedJd.company}
                        </span>
                      )}
                      {formattedJd.location && (
                        <span className="flex items-center gap-1 text-sm text-gray-500">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          {formattedJd.location}
                        </span>
                      )}
                      {formattedJd.employmentType && (
                        <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 text-xs font-medium rounded-full">
                          {formattedJd.employmentType}
                        </span>
                      )}
                      {formattedJd.department && (
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-full">
                          {formattedJd.department}
                        </span>
                      )}
                      {formattedJd.salary && (
                        <span className="flex items-center gap-1 text-sm text-amber-600 font-medium">
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                          {formattedJd.salary}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="border-t border-slate-200 mt-4 mb-5" />

                  {/* Overview */}
                  {formattedJd.overview && (
                    <div className="mb-5">
                      <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <span className="w-4 h-px bg-slate-300" />
                        {t('pages.quickInvite.jdSections.overview', 'Overview')}
                      </h2>
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{formattedJd.overview}</p>
                    </div>
                  )}

                  {/* Responsibilities */}
                  {formattedJd.responsibilities.length > 0 && (
                    <div className="mb-5">
                      <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <span className="w-4 h-px bg-slate-300" />
                        {t('pages.quickInvite.jdSections.responsibilities', 'Responsibilities')}
                      </h2>
                      <ul className="space-y-1.5">
                        {formattedJd.responsibilities.map((item, i) => (
                          <li key={i} className="text-xs text-gray-600 leading-relaxed flex gap-2">
                            <span className="text-blue-400 mt-1.5 flex-shrink-0">•</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Requirements */}
                  {formattedJd.requirements.length > 0 && (
                    <div className="mb-5">
                      <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <span className="w-4 h-px bg-slate-300" />
                        {t('pages.quickInvite.jdSections.requirements', 'Requirements')}
                      </h2>
                      <ul className="space-y-1.5">
                        {formattedJd.requirements.map((item, i) => (
                          <li key={i} className="text-xs text-gray-600 leading-relaxed flex gap-2">
                            <span className="text-emerald-500 mt-1 flex-shrink-0">
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg>
                            </span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Preferred Qualifications */}
                  {formattedJd.preferredQualifications.length > 0 && (
                    <div className="mb-5">
                      <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <span className="w-4 h-px bg-slate-300" />
                        {t('pages.quickInvite.jdSections.preferred', 'Preferred Qualifications')}
                      </h2>
                      <ul className="space-y-1.5">
                        {formattedJd.preferredQualifications.map((item, i) => (
                          <li key={i} className="text-xs text-gray-600 leading-relaxed flex gap-2">
                            <span className="text-amber-400 mt-1.5 flex-shrink-0">★</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Skills */}
                  {formattedJd.skills.length > 0 && (
                    <div className="mb-5">
                      <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <span className="w-4 h-px bg-slate-300" />
                        {t('pages.quickInvite.jdSections.skills', 'Skills')}
                      </h2>
                      <div className="flex flex-wrap gap-1.5">
                        {formattedJd.skills.map((skill, i) => (
                          <span key={i} className="px-2 py-0.5 bg-blue-50 text-blue-600 rounded-full text-[11px] font-medium">
                            {skill}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Benefits */}
                  {formattedJd.benefits.length > 0 && (
                    <div className="mb-5">
                      <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-2">
                        <span className="w-4 h-px bg-slate-300" />
                        {t('pages.quickInvite.jdSections.benefits', 'Benefits')}
                      </h2>
                      <ul className="space-y-1.5">
                        {formattedJd.benefits.map((item, i) => (
                          <li key={i} className="text-xs text-gray-600 leading-relaxed flex gap-2">
                            <span className="text-green-500 flex-shrink-0">✓</span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* About */}
                  {formattedJd.about && (
                    <div className="mb-5">
                      <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <span className="w-4 h-px bg-slate-300" />
                        {t('pages.quickInvite.jdSections.about', 'About the Company')}
                      </h2>
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{formattedJd.about}</p>
                    </div>
                  )}

                  {/* Other sections */}
                  {formattedJd.other.length > 0 && formattedJd.other.map((section, i) => (
                    <div key={i} className="mb-5">
                      <h2 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2 flex items-center gap-2">
                        <span className="w-4 h-px bg-slate-300" />
                        {section.heading}
                      </h2>
                      <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-line">{section.content}</p>
                    </div>
                  ))}
                </div>
              ) : (
                /* Fallback: raw text if formatting failed */
                <div className="p-6">
                  <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans leading-relaxed">
                    {jd}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
