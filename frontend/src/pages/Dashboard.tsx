import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useAuth } from '../context/AuthContext';
import { API_BASE } from '../config';
import SEO from '../components/SEO';
import AutoMatchPanel from '../components/AutoMatchPanel';
import IntelligenceReportPanel from '../components/IntelligenceReportPanel';
import { formatDateTimeLabel } from '../utils/dateTime';

interface HiringRequest {
  id: string;
  title: string;
  clientName?: string | null;
  requirements: string;
  jobDescription?: string;
  status: 'active' | 'paused' | 'closed';
  createdAt: string;
  updatedAt: string;
  _count?: {
    candidates: number;
    resumeJobFits: number;
  };
}

interface Candidate {
  id: string;
  name?: string | null;
  email?: string | null;
  status?: 'pending' | 'screening' | 'interviewed' | 'shortlisted' | 'rejected';
  matchScore?: number | null;
  createdAt: string;
  updatedAt: string;
}

interface HiringRequestDetail extends HiringRequest {
  candidates: Candidate[];
  stats?: {
    matches: number;
    invited: number;
    interviewsCompleted: number;
  };
}

interface ParsedSection {
  title: string;
  items: string[];
}

interface ParsedJobContent {
  intro: string[];
  sections: ParsedSection[];
  trailing: string[];
}

const SECTION_PATTERNS: Array<{ pattern: RegExp; title: string }> = [
  { pattern: /^(职责|岗位职责|工作职责|核心职责|主要职责|你将负责|job responsibilities|responsibilities)$/i, title: '职责' },
  { pattern: /^(要求|任职要求|任职资格|职位要求|我们希望你具备|岗位要求|基本要求|requirements?|qualifications?)$/i, title: '要求' },
  { pattern: /^(加分项|优先条件|加分条件|附加优势|bonus|nice to have|preferred|plus)$/i, title: '加分项' },
  { pattern: /^(职位概述|岗位概述|职位简介|岗位描述|职位描述|overview|summary|about the role)$/i, title: '职位概述' },
  { pattern: /^(职位福利|福利待遇|薪资福利|benefits?|perks|compensation)$/i, title: '福利待遇' },
  { pattern: /^(技术栈|技术要求|tech stack|technologies)$/i, title: '技术栈' },
  { pattern: /^(团队介绍|关于团队|about the team|team)$/i, title: '团队介绍' },
  { pattern: /^(公司介绍|关于公司|关于我们|about us|about the company|company)$/i, title: '公司介绍' },
  { pattern: /^(工作地点|工作方式|location|work location|work mode)$/i, title: '工作地点' },
];

