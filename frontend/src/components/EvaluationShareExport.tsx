import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import axios from '../lib/axios';
import {
  generateEvaluationMarkdown,
  generateEvaluationWordHTML,
  downloadBlob,
} from '../utils/evaluationExport';

interface Props {
  interviewId: string;
  candidateName: string;
  jobTitle?: string | null;
  interviewDate?: string | null;
  evaluationData: any;
  evaluationScore?: number | null;
  evaluationVerdict?: string | null;
  shareToken?: string | null;
  onShareTokenChange?: (token: string | null) => void;
}

export default function EvaluationShareExport({
  interviewId,
  candidateName,
  jobTitle,
  interviewDate,
  evaluationData,
  evaluationScore,
  evaluationVerdict,
  shareToken: initialToken,
  onShareTokenChange,
}: Props) {
  const { t } = useTranslation();
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(initialToken ?? null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setShareToken(initialToken ?? null);
  }, [initialToken]);

  // Close export menu when clicking outside
  useEffect(() => {
    if (!exportMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [exportMenuOpen]);

  const shareUrl = shareToken
    ? `${window.location.origin}/evaluation-report/${shareToken}`
    : null;

  const meta = { candidateName, jobTitle, interviewDate, score: evaluationScore, verdict: evaluationVerdict };

  /* ---- Share actions ---- */
  const handleGenerateLink = async () => {
    setGenerating(true);
    try {
      const res = await axios.post(`/api/v1/gohire-interviews/${interviewId}/share`);
      if (res.data.success) {
        const token = res.data.data.token;
        setShareToken(token);
        onShareTokenChange?.(token);
      }
    } catch {
      // silent
    } finally {
      setGenerating(false);
    }
  };

  const handleRevokeLink = async () => {
    try {
      await axios.delete(`/api/v1/gohire-interviews/${interviewId}/share`);
      setShareToken(null);
      onShareTokenChange?.(null);
    } catch {
      // silent
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  /* ---- Export actions ---- */
  const handleExportPDF = () => {
    setExportMenuOpen(false);
    window.print();
  };

  const handleExportMarkdown = () => {
    setExportMenuOpen(false);
    const md = generateEvaluationMarkdown(evaluationData, meta);
    const safeName = candidateName.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
    downloadBlob(md, `evaluation_${safeName}.md`, 'text/markdown;charset=utf-8');
  };

  const handleExportWord = () => {
    setExportMenuOpen(false);
    const html = generateEvaluationWordHTML(evaluationData, meta);
    const safeName = candidateName.replace(/[^a-zA-Z0-9\u4e00-\u9fff]/g, '_');
    downloadBlob(html, `evaluation_${safeName}.doc`, 'application/msword');
  };

  return (
    <>
      {/* Button group */}
      <div className="flex items-center gap-2">
        {/* Share button */}
        <button
          onClick={() => setShareModalOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
          </svg>
          {t('share.share', 'Share')}
        </button>

        {/* Export dropdown */}
        <div className="relative" ref={exportRef}>
          <button
            onClick={() => setExportMenuOpen(!exportMenuOpen)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {t('export.export', 'Export')}
            <svg className="w-3 h-3 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {exportMenuOpen && (
            <div className="absolute right-0 z-50 mt-1 w-48 rounded-lg border border-slate-200 bg-white shadow-lg py-1">
              <button
                onClick={handleExportPDF}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <svg className="w-4 h-4 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                {t('export.pdf', 'PDF (Print)')}
              </button>
              <button
                onClick={handleExportWord}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {t('export.word', 'Word Document')}
              </button>
              <button
                onClick={handleExportMarkdown}
                className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              >
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                {t('export.markdown', 'Markdown')}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Share Modal */}
      {shareModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShareModalOpen(false)}>
          <div
            className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setShareModalOpen(false)}
              className="absolute top-3 right-3 rounded-lg p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>

            <h3 className="text-lg font-semibold text-slate-900 mb-1">
              {t('share.shareEvaluation', 'Share Evaluation Report')}
            </h3>
            <p className="text-sm text-slate-500 mb-5">
              {t('share.shareDesc', 'Generate a public link to share this evaluation report with anyone.')}
            </p>

            {!shareToken ? (
              <button
                onClick={handleGenerateLink}
                disabled={generating}
                className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {generating
                  ? t('share.generating', 'Generating...')
                  : t('share.generateLink', 'Generate Shareable Link')}
              </button>
            ) : (
              <div className="space-y-4">
                {/* Link + copy */}
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={shareUrl || ''}
                    className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700 font-mono truncate"
                  />
                  <button
                    onClick={handleCopy}
                    className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                  >
                    {copied ? t('share.copied', 'Copied!') : t('share.copy', 'Copy')}
                  </button>
                </div>

                {/* QR Code */}
                <div className="flex flex-col items-center gap-2 rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <QRCodeSVG value={shareUrl!} size={160} level="M" />
                  <span className="text-xs text-slate-400">
                    {t('share.scanQr', 'Scan to open on mobile')}
                  </span>
                </div>

                {/* Revoke */}
                <button
                  onClick={handleRevokeLink}
                  className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-100 transition-colors"
                >
                  {t('share.revokeAccess', 'Revoke Access')}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
