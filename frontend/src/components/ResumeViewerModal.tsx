import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import axios from '../lib/axios';
import { MarkdownRenderer } from './MarkdownRenderer';

interface ResumeViewerModalProps {
  /** The gohire interview ID to fetch the resume for */
  interviewId: string;
  /** The external resume URL (used to detect file type) */
  resumeUrl: string;
  /** Close handler */
  onClose: () => void;
  /** Optional keywords to highlight in parsed content */
  keywords?: string[];
}

type ViewMode = 'original' | 'parsed';

function detectFileType(url: string): 'pdf' | 'docx' | 'doc' | 'text' | 'unknown' {
  const cleaned = url.split('?')[0].toLowerCase();
  if (cleaned.endsWith('.pdf')) return 'pdf';
  if (cleaned.endsWith('.docx')) return 'docx';
  if (cleaned.endsWith('.doc')) return 'doc';
  if (cleaned.endsWith('.md') || cleaned.endsWith('.txt')) return 'text';
  // Default to PDF since most resume uploads are PDFs
  return 'pdf';
}

export default function ResumeViewerModal({ interviewId, resumeUrl, onClose, keywords = [] }: ResumeViewerModalProps) {
  const { t } = useTranslation();
  const fileType = detectFileType(resumeUrl);

  const [viewMode, setViewMode] = useState<ViewMode>(fileType === 'pdf' ? 'original' : 'parsed');
  const [parsedMarkdown, setParsedMarkdown] = useState<string | null>(null);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [textLoading, setTextLoading] = useState(false);

  const proxyUrl = `/api/v1/gohire-interviews/${interviewId}/resume-file`;

  // For text/md files, fetch content directly
  useEffect(() => {
    if (fileType === 'text' && !textContent) {
      setTextLoading(true);
      axios.get(proxyUrl, { responseType: 'text' })
        .then(res => setTextContent(typeof res.data === 'string' ? res.data : JSON.stringify(res.data)))
        .catch(() => setTextContent('Failed to load file content'))
        .finally(() => setTextLoading(false));
    }
  }, [fileType, proxyUrl, textContent]);

  // For DOCX/DOC files, auto-parse on mount
  useEffect(() => {
    if ((fileType === 'docx' || fileType === 'doc') && !parsedMarkdown) {
      handleParse();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleParse = useCallback(async () => {
    setParsing(true);
    setParseError(null);
    try {
      const res = await axios.post(`/api/v1/gohire-interviews/${interviewId}/parse-resume`, { force: !parsedMarkdown });
      if (res.data?.success && res.data.data?.markdown) {
        setParsedMarkdown(res.data.data.markdown);
        setViewMode('parsed');
      } else {
        setParseError(res.data?.error || 'Parse failed');
      }
    } catch (err: any) {
      setParseError(err.response?.data?.error || err.message || 'Parse failed');
    } finally {
      setParsing(false);
    }
  }, [interviewId, parsedMarkdown]);

  // Close on escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Modal */}
      <div className="relative w-full max-w-5xl h-[90vh] mx-4 flex flex-col rounded-xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50 flex-none">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-slate-800">
              {t('goHireEval.resumeViewer.title', '简历查看')}
            </h3>

            {/* View mode toggle (only for PDF which supports both modes) */}
            {fileType === 'pdf' && (
              <div className="flex rounded-lg border border-slate-200 bg-white overflow-hidden">
                <button
                  onClick={() => setViewMode('original')}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${
                    viewMode === 'original'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {t('goHireEval.resumeViewer.original', '原件')}
                </button>
                <button
                  onClick={() => {
                    setViewMode('parsed');
                    if (!parsedMarkdown && !parsing) handleParse();
                  }}
                  className={`px-3 py-1 text-xs font-medium transition-colors ${
                    viewMode === 'parsed'
                      ? 'bg-blue-600 text-white'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {t('goHireEval.resumeViewer.parsed', '解析视图')}
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Download button */}
            <a
              href={resumeUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-600 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {t('goHireEval.resumeViewer.download', '下载')}
            </a>

            {/* Close button */}
            <button
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {/* PDF original view */}
          {viewMode === 'original' && fileType === 'pdf' && (
            <iframe
              src={proxyUrl}
              className="w-full h-full border-0"
              title="Resume PDF"
            />
          )}

          {/* Parsed/markdown view */}
          {viewMode === 'parsed' && (
            <div className="h-full overflow-y-auto p-6">
              {parsing && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600 mb-4" />
                  <p className="text-sm text-slate-500">
                    {t('goHireEval.resumeViewer.parsing', '正在解析简历...')}
                  </p>
                </div>
              )}

              {parseError && !parsing && (
                <div className="flex flex-col items-center justify-center py-16">
                  <p className="text-sm text-red-500 mb-3">{parseError}</p>
                  <button
                    onClick={handleParse}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    {t('goHireEval.resumeViewer.retry', '重试')}
                  </button>
                </div>
              )}

              {parsedMarkdown && !parsing && (
                <MarkdownRenderer content={parsedMarkdown} keywords={keywords} />
              )}

              {!parsedMarkdown && !parsing && !parseError && (
                <div className="flex flex-col items-center justify-center py-16">
                  <p className="text-sm text-slate-500 mb-3">
                    {t('goHireEval.resumeViewer.notParsed', '简历尚未解析')}
                  </p>
                  <button
                    onClick={handleParse}
                    className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    {t('goHireEval.resumeViewer.parseNow', '立即解析')}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Text/MD view */}
          {fileType === 'text' && viewMode === 'original' && (
            <div className="h-full overflow-y-auto p-6">
              {textLoading ? (
                <div className="flex justify-center py-16">
                  <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600" />
                </div>
              ) : textContent ? (
                <MarkdownRenderer content={textContent} keywords={keywords} />
              ) : null}
            </div>
          )}

          {/* DOCX/DOC view — shows parsed content */}
          {(fileType === 'docx' || fileType === 'doc') && viewMode === 'original' && (
            <div className="h-full overflow-y-auto p-6">
              {parsing && (
                <div className="flex flex-col items-center justify-center py-16">
                  <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600 mb-4" />
                  <p className="text-sm text-slate-500">
                    {t('goHireEval.resumeViewer.parsing', '正在解析简历...')}
                  </p>
                </div>
              )}
              {parseError && !parsing && (
                <div className="text-center py-16">
                  <p className="text-sm text-red-500 mb-3">{parseError}</p>
                  <button onClick={handleParse} className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                    {t('goHireEval.resumeViewer.retry', '重试')}
                  </button>
                </div>
              )}
              {parsedMarkdown && !parsing && (
                <MarkdownRenderer content={parsedMarkdown} keywords={keywords} />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
