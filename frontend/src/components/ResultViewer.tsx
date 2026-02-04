import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ResultViewerProps {
  data: unknown;
  loading?: boolean;
  error?: string | null;
  title?: string;
}

export default function ResultViewer({ data, loading, error, title }: ResultViewerProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const jsonString = data ? JSON.stringify(data, null, 2) : '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement('textarea');
      textarea.value = jsonString;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title || 'result'}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="bg-gray-100 rounded-lg p-6 animate-pulse">
        <div className="h-4 bg-gray-300 rounded w-3/4 mb-2"></div>
        <div className="h-4 bg-gray-300 rounded w-1/2 mb-2"></div>
        <div className="h-4 bg-gray-300 rounded w-2/3"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6">
        <h3 className="text-red-600 font-semibold mb-2">{t('messages.error')}</h3>
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-gray-100 rounded-lg p-6 text-center text-gray-500">
        {t('messages.noResults')}
      </div>
    );
  }

  return (
    <div className="bg-gray-900 rounded-lg overflow-hidden">
      {/* Header with actions */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
          <span className="text-gray-400 text-sm ml-2">{title || t('components.resultViewer.title')}</span>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {/* Download button */}
          <button
            onClick={handleDownload}
            className="px-3 py-1.5 rounded text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors flex items-center gap-1.5"
            title={t('tooltips.downloadJson')}
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {t('actions.download')}
          </button>
          
          {/* Copy button */}
          <button
            onClick={handleCopy}
            className={`px-3 py-1.5 rounded text-xs font-medium transition-colors flex items-center gap-1.5
              ${copied 
                ? 'bg-green-600 text-white' 
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}
            title={t('tooltips.copyJson')}
          >
            {copied ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {t('actions.copied')}
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                {t('actions.copy')}
              </>
            )}
          </button>
        </div>
      </div>
      
      {/* Content */}
      <div className="p-4 sm:p-6 overflow-auto max-h-[600px]">
        <pre className="text-green-400 text-sm font-mono whitespace-pre-wrap">
          {jsonString}
        </pre>
      </div>
      
      {/* Footer with stats */}
      <div className="px-4 py-2 bg-gray-800 border-t border-gray-700 flex justify-between text-xs text-gray-500">
        <span>{jsonString.length.toLocaleString()} {t('units.characters')}</span>
        <span>{jsonString.split('\n').length.toLocaleString()} {t('units.lines')}</span>
      </div>
    </div>
  );
}