function cleanContentLine(rawLine: string): string {
  return rawLine
    .trim()
    .replace(/^[-*+•●▪·]\s+/, '')
    .replace(/^#+\s*/, '')
    .replace(/^\*\*(.+)\*\*$/, '$1')
    .trim();
}

function normalizeSectionTitle(rawTitle: string): string | null {
  const title = rawTitle
    .trim()
    .replace(/[*_`#]/g, '')
    .replace(/[：:]+$/, '')
    .trim();

  if (!title) return null;

  for (const { pattern, title: normalized } of SECTION_PATTERNS) {
    if (pattern.test(title)) return normalized;
  }

  return title.length <= 14 ? title : null;
}

function isKnownSectionPattern(line: string): boolean {
  const cleaned = line.replace(/[*_`#：:]/g, '').trim();
  return SECTION_PATTERNS.some(({ pattern }) => pattern.test(cleaned));
}

function parseJobContent(content: string): ParsedJobContent {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const intro: string[] = [];
  const sections: ParsedSection[] = [];
  const trailing: string[] = [];
  let currentSection: ParsedSection | null = null;
  let hasSection = false;

  const pushCurrentSection = () => {
    if (currentSection && currentSection.items.length > 0) {
      sections.push(currentSection);
    }
    currentSection = null;
  };

  for (const rawLine of lines) {
    const line = cleanContentLine(rawLine);
    if (!line) continue;

    const headingWithBody = line.match(/^(.{1,22}?)[：:]\s*(.+)$/);
    if (headingWithBody) {
      const normalizedTitle = normalizeSectionTitle(headingWithBody[1]);
      if (normalizedTitle) {
        pushCurrentSection();
        currentSection = { title: normalizedTitle, items: [cleanContentLine(headingWithBody[2])] };
        hasSection = true;
        continue;
      }
    }

    const headingOnly = normalizeSectionTitle(line);
    if (headingOnly && (/[：:]$/.test(rawLine.trim()) || isKnownSectionPattern(line))) {
      pushCurrentSection();
      currentSection = { title: headingOnly, items: [] };
      hasSection = true;
      continue;
    }

    if (currentSection) {
      currentSection.items.push(line);
      continue;
    }

    if (!hasSection) {
      intro.push(line);
    } else {
      trailing.push(line);
    }
  }

  pushCurrentSection();

  if (sections.length === 0 && intro.length > 1) {
    sections.push({ title: '内容', items: intro });
    return { intro: [], sections, trailing };
  }

  return { intro, sections, trailing };
}

function RichTextPanel({
  title,
  content,
  emptyText,
  accent,
  onSave,
  saving,
  onGenerate,
  generating,
  generateLabel,
}: {
  title: string;
  content?: string;
  emptyText: string;
  accent: 'blue' | 'cyan';
  onSave?: (newContent: string) => Promise<void>;
  saving?: boolean;
  onGenerate?: () => void;
  generating?: boolean;
  generateLabel?: string;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const parsed = useMemo(() => parseJobContent(content || ''), [content]);
  const colorClass =
    accent === 'blue'
      ? {
          border: 'border-blue-100',
          bg: 'bg-blue-50',
          text: 'text-blue-700',
          dot: 'bg-blue-500',
          strip: 'from-blue-600 to-cyan-600',
        }
      : {
          border: 'border-cyan-100',
          bg: 'bg-cyan-50',
          text: 'text-cyan-700',
          dot: 'bg-cyan-500',
          strip: 'from-cyan-500 to-emerald-500',
        };

  const handleStartEdit = () => {
    setEditValue(content || '');
    setEditing(true);
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const handleCancel = () => {
    setEditing(false);
    setEditValue('');
  };

  const handleSave = async () => {
    if (!onSave) return;
    await onSave(editValue);
    setEditing(false);
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm flex-1 flex flex-col">
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${colorClass.strip}`} />
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
        <h2 className="text-sm font-semibold tracking-wide text-slate-900">{title}</h2>
        {!editing && (
          <div className="flex items-center gap-1">
            {onGenerate && (
              <button
                onClick={onGenerate}
                disabled={generating}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {generating ? (
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
                ) : (
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456z" />
                  </svg>
                )}
                {generateLabel || t('dashboard.detail.aiGenerate', 'AI Generate')}
              </button>
            )}
            {onSave && (
              <button
                onClick={handleStartEdit}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
                {t('dashboard.detail.edit', 'Edit')}
              </button>
            )}
          </div>
        )}
      </div>

      {editing ? (
        <div className="px-5 py-4">
          <textarea
            ref={textareaRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="w-full min-h-[400px] rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-700 leading-relaxed outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100 resize-y font-mono"
          />
          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              onClick={handleCancel}
              disabled={saving}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {saving && <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
              {saving ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 space-y-4 overflow-auto px-5 py-4 text-sm text-slate-700">
          {!content?.trim() ? (
            <div className="text-center py-8">
              <p className="text-sm text-slate-500">{emptyText}</p>
              {onSave && (
                <button
                  onClick={handleStartEdit}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  {t('dashboard.detail.addContent', 'Add content')}
                </button>
              )}
            </div>
          ) : (
            <>
              {parsed.intro.length > 0 && (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  {parsed.intro.map((paragraph, index) => (
                    <div key={`intro-${index}`} className="leading-6 text-slate-700 prose prose-sm prose-slate max-w-none [&>p]:my-0 [&>ul]:my-1 [&>ol]:my-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{paragraph}</ReactMarkdown>
                    </div>
                  ))}
                </div>
              )}

              {parsed.sections.map((section, sectionIndex) => (
                <section key={`${section.title}-${sectionIndex}`} className="space-y-2">
                  <div className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${colorClass.border} ${colorClass.bg} ${colorClass.text}`}>
                    {section.title}
                  </div>
                  <ul className="space-y-2">
                    {section.items.map((item, itemIndex) => (
                      <li key={`${section.title}-${itemIndex}`} className="flex items-start gap-2.5 leading-6 text-slate-700">
                        <span className={`mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full ${colorClass.dot}`} />
                        <span className="prose prose-sm prose-slate max-w-none [&>p]:my-0 [&>p]:inline"><ReactMarkdown remarkPlugins={[remarkGfm]}>{item}</ReactMarkdown></span>
                      </li>
                    ))}
                  </ul>
                </section>
              ))}

              {parsed.trailing.length > 0 && (
                <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  {parsed.trailing.map((paragraph, index) => (
                    <div key={`trailing-${index}`} className="leading-6 text-slate-700 prose prose-sm prose-slate max-w-none [&>p]:my-0 [&>ul]:my-1 [&>ol]:my-1">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{paragraph}</ReactMarkdown>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { id: requestId } = useParams();
  const listPath = '/product/hiring';
  const detailPath = (id: string) => `/product/hiring/${id}`;

  const [hiringRequests, setHiringRequests] = useState<HiringRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<HiringRequestDetail | null>(null);
  const [splitPercent, setSplitPercent] = useState(50);
  const splitContainerRef = useRef<HTMLDivElement>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; title: string; action: 'delete' | 'archive' } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [panelSaving, setPanelSaving] = useState(false);
  const [editingHeader, setEditingHeader] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editClientName, setEditClientName] = useState('');
  const [headerSaving, setHeaderSaving] = useState(false);
  const [showActionsMenu, setShowActionsMenu] = useState(false);
  const actionsMenuRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchHiringRequests();
  }, []);

  useEffect(() => {
    if (!requestId) {
      setSelectedRequest(null);
      setDetailError(null);
      setDetailLoading(false);
      return;
    }
    fetchRequestDetail(requestId);
  }, [requestId]);

  const fetchHiringRequests = async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/api/v1/hiring-requests`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'include',
      });
      const data = await response.json();
      
      if (data.success) {
        setHiringRequests(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to load hiring requests');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchRequestDetail = async (id: string) => {
    try {
      setDetailLoading(true);
      setDetailError(null);
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/api/v1/hiring-requests/${id}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        setSelectedRequest(data.data);
      } else {
        setDetailError(data.error || t('dashboard.detail.notFound', 'Request not found'));
      }
    } catch (err) {
      setDetailError(t('dashboard.detail.loadError', 'Failed to load request details'));
    } finally {
      setDetailLoading(false);
    }
  };

  // Close action menu when clicking outside
  useEffect(() => {
    if (!openMenuId) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openMenuId]);

  useEffect(() => {
    if (!showActionsMenu) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (actionsMenuRef.current && !actionsMenuRef.current.contains(e.target as Node)) {
        setShowActionsMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showActionsMenu]);

  const handleArchive = async (id: string) => {
    setActionLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/api/v1/hiring-requests/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ status: 'closed' }),
      });
      const data = await response.json();
      if (data.success) {
        if (requestId === id) {
          navigate(listPath);
        }
        await fetchHiringRequests();
      }
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const handleDelete = async (id: string) => {
    setActionLoading(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/api/v1/hiring-requests/${id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'include',
      });
      const data = await response.json();
      if (data.success) {
        if (requestId === id) {
          navigate(listPath);
        }
        await fetchHiringRequests();
      }
    } finally {
      setActionLoading(false);
      setConfirmAction(null);
    }
  };

  const handleUpdateField = useCallback(async (field: 'requirements' | 'jobDescription', value: string) => {
    if (!selectedRequest) return;
    setPanelSaving(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/api/v1/hiring-requests/${selectedRequest.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ [field]: value }),
      });
      const data = await response.json();
      if (data.success) {
        setSelectedRequest((prev) => prev ? { ...prev, [field]: value } : prev);
      }
    } finally {
      setPanelSaving(false);
    }
  }, [selectedRequest]);

  const handleStartEditHeader = useCallback(() => {
    if (!selectedRequest) return;
    setEditTitle(selectedRequest.title);
    setEditClientName(selectedRequest.clientName || '');
    setEditingHeader(true);
  }, [selectedRequest]);

  const handleSaveHeader = useCallback(async () => {
    if (!selectedRequest || !editTitle.trim()) return;
    setHeaderSaving(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/api/v1/hiring-requests/${selectedRequest.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ title: editTitle.trim(), clientName: editClientName.trim() || null }),
      });
      const data = await response.json();
      if (data.success) {
        setSelectedRequest((prev) => prev ? { ...prev, title: editTitle.trim(), clientName: editClientName.trim() || null } : prev);
        setEditingHeader(false);
      }
    } finally {
      setHeaderSaving(false);
    }
  }, [selectedRequest, editTitle, editClientName]);

  const handleStatusChange = useCallback(async (newStatus: string) => {
    if (!selectedRequest) return;
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/api/v1/hiring-requests/${selectedRequest.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await response.json();
      if (data.success) {
        setSelectedRequest((prev) => prev ? { ...prev, status: newStatus as 'active' | 'paused' | 'closed' } : prev);
        await fetchHiringRequests();
      }
    } catch {
      // silent
    }
  }, [selectedRequest]);

  const [generatingJD, setGeneratingJD] = useState(false);

  const handleGenerateJD = useCallback(async () => {
    if (!selectedRequest) return;
    setGeneratingJD(true);
    try {
      const token = localStorage.getItem('auth_token');
      const response = await fetch(`${API_BASE}/api/v1/hiring-requests/jd-draft`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({
          title: selectedRequest.title,
          requirements: selectedRequest.requirements,
        }),
      });
      const data = await response.json();
      if (data.success && data.data?.jobDescription) {
        const jd = data.data.jobDescription;
        // Save the generated JD
        await handleUpdateField('jobDescription', jd);
      }
    } finally {
      setGeneratingJD(false);
    }
  }, [selectedRequest, handleUpdateField]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
      case 'paused':
        return 'bg-amber-50 text-amber-700 border border-amber-100';
      case 'closed':
        return 'bg-slate-100 text-slate-600 border border-slate-200';
      default:
        return 'bg-slate-100 text-slate-600 border border-slate-200';
    }
  };

  const getCandidateStatusColor = (status?: string) => {
    switch (status) {
      case 'screening':
        return 'bg-amber-50 text-amber-700 border border-amber-100';
      case 'interviewed':
        return 'bg-emerald-50 text-emerald-700 border border-emerald-100';
      case 'shortlisted':
        return 'bg-blue-50 text-blue-700 border border-blue-100';
      case 'rejected':
        return 'bg-rose-50 text-rose-700 border border-rose-100';
      default:
        return 'bg-slate-50 text-slate-600 border border-slate-200';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const formatDateTime = (dateString: string) => {
    return new Date(dateString).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const activeRequests = useMemo(
    () => hiringRequests.filter((request) => request.status === 'active').length,
    [hiringRequests]
  );

  const candidateStats = useMemo(() => {
    if (selectedRequest?.stats) {
      return {
        matches: selectedRequest.stats.matches,
        invited: selectedRequest.stats.invited,
        interviewed: selectedRequest.stats.interviewsCompleted,
      };
    }
    // Fallback to candidates array for backward compatibility
    const candidates = selectedRequest?.candidates || [];
    return {
      matches: candidates.length,
      invited: candidates.filter((candidate) => candidate.status === 'screening').length,
      interviewed: candidates.filter((candidate) => candidate.status === 'interviewed').length,
    };
  }, [selectedRequest]);

  return (
    <div className="max-w-7xl mx-auto">
        <SEO title="Dashboard" noIndex />
        {requestId ? (
          <div>
            <Link to={listPath} className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900 mb-6">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              {t('dashboard.detail.back', 'Back to requests')}
            </Link>

            {detailLoading ? (
              <div className="p-12 text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="text-slate-500 mt-4">{t('dashboard.loading', 'Loading...')}</p>
              </div>
            ) : detailError ? (
              <div className="p-12 text-center text-rose-500">{detailError}</div>
            ) : selectedRequest ? (
              <div className="space-y-6">
                <div className="landing-gradient-stroke bg-white rounded-[28px] shadow-[0_18px_34px_-28px_rgba(15,23,42,0.75)] p-6">
                  {editingHeader ? (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">{t('dashboard.detail.projectName', 'Project Name')}</label>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-base font-semibold text-slate-900 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                          autoFocus
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1.5">{t('dashboard.detail.clientName', 'Client Name (optional)')}</label>
                        <input
                          type="text"
                          value={editClientName}
                          onChange={(e) => setEditClientName(e.target.value)}
                          placeholder={t('dashboard.detail.clientNamePlaceholder', 'e.g. Acme Corp, Internal')}
                          className="w-full rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-slate-900 outline-none focus:border-blue-300 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          onClick={() => setEditingHeader(false)}
                          disabled={headerSaving}
                          className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors disabled:opacity-50"
                        >
                          {t('common.cancel', 'Cancel')}
                        </button>
                        <button
                          onClick={handleSaveHeader}
                          disabled={headerSaving || !editTitle.trim()}
                          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 transition-colors disabled:opacity-50"
                        >
                          {headerSaving && <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />}
                          {headerSaving ? t('common.saving', 'Saving...') : t('common.save', 'Save')}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <h1 className="text-xl font-semibold text-slate-900 truncate">
                            {selectedRequest.title}
                          </h1>
                          <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(selectedRequest.status)}`}>
                            {selectedRequest.status.charAt(0).toUpperCase() + selectedRequest.status.slice(1)}
                          </span>
                          <button
                            onClick={handleStartEditHeader}
                            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                            </svg>
                          </button>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap text-sm text-slate-500">
                          {selectedRequest.clientName && (
                            <span className="inline-flex items-center gap-1.5">
                              <svg className="h-3.5 w-3.5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 21h19.5m-18-18v18m10.5-18v18m6-13.5V21M6.75 6.75h.75m-.75 3h.75m-.75 3h.75m3-6h.75m-.75 3h.75m-.75 3h.75M6.75 21v-3.375c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21M3 3h12m-.75 4.5H21m-3.75 3H21m-3.75 3H21" />
                              </svg>
                              {selectedRequest.clientName}
                            </span>
                          )}
                          <span>{t('dashboard.detail.updated', 'Updated')} {formatDateTime(selectedRequest.updatedAt)}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-wrap shrink-0">
                        <div className="flex items-center gap-3 text-xs text-slate-500 mr-2">
                          <span>{t('dashboard.detail.created', 'Created')} {formatDate(selectedRequest.createdAt)}</span>
                          <span>{t('dashboard.detail.candidatesCount', '{{count}} candidates', { count: selectedRequest.stats?.matches ?? selectedRequest.candidates.length })}</span>
                        </div>
                        {/* Actions dropdown */}
                        <div className="relative" ref={actionsMenuRef}>
                          <button
                            onClick={() => setShowActionsMenu(!showActionsMenu)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
                            </svg>
                          </button>
                          {showActionsMenu && (
                            <div className="absolute right-0 top-full mt-1 w-48 bg-white rounded-xl border border-slate-200 shadow-lg py-1 z-50">
                              {selectedRequest.status === 'active' && (
                                <button
                                  onClick={() => { handleStatusChange('paused'); setShowActionsMenu(false); }}
                                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                  <svg className="w-4 h-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  {t('dashboard.detail.pause', 'Pause')}
                                </button>
                              )}
                              {selectedRequest.status === 'paused' && (
                                <button
                                  onClick={() => { handleStatusChange('active'); setShowActionsMenu(false); }}
                                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                  <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  {t('dashboard.detail.activate', 'Activate')}
                                </button>
                              )}
                              {selectedRequest.status !== 'closed' && (
                                <button
                                  onClick={() => { handleStatusChange('closed'); setShowActionsMenu(false); }}
                                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                                  </svg>
                                  {t('dashboard.detail.close', 'Close Project')}
                                </button>
                              )}
                              {selectedRequest.status === 'closed' && (
                                <button
                                  onClick={() => { handleStatusChange('active'); setShowActionsMenu(false); }}
                                  className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                                >
                                  <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M2.985 19.644l3.181-3.183" />
                                  </svg>
                                  {t('dashboard.detail.reopen', 'Reopen')}
                                </button>
                              )}
                              <div className="border-t border-slate-100 my-1" />
                              <button
                                onClick={() => { setConfirmAction({ id: selectedRequest.id, title: selectedRequest.title, action: 'delete' }); setShowActionsMenu(false); }}
                                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-sm text-rose-600 hover:bg-rose-50 transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                                {t('dashboard.requests.delete', 'Delete')}
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white/80 rounded-2xl border border-slate-200/80 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.75)] backdrop-blur p-4">
                    <p className="text-xs text-slate-500">{t('dashboard.detail.matches', 'Matches')}</p>
                    <p className="text-2xl font-semibold text-slate-900">{candidateStats.matches}</p>
                  </div>
                  <div className="bg-white/80 rounded-2xl border border-slate-200/80 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.75)] backdrop-blur p-4">
                    <p className="text-xs text-slate-500">{t('dashboard.detail.invited', 'Invitations sent')}</p>
                    <p className="text-2xl font-semibold text-slate-900">{candidateStats.invited}</p>
                  </div>
                  <div className="bg-white/80 rounded-2xl border border-slate-200/80 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.75)] backdrop-blur p-4">
                    <p className="text-xs text-slate-500">{t('dashboard.detail.interviewsCompleted', 'Interviews completed')}</p>
                    <p className="text-2xl font-semibold text-slate-900">{candidateStats.interviewed}</p>
                  </div>
                </div>

                <div className="flex flex-col lg:flex-row lg:items-stretch" ref={splitContainerRef}>
                  <div style={{ width: `${splitPercent}%` }} className="max-lg:!w-full flex-shrink-0 lg:pr-0 flex flex-col">
                    <RichTextPanel
                      title={t('dashboard.detail.hiringRequirements', 'Hiring Requirements')}
                      content={selectedRequest.requirements}
                      emptyText={t('dashboard.detail.noRequirements', 'No hiring requirements yet.')}
                      accent="blue"
                      onSave={(v) => handleUpdateField('requirements', v)}
                      saving={panelSaving}
                    />
                  </div>
                  {/* Draggable divider */}
                  <div
                    className="hidden lg:flex items-center justify-center w-3 cursor-col-resize group flex-shrink-0 select-none"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      const container = splitContainerRef.current;
                      if (!container) return;
                      const startX = e.clientX;
                      const startPercent = splitPercent;
                      const containerWidth = container.getBoundingClientRect().width;
                      const onMouseMove = (ev: MouseEvent) => {
                        const delta = ev.clientX - startX;
                        const newPercent = startPercent + (delta / containerWidth) * 100;
                        setSplitPercent(Math.min(70, Math.max(30, newPercent)));
                      };
                      const onMouseUp = () => {
                        document.removeEventListener('mousemove', onMouseMove);
                        document.removeEventListener('mouseup', onMouseUp);
                        document.body.style.cursor = '';
                        document.body.style.userSelect = '';
                      };
                      document.body.style.cursor = 'col-resize';
                      document.body.style.userSelect = 'none';
                      document.addEventListener('mousemove', onMouseMove);
                      document.addEventListener('mouseup', onMouseUp);
                    }}
                  >
                    <div className="w-1 h-8 rounded-full bg-slate-300 group-hover:bg-blue-400 transition-colors" />
                  </div>
                  <div className="mt-4 min-w-0 flex-1 lg:mt-0 flex flex-col">
                    <RichTextPanel
                      title={t('dashboard.detail.jobDescription', 'Job Description')}
                      content={selectedRequest.jobDescription}
                      emptyText={t('dashboard.detail.noJobDescription', 'No job description yet. Use AI to generate one from your hiring requirements.')}
                      accent="cyan"
                      onSave={(v) => handleUpdateField('jobDescription', v)}
                      saving={panelSaving}
                      onGenerate={handleGenerateJD}
                      generating={generatingJD}
                      generateLabel={t('dashboard.detail.generateJD', 'AI Generate JD')}
                    />
                  </div>
                </div>

                {/* Recruitment Intelligence Report */}
                <IntelligenceReportPanel hiringRequestId={selectedRequest.id} />

                {/* Auto-Match Resume Panel */}
                <AutoMatchPanel
                  hiringRequest={selectedRequest}
                  onCandidatesUpdated={() => fetchRequestDetail(selectedRequest.id)}
                />

                <div className="landing-gradient-stroke bg-white rounded-[28px] overflow-hidden shadow-[0_18px_34px_-28px_rgba(15,23,42,0.75)]">
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h2 className="text-sm font-semibold text-slate-900">
                      {t('dashboard.detail.candidates', 'Candidates')}
                    </h2>
                    <span className="text-xs text-slate-500">
                      {selectedRequest.candidates.length} {t('dashboard.requests.candidates', 'candidates')}
                    </span>
                  </div>
                  {selectedRequest.candidates.length === 0 ? (
                    <div className="p-6 text-sm text-slate-500">
                      {t('dashboard.detail.noCandidates', 'No candidates yet.')}
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100">
                      <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 text-xs uppercase tracking-wide text-slate-400">
                        <span className="col-span-4">{t('dashboard.detail.candidate', 'Candidate')}</span>
                        <span className="col-span-2">{t('dashboard.detail.matchScore', 'Match score')}</span>
                        <span className="col-span-3">{t('dashboard.detail.status', 'Status')}</span>
                        <span className="col-span-3">{t('dashboard.detail.lastUpdated', 'Last updated')}</span>
                      </div>
                      {selectedRequest.candidates.map((candidate) => (
                        <div key={candidate.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-4">
                          <div className="md:col-span-4">
                            <p className="text-sm font-medium text-slate-900">
                              {candidate.name || candidate.email || t('dashboard.detail.candidate', 'Candidate')}
                            </p>
                            {candidate.email && (
                              <p className="text-xs text-slate-500">{candidate.email}</p>
                            )}
                          </div>
                          <div className="md:col-span-2 text-sm text-slate-600">
                            {candidate.matchScore !== null && candidate.matchScore !== undefined
                              ? candidate.matchScore
                              : '--'}
                          </div>
                          <div className="md:col-span-3">
                            <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${getCandidateStatusColor(candidate.status)}`}>
                              {candidate.status ? t(`dashboard.candidateStatus.${candidate.status}`, candidate.status) : t('dashboard.candidateStatus.pending', 'Pending')}
                            </span>
                          </div>
                          <div className="md:col-span-3 text-xs text-slate-500">
                            {formatDateTime(candidate.updatedAt)}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Invited Candidates */}
                <InvitedCandidatesPanel hiringRequestId={selectedRequest.id} t={t} />
              </div>
            ) : (
              <div className="p-12 text-center text-slate-500">
                {t('dashboard.detail.notFound', 'Request not found')}
              </div>
            )}
          </div>
        ) : (
          <div>
            {/* Welcome Section */}
            <div className="mb-8">
              <h1 className="text-xl font-semibold text-slate-900 mb-2 landing-display">
                {t('dashboard.welcome', 'Welcome back')}, {user?.name?.split(' ')[0] || t('dashboard.user', 'there')}!
              </h1>
              <p className="text-sm text-slate-600">
                {t('dashboard.subtitle', 'Manage your hiring requests and track candidates.')}
              </p>
            </div>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
              <Link
                to="/agent-alex"
                state={{ fresh: true }}
                className="bg-gradient-to-br from-blue-600 to-cyan-600 rounded-[28px] p-5 text-white shadow-[0_14px_28px_-16px_rgba(37,99,235,0.9)] hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-white/20 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold">{t('dashboard.actions.newHiring', 'Start New Hiring')}</h3>
                    <p className="text-xs text-blue-100">{t('dashboard.actions.newHiringDesc', 'Create a new job opening')}</p>
                  </div>
                </div>
              </Link>

              <Link
                to="/product/profile/api-keys"
                className="landing-gradient-stroke bg-white rounded-[28px] p-5 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.75)] hover:-translate-y-1 hover:shadow-[0_28px_52px_-36px_rgba(15,23,42,0.6)] transition-all duration-300"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-amber-50 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{t('dashboard.actions.apiKeys', 'API Keys')}</h3>
                    <p className="text-xs text-slate-500">{t('dashboard.actions.apiKeysDesc', 'Manage API access')}</p>
                  </div>
                </div>
              </Link>

              <Link
                to="/product/profile/usage"
                className="landing-gradient-stroke bg-white rounded-[28px] p-5 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.75)] hover:-translate-y-1 hover:shadow-[0_28px_52px_-36px_rgba(15,23,42,0.6)] transition-all duration-300"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-emerald-50 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{t('dashboard.actions.usage', 'API Usage')}</h3>
                    <p className="text-xs text-slate-500">
                      {user?.role === 'admin'
                        ? t('dashboard.actions.usageDesc', 'View usage & costs')
                        : t('dashboard.actions.usageDescNoCost', 'View usage')}
                    </p>
                  </div>
                </div>
              </Link>

              <Link
                to="/product"
                className="landing-gradient-stroke bg-white rounded-[28px] p-5 shadow-[0_18px_34px_-28px_rgba(15,23,42,0.75)] hover:-translate-y-1 hover:shadow-[0_28px_52px_-36px_rgba(15,23,42,0.6)] transition-all duration-300"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 bg-blue-50 rounded-xl flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900">{t('dashboard.actions.stats', 'Statistics')}</h3>
                    <p className="text-xs text-slate-500">
                      {activeRequests} {t('dashboard.actions.activeRequests', 'active requests')}
                    </p>
                  </div>
                </div>
              </Link>
            </div>

            {/* Hiring Requests */}
            <div className="landing-gradient-stroke bg-white rounded-[28px] shadow-[0_28px_56px_-42px_rgba(15,23,42,0.7)] overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <h2 className="text-base font-semibold text-slate-900">
                  {t('dashboard.requests.title', 'Your Hiring Requests')}
                </h2>
                <Link
                  to="/agent-alex"
                  state={{ fresh: true }}
                  className="text-blue-600 hover:text-blue-700 font-medium text-xs flex items-center gap-1"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  {t('dashboard.requests.new', 'New Request')}
                </Link>
              </div>

              {isLoading ? (
                <div className="p-12 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="text-slate-500 mt-4">{t('dashboard.loading', 'Loading...')}</p>
                </div>
              ) : error ? (
                <div className="p-12 text-center">
                  <p className="text-rose-500">{error}</p>
                </div>
              ) : hiringRequests.length === 0 ? (
                <div className="p-12 text-center">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                    </svg>
                  </div>
                  <h3 className="text-base font-medium text-slate-900 mb-2">
                    {t('dashboard.requests.empty', 'No hiring requests yet')}
                  </h3>
                  <p className="text-sm text-slate-500 mb-4">
                    {t('dashboard.requests.emptyDesc', 'Create your first hiring request to start finding candidates.')}
                  </p>
                  <Link
                    to="/agent-alex"
                    state={{ fresh: true }}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-blue-600 to-cyan-600 shadow-[0_14px_28px_-16px_rgba(37,99,235,0.9)] text-white font-medium transition-colors text-sm"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    {t('dashboard.requests.create', 'Create Hiring Request')}
                  </Link>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {hiringRequests.map((request) => (
                    <div
                      key={request.id}
                      className="p-5 hover:bg-slate-50/80 transition-colors cursor-pointer"
                      onClick={() => navigate(detailPath(request.id))}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="text-base font-semibold text-slate-900 truncate">
                              {request.title}
                            </h3>
                            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(request.status)}`}>
                              {request.status.charAt(0).toUpperCase() + request.status.slice(1)}
                            </span>
                          </div>
                          <p className="text-sm text-slate-500 line-clamp-2 mb-3">
                            {request.requirements}
                          </p>
                          <div className="flex items-center gap-4 text-xs text-slate-500">
                            <span className="flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                              </svg>
                              {request._count?.resumeJobFits || request._count?.candidates || 0} {t('dashboard.requests.candidates', 'candidates')}
                            </span>
                            <span className="flex items-center gap-1">
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {t('dashboard.requests.created', 'Created')} {formatDate(request.createdAt)}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-xs text-blue-600 font-medium flex items-center gap-1">
                            {t('dashboard.requests.viewDetail', 'View details')}
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                          </div>
                          <div className="relative" ref={openMenuId === request.id ? menuRef : undefined}>
                            <button
                              onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === request.id ? null : request.id); }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                            >
                              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                              </svg>
                            </button>
                            {openMenuId === request.id && (
                              <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl border border-slate-200 shadow-lg z-20 py-1">
                                {request.status !== 'closed' && (
                                  <button
                                    onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); setConfirmAction({ id: request.id, title: request.title, action: 'archive' }); }}
                                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                                  >
                                    <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                                    </svg>
                                    {t('dashboard.requests.archive', 'Archive')}
                                  </button>
                                )}
                                <button
                                  onClick={(e) => { e.stopPropagation(); setOpenMenuId(null); setConfirmAction({ id: request.id, title: request.title, action: 'delete' }); }}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-sm text-rose-600 hover:bg-rose-50 transition-colors"
                                >
                                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                  {t('dashboard.requests.delete', 'Delete')}
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Confirmation Modal */}
        {confirmAction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => !actionLoading && setConfirmAction(null)} />
            <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
              <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${confirmAction.action === 'delete' ? 'bg-rose-100' : 'bg-amber-100'}`}>
                {confirmAction.action === 'delete' ? (
                  <svg className="w-6 h-6 text-rose-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                )}
              </div>
              <h3 className="text-lg font-semibold text-slate-900 mb-2">
                {confirmAction.action === 'delete'
                  ? t('dashboard.confirm.deleteTitle', 'Delete hiring request?')
                  : t('dashboard.confirm.archiveTitle', 'Archive hiring request?')}
              </h3>
              <p className="text-sm text-slate-600 mb-1">
                <span className="font-medium text-slate-800">{confirmAction.title}</span>
              </p>
              <p className="text-sm text-slate-500 mb-6">
                {confirmAction.action === 'delete'
                  ? t('dashboard.confirm.deleteDesc', 'This will permanently delete this request and all associated candidates. This action cannot be undone.')
                  : t('dashboard.confirm.archiveDesc', 'This will close the request and move it to archived status. You can still view it in your list.')}
              </p>
              <div className="flex items-center justify-end gap-3">
                <button
                  onClick={() => setConfirmAction(null)}
                  disabled={actionLoading}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors disabled:opacity-50"
                >
                  {t('dashboard.confirm.cancel', 'Cancel')}
                </button>
                <button
                  onClick={() => confirmAction.action === 'delete' ? handleDelete(confirmAction.id) : handleArchive(confirmAction.id)}
                  disabled={actionLoading}
                  className={`px-4 py-2 text-sm font-medium text-white rounded-full transition-colors disabled:opacity-50 ${
                    confirmAction.action === 'delete'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {actionLoading
                    ? t('dashboard.confirm.processing', 'Processing...')
                    : confirmAction.action === 'delete'
                      ? t('dashboard.confirm.delete', 'Delete')
                      : t('dashboard.confirm.archive', 'Archive')}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

// ─── Invited Candidates Panel ─────────────────────────────────────────

interface InvitedCandidate {
  id: string;
  resumeId: string;
  candidateName: string;
  candidateEmail: string | null;
  candidateRole: string | null;
  invitedAt: string | null;
  fitScore: number | null;
  interview: { id: string; status: string; scheduledAt: string | null; completedAt: string | null } | null;
}

function InvitedCandidatesPanel({ hiringRequestId, t }: { hiringRequestId: string; t: (k: string, f: string, opts?: Record<string, unknown>) => string }) {
  const [invitedCandidates, setInvitedCandidates] = useState<InvitedCandidate[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInvitations = useCallback(async () => {
    try {
      const token = localStorage.getItem('auth_token');
      const res = await fetch(`${API_BASE}/api/v1/hiring-requests/${hiringRequestId}/invitations`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        credentials: 'include',
      });
      const data = await res.json();
      if (data.success) setInvitedCandidates(data.data || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [hiringRequestId]);

  useEffect(() => {
    fetchInvitations();
  }, [fetchInvitations]);

  if (loading) return null;
  if (invitedCandidates.length === 0) return null;

  const statusColors: Record<string, string> = {
    scheduled: 'bg-blue-100 text-blue-700',
    in_progress: 'bg-blue-100 text-blue-700',
    completed: 'bg-emerald-100 text-emerald-700',
    cancelled: 'bg-red-100 text-red-700',
    expired: 'bg-gray-100 text-gray-500',
  };

  return (
    <div className="landing-gradient-stroke bg-white rounded-[28px] overflow-hidden shadow-[0_18px_34px_-28px_rgba(15,23,42,0.75)]">
      <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">
          {t('dashboard.detail.invitedCandidates', 'Invited Candidates')}
        </h2>
        <span className="text-xs text-slate-500">
          {invitedCandidates.length} {t('dashboard.detail.invited', 'invited')}
        </span>
      </div>
      <div className="divide-y divide-slate-100">
        <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 text-xs uppercase tracking-wide text-slate-400">
          <span className="col-span-4">{t('dashboard.detail.candidate', 'Candidate')}</span>
          <span className="col-span-2">{t('dashboard.detail.invitedDate', 'Invited')}</span>
          <span className="col-span-3">{t('dashboard.detail.interviewStatus', 'Interview Status')}</span>
          <span className="col-span-3">{t('dashboard.detail.matchScore', 'Match score')}</span>
        </div>
        {invitedCandidates.map((c) => (
          <div key={c.id} className="grid grid-cols-1 md:grid-cols-12 gap-4 px-6 py-4">
            <div className="md:col-span-4">
              <p className="text-sm font-medium text-slate-900">{c.candidateName}</p>
              {c.candidateEmail && <p className="text-xs text-slate-500">{c.candidateEmail}</p>}
              {c.candidateRole && <p className="text-xs text-slate-400">{c.candidateRole}</p>}
            </div>
            <div className="md:col-span-2 text-xs text-slate-500">
              {c.invitedAt ? formatDateTimeLabel(c.invitedAt) : '--'}
            </div>
            <div className="md:col-span-3">
              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${
                statusColors[c.interview?.status || 'scheduled'] || 'bg-gray-100 text-gray-600'
              }`}>
                {t(`dashboard.interviewStatus.${(c.interview?.status === 'in_progress' ? 'scheduled' : c.interview?.status) || 'scheduled'}`, c.interview?.status || 'scheduled')}
              </span>
            </div>
            <div className="md:col-span-3 text-sm text-slate-600">
              {c.fitScore != null ? c.fitScore : '--'}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
