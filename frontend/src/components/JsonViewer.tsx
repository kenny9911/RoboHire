import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface JsonViewerProps {
  data: unknown;
  title?: string;
}

// Syntax highlighting colors
const colors = {
  key: 'text-purple-600',
  string: 'text-green-600',
  number: 'text-blue-600',
  boolean: 'text-orange-600',
  null: 'text-gray-500',
  bracket: 'text-gray-700',
};

// Recursive JSON syntax highlighter
function highlightJson(obj: unknown, indent: number = 0): JSX.Element[] {
  const spaces = '  '.repeat(indent);
  const elements: JSX.Element[] = [];
  
  if (obj === null) {
    elements.push(<span key="null" className={colors.null}>null</span>);
  } else if (typeof obj === 'boolean') {
    elements.push(<span key="bool" className={colors.boolean}>{obj.toString()}</span>);
  } else if (typeof obj === 'number') {
    elements.push(<span key="num" className={colors.number}>{obj}</span>);
  } else if (typeof obj === 'string') {
    // Escape and format string
    const escaped = obj.replace(/"/g, '\\"').replace(/\n/g, '\\n');
    elements.push(<span key="str" className={colors.string}>"{escaped}"</span>);
  } else if (Array.isArray(obj)) {
    if (obj.length === 0) {
      elements.push(<span key="empty-arr" className={colors.bracket}>[]</span>);
    } else {
      elements.push(<span key="arr-open" className={colors.bracket}>[</span>);
      elements.push(<br key="arr-br-open" />);
      obj.forEach((item, index) => {
        elements.push(<span key={`arr-space-${index}`}>{spaces}  </span>);
        elements.push(...highlightJson(item, indent + 1));
        if (index < obj.length - 1) {
          elements.push(<span key={`arr-comma-${index}`} className={colors.bracket}>,</span>);
        }
        elements.push(<br key={`arr-br-${index}`} />);
      });
      elements.push(<span key="arr-close-space">{spaces}</span>);
      elements.push(<span key="arr-close" className={colors.bracket}>]</span>);
    }
  } else if (typeof obj === 'object') {
    const entries = Object.entries(obj as Record<string, unknown>);
    if (entries.length === 0) {
      elements.push(<span key="empty-obj" className={colors.bracket}>{'{}'}</span>);
    } else {
      elements.push(<span key="obj-open" className={colors.bracket}>{'{'}</span>);
      elements.push(<br key="obj-br-open" />);
      entries.forEach(([key, value], index) => {
        elements.push(<span key={`obj-space-${index}`}>{spaces}  </span>);
        elements.push(<span key={`obj-key-${index}`} className={colors.key}>"{key}"</span>);
        elements.push(<span key={`obj-colon-${index}`} className={colors.bracket}>: </span>);
        elements.push(...highlightJson(value, indent + 1));
        if (index < entries.length - 1) {
          elements.push(<span key={`obj-comma-${index}`} className={colors.bracket}>,</span>);
        }
        elements.push(<br key={`obj-br-${index}`} />);
      });
      elements.push(<span key="obj-close-space">{spaces}</span>);
      elements.push(<span key="obj-close" className={colors.bracket}>{'}'}</span>);
    }
  }
  
  return elements;
}

export default function JsonViewer({ data, title }: JsonViewerProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const jsonString = JSON.stringify(data, null, 2);
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(jsonString);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
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
    a.download = 'match-result.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Filter JSON by search term
  const filteredJsonString = searchTerm 
    ? jsonString.split('\n').filter(line => 
        line.toLowerCase().includes(searchTerm.toLowerCase())
      ).join('\n')
    : jsonString;

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-gray-800 to-gray-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
          </div>
          <span className="text-gray-300 font-mono text-sm">{title || t('components.jsonViewer.title')}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative">
            <input
              type="text"
              placeholder={t('actions.search')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="px-3 py-1.5 text-sm bg-gray-700 text-gray-200 rounded-lg border border-gray-600 focus:outline-none focus:border-gray-500 placeholder-gray-500 w-40"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
              >
                ×
              </button>
            )}
          </div>
          
          {/* Collapse/Expand */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="px-3 py-1.5 text-sm bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors flex items-center gap-1"
          >
            {collapsed ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                {t('actions.expand')}
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
                {t('actions.collapse')}
              </>
            )}
          </button>
          
          {/* Download */}
          <button
            onClick={handleDownload}
            className="px-3 py-1.5 text-sm bg-gray-700 text-gray-300 rounded-lg hover:bg-gray-600 transition-colors flex items-center gap-1"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            {t('actions.download')}
          </button>
          
          {/* Copy */}
          <button
            onClick={handleCopy}
            className={`px-3 py-1.5 text-sm rounded-lg transition-colors flex items-center gap-1
              ${copied 
                ? 'bg-green-600 text-white' 
                : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}
          >
            {copied ? (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {t('actions.copied')}
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                {t('actions.copy')}
              </>
            )}
          </button>
        </div>
      </div>
      
      {/* JSON Content */}
      <div className={`overflow-auto bg-gray-50 ${collapsed ? 'max-h-48' : 'max-h-[70vh]'}`}>
        {searchTerm ? (
          // Simple text display when searching
          <pre className="p-6 text-sm font-mono whitespace-pre-wrap text-gray-700">
            {filteredJsonString || t('messages.noMatchesFound')}
          </pre>
        ) : (
          // Syntax highlighted display
          <pre className="p-6 text-sm font-mono leading-relaxed">
            {highlightJson(data)}
          </pre>
        )}
      </div>
      
      {/* Footer */}
      <div className="bg-gray-100 px-6 py-3 flex items-center justify-between text-xs text-gray-500 border-t border-gray-200">
        <span>{jsonString.length.toLocaleString()} {t('units.characters')}</span>
        <span>{jsonString.split('\n').length.toLocaleString()} {t('units.lines')}</span>
      </div>
    </div>
  );
}
