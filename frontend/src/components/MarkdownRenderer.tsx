import { useMemo } from 'react';

const CJK_CHAR_REGEX = /[\u3040-\u30ff\u3400-\u9fff]/;

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildKeywordRegex = (keywords: string[]): RegExp | null => {
  const patterns = keywords
    .map(k => k.trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(keyword => {
      const escaped = escapeRegex(keyword);
      if (CJK_CHAR_REGEX.test(keyword)) return escaped;
      return `(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`;
    });

  if (patterns.length === 0) return null;
  return new RegExp(`(${patterns.join('|')})`, 'gi');
};

interface MarkdownRendererProps {
  content: string;
  className?: string;
  keywords?: string[];
}

export function MarkdownRenderer({ content, className = '', keywords = [] }: MarkdownRendererProps) {
  const renderedContent = useMemo(() => {
    if (!content) return '';

    let html = content
      // Escape HTML first
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

      // Headers
      .replace(/^#### (.+)$/gm, '<h4 class="text-sm font-bold mt-3 mb-1">$1</h4>')
      .replace(/^### (.+)$/gm, '<h3 class="text-base font-bold mt-4 mb-2">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-lg font-bold mt-5 mb-3">$1</h2>')

      // Bold text
      .replace(/\*\*(.+?)\*\*/g, '<strong class="font-bold">$1</strong>')
      .replace(/__(.+?)__/g, '<strong class="font-bold">$1</strong>')

      // Italic text
      .replace(/(?<![*\w])\*([^*\n]+)\*(?![*\w])/g, '<em class="italic">$1</em>')

      // Lists
      .replace(/^[*\-•]\s+(.+)$/gm, '<li class="flex items-start gap-2 mb-1"><span class="mt-2 w-1 h-1 rounded-full bg-current opacity-50 flex-none"></span><span class="leading-relaxed">$1</span></li>')

      // Paragraphs
      // Match lines that don't start with HTML tags or whitespace
      .replace(/^(?!<[a-z])(.+)$/gm, '<p class="mb-2 leading-relaxed">$1</p>');

    // Wrap lists in UL
    html = html.replace(/(<li[^>]*>[\s\S]*?<\/li>\s*)+/g, (match) => {
      return `<ul class="mb-3 pl-1">${match}</ul>`;
    });

    // Highlight keywords
    if (keywords.length > 0) {
      const regex = buildKeywordRegex(keywords);
      if (regex) {
        const parts = html.split(/(<[^>]+>)/g);
        html = parts.map(part => {
          if (part.startsWith('<')) return part;
          return part.replace(regex, '<mark class="bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100 px-0.5 rounded font-medium">$1</mark>');
        }).join('');
      }
    }

    return html;
  }, [content, keywords]);

  return (
    <div
      className={`markdown-preview ${className}`}
      dangerouslySetInnerHTML={{ __html: renderedContent }}
    />
  );
}
