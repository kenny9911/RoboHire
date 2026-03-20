import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import EvaluationResultDisplay from '../components/EvaluationResultDisplay';
import {
  generateEvaluationMarkdown,
  generateEvaluationWordHTML,
  downloadBlob,
} from '../utils/evaluationExport';

interface SharedReport {
  id: string;
  candidateName: string;
  candidateEmail: string | null;
  jobTitle: string | null;
  interviewDatetime: string;
  duration: number | null;
  evaluationData: any;
  evaluationScore: number | null;
  evaluationVerdict: string | null;
}

const VERDICT_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  strong_hire: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Strong Hire' },
  hire: { bg: 'bg-emerald-50', text: 'text-emerald-600', label: 'Hire' },
  lean_hire: { bg: 'bg-blue-50', text: 'text-blue-600', label: 'Lean Hire' },
  lean_no_hire: { bg: 'bg-amber-50', text: 'text-amber-600', label: 'Lean No Hire' },
  no_hire: { bg: 'bg-red-50', text: 'text-red-600', label: 'No Hire' },
};

export default function EvaluationSharedReport() {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();
  const [report, setReport] = useState<SharedReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    // Use raw fetch instead of axios to avoid auth header injection
    const apiBase = import.meta.env.VITE_API_URL || '';
    fetch(`${apiBase}/api/v1/gohire-interviews/shared/${token}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          setReport(json.data);
        } else {
          setError(true);
        }
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [token]);

  const meta = report
    ? {
        candidateName: report.candidateName,
        jobTitle: report.jobTitle,
        interviewDate: report.interviewDatetime,
        score: report.evaluationScore,
        verdict: report.evaluationVerdict,
      }
    : { candidateName: '' };

  const handleExportMarkdown = () => {
    if (!report?.evaluationData) return;
    const md = generateEvaluationMarkdown(report.evaluationData, meta);
    const safeName = report.candidateName.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
    downloadBlob(md, `evaluation_${safeName}.md`, 'text/markdown;charset=utf-8');
  };

  const handleExportWord = () => {
    if (!report?.evaluationData) return;
    const html = generateEvaluationWordHTML(report.evaluationData, meta);
    const safeName = report.candidateName.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
    downloadBlob(html, `evaluation_${safeName}.doc`, 'application/msword');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <svg className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-slate-500">{t('evaluationReport.loading', 'Loading report...')}</p>
        </div>
      </div>
    );
  }

  if (error || !report) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center max-w-md mx-auto px-6">
          <svg className="w-16 h-16 text-slate-300 mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          <h2 className="text-xl font-semibold text-slate-700 mb-2">
            {t('evaluationReport.notFound', 'Report Not Found')}
          </h2>
          <p className="text-sm text-slate-500">
            {t('evaluationReport.notFoundDesc', 'This evaluation report link is invalid or has been revoked. Please contact the recruiter for a new link.')}
          </p>
        </div>
      </div>
    );
  }

  const vs = VERDICT_STYLES[report.evaluationVerdict || ''];

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 print:border-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
              <span className="text-white font-bold text-sm">R</span>
            </div>
            <div>
              <span className="text-lg font-bold text-slate-900">RoboHire</span>
              <span className="ml-2 text-xs text-slate-400">{t('evaluationReport.headerTag', 'Evaluation Report')}</span>
            </div>
          </div>
          {/* Export buttons (hidden in print) */}
          <div className="flex gap-2 print:hidden">
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
              PDF
            </button>
            <button
              onClick={handleExportWord}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Word
            </button>
            <button
              onClick={handleExportMarkdown}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Markdown
            </button>
          </div>
        </div>
      </header>

      {/* Report body */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        {/* Candidate summary card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">{report.candidateName}</h1>
              {report.jobTitle && (
                <p className="text-sm text-slate-500 mt-1">{report.jobTitle}</p>
              )}
              <p className="text-xs text-slate-400 mt-1">
                {new Date(report.interviewDatetime).toLocaleDateString(undefined, {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
                {report.duration != null && ` · ${report.duration} min`}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {report.evaluationScore != null && (
                <div className="text-center">
                  <div className={`text-3xl font-bold ${
                    report.evaluationScore >= 80 ? 'text-emerald-600' :
                    report.evaluationScore >= 60 ? 'text-blue-600' :
                    report.evaluationScore >= 40 ? 'text-amber-600' : 'text-red-600'
                  }`}>
                    {report.evaluationScore}
                  </div>
                  <div className="text-xs text-slate-400">{t('evaluationReport.outOf', 'out of 100')}</div>
                </div>
              )}
              {vs && (
                <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${vs.bg} ${vs.text}`}>
                  {vs.label}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Full evaluation display */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <EvaluationResultDisplay data={report.evaluationData} />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white print:border-0">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4 text-center text-xs text-slate-400">
          {t('evaluationReport.footer', 'Powered by RoboHire AI — Comprehensive Interview Evaluation')}
        </div>
      </footer>
    </div>
  );
}
