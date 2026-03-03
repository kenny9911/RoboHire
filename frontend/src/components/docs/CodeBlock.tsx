import { useState } from 'react';

interface CodeBlockProps {
  code?: string;
  language?: string;
  title?: string;
  tabs?: { label: string; code: string; language?: string }[];
}

export default function CodeBlock({ code = '', language = 'javascript', title, tabs }: CodeBlockProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [copied, setCopied] = useState(false);

  const currentCode = tabs ? tabs[activeTab].code : code;
  const currentLanguage = tabs ? tabs[activeTab].language || language : language;

  const handleCopy = async () => {
    await navigator.clipboard.writeText(currentCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const highlightCode = (code: string, _lang?: string) => {
    // Simple syntax highlighting using token-based approach to avoid regex conflicts
    return code.split('\n').map((line, i) => {
      // Escape HTML entities first
      let escapedLine = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');

      // Tokenize and highlight in a single pass to avoid conflicts
      const tokens: { start: number; end: number; html: string }[] = [];
      
      // Find strings (double and single quotes)
      const stringRegex = /("[^"]*"|'[^']*'|`[^`]*`)/g;
      let match;
      while ((match = stringRegex.exec(escapedLine)) !== null) {
        tokens.push({
          start: match.index,
          end: match.index + match[0].length,
          html: `<span class="text-emerald-400">${match[0]}</span>`
        });
      }

      // Find comments (only if not inside a string)
      const commentRegex = /(\/\/.*$|#(?!.*['"]).*$)/g;
      while ((match = commentRegex.exec(escapedLine)) !== null) {
        const isInsideString = tokens.some(t => match!.index >= t.start && match!.index < t.end);
        if (!isInsideString) {
          tokens.push({
            start: match.index,
            end: match.index + match[0].length,
            html: `<span class="text-slate-500">${match[0]}</span>`
          });
        }
      }

      // Sort tokens by position (descending) to replace from end to start
      tokens.sort((a, b) => b.start - a.start);

      // Apply replacements
      let highlightedLine = escapedLine;
      for (const token of tokens) {
        highlightedLine = 
          highlightedLine.slice(0, token.start) + 
          token.html + 
          highlightedLine.slice(token.end);
      }

      // Apply keyword highlighting (only to non-highlighted portions)
      const keywords = ['const', 'let', 'var', 'function', 'async', 'await', 'return', 'import', 'from', 'export', 'default', 'if', 'else', 'curl', 'requests', 'true', 'false', 'null'];
      keywords.forEach(keyword => {
        const regex = new RegExp(`(?<![\\w-])\\b(${keyword})\\b(?![\\w-])`, 'g');
        highlightedLine = highlightedLine.replace(regex, (match, p1, offset) => {
          // Check if this position is already inside a span
          const before = highlightedLine.slice(0, offset);
          const openSpans = (before.match(/<span/g) || []).length;
          const closeSpans = (before.match(/<\/span>/g) || []).length;
          if (openSpans > closeSpans) return match;
          return `<span class="text-purple-400">${p1}</span>`;
        });
      });

      return (
        <div key={i} className="leading-relaxed" dangerouslySetInnerHTML={{ __html: highlightedLine || '&nbsp;' }} />
      );
    });
  };

  return (
    <div className="rounded-xl overflow-hidden border border-slate-800 bg-slate-900 my-6">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-slate-800 border-b border-slate-700">
        <div className="flex items-center gap-4">
          {tabs ? (
            <div className="flex gap-1">
              {tabs.map((tab, index) => (
                <button
                  key={index}
                  onClick={() => setActiveTab(index)}
                  className={`px-3 py-1 text-sm rounded-md transition-colors ${
                    activeTab === index
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          ) : title ? (
            <span className="text-sm text-slate-400">{title}</span>
          ) : (
            <span className="text-sm text-slate-400">{currentLanguage}</span>
          )}
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-1 text-sm text-slate-400 hover:text-white transition-colors"
        >
          {copied ? (
            <>
              <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              <span>Copy</span>
            </>
          )}
        </button>
      </div>

      {/* Code */}
      <pre className="p-4 overflow-x-auto text-sm">
        <code className="text-slate-300 font-mono">
          {highlightCode(currentCode, currentLanguage)}
        </code>
      </pre>
    </div>
  );
}
