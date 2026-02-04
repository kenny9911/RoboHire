import { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';

interface TextAreaProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  showActions?: boolean;
}

export default function TextArea({ label, value, onChange, placeholder, rows = 6, showActions = true }: TextAreaProps) {
  const { t } = useTranslation();
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied'>('idle');
  const [pasteStatus, setPasteStatus] = useState<'idle' | 'pasted'>('idle');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleCopy = async () => {
    if (!value.trim()) return;
    
    try {
      await navigator.clipboard.writeText(value);
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    } catch (err) {
      // Fallback for older browsers
      textareaRef.current?.select();
      document.execCommand('copy');
      setCopyStatus('copied');
      setTimeout(() => setCopyStatus('idle'), 2000);
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      onChange(text);
      setPasteStatus('pasted');
      setTimeout(() => setPasteStatus('idle'), 2000);
    } catch (err) {
      // If clipboard API fails, focus the textarea so user can paste manually
      textareaRef.current?.focus();
    }
  };

  const handleClear = () => {
    onChange('');
    textareaRef.current?.focus();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="block text-sm font-medium text-gray-700">{label}</label>
        {showActions && (
          <div className="flex items-center gap-1">
            {/* Paste Button */}
            <button
              type="button"
              onClick={handlePaste}
              className={`px-2 py-1 text-xs rounded transition-all duration-200 flex items-center gap-1
                ${pasteStatus === 'pasted' 
                  ? 'bg-green-100 text-green-700' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              title={t('tooltips.paste')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              {pasteStatus === 'pasted' ? t('actions.pasted') : t('actions.paste')}
            </button>
            
            {/* Copy Button */}
            <button
              type="button"
              onClick={handleCopy}
              disabled={!value.trim()}
              className={`px-2 py-1 text-xs rounded transition-all duration-200 flex items-center gap-1
                ${copyStatus === 'copied' 
                  ? 'bg-green-100 text-green-700' 
                  : value.trim() 
                    ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' 
                    : 'bg-gray-50 text-gray-400 cursor-not-allowed'}`}
              title={t('tooltips.copy')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              {copyStatus === 'copied' ? t('actions.copied') : t('actions.copy')}
            </button>
            
            {/* Clear Button */}
            <button
              type="button"
              onClick={handleClear}
              disabled={!value.trim()}
              className={`px-2 py-1 text-xs rounded transition-all duration-200 flex items-center gap-1
                ${value.trim() 
                  ? 'bg-gray-100 text-gray-600 hover:bg-red-100 hover:text-red-600' 
                  : 'bg-gray-50 text-gray-400 cursor-not-allowed'}`}
              title={t('tooltips.clear')}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              {t('actions.clear')}
            </button>
          </div>
        )}
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
        className="w-full px-4 py-3 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-colors resize-none"
      />
      {showActions && value.trim() && (
        <div className="mt-1 text-xs text-gray-400 text-right">
          {value.length.toLocaleString()} {t('units.characters')}
        </div>
      )}
    </div>
  );
}
