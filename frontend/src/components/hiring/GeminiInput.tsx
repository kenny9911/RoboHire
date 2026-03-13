import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';

interface SuggestionChip {
  id: string;
  label: string;
  icon?: string;
}

interface GeminiInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (message: string, attachedFile?: File) => void;
  placeholder?: string;
  disabled?: boolean;
  showSuggestions?: boolean;
  suggestions?: SuggestionChip[];
  onSuggestionClick?: (suggestion: SuggestionChip) => void;
  autoFocus?: boolean;
}

export default function GeminiInput({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled = false,
  showSuggestions = false,
  suggestions = [],
  onSuggestionClick,
  autoFocus = false,
}: GeminiInputProps) {
  const { t } = useTranslation();
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [isFocused, setIsFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [value]);

  // Auto-focus
  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const handleSubmit = () => {
    if (!value.trim() && !attachedFile) return;
    onSubmit(value.trim(), attachedFile || undefined);
    setAttachedFile(null);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAttachedFile(file);
    }
  };

  const removeAttachedFile = () => {
    setAttachedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const defaultSuggestions: SuggestionChip[] = [
    { id: 'engineer', label: t('hiring.suggestEngineer', 'Hire a Software Engineer'), icon: '👨‍💻' },
    { id: 'pm', label: t('hiring.suggestPM', 'Hire a Product Manager'), icon: '🎯' },
    { id: 'designer', label: t('hiring.suggestDesigner', 'Hire a UX Designer'), icon: '🎨' },
    { id: 'sales', label: t('hiring.suggestSales', 'Hire a Sales Executive'), icon: '💼' },
  ];

  const displaySuggestions = suggestions.length > 0 ? suggestions : defaultSuggestions;

  return (
    <div className="w-full max-w-3xl mx-auto">
      {/* Suggestion Chips */}
      {showSuggestions && (
        <div className="flex flex-wrap justify-center gap-2 mb-4">
          {displaySuggestions.map((suggestion) => (
            <button
              key={suggestion.id}
              onClick={() => onSuggestionClick?.(suggestion)}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-full hover:bg-gray-50 hover:border-gray-300 transition-all shadow-sm"
              disabled={disabled}
            >
              {suggestion.icon && <span>{suggestion.icon}</span>}
              <span>{suggestion.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Input Container */}
      <div
        className={`relative bg-white rounded-2xl border transition-all duration-200 ${
          isFocused
            ? 'border-indigo-300 shadow-lg shadow-indigo-100/50 ring-2 ring-indigo-100'
            : 'border-gray-200 shadow-md hover:shadow-lg'
        }`}
      >
        {/* Attached File Preview */}
        {attachedFile && (
          <div className="flex items-center gap-2 px-4 pt-3 pb-1">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-lg text-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <span className="truncate max-w-[200px]">{attachedFile.name}</span>
              <button
                onClick={removeAttachedFile}
                className="p-0.5 hover:bg-indigo-100 rounded transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Input Row */}
        <div className="flex items-end gap-2 p-2">
          {/* Attach File Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled}
            className="flex-shrink-0 p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('hiring.attachFile', 'Attach file')}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13"
              />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".pdf,.doc,.docx,.txt,.md,.markdown"
            onChange={handleFileSelect}
          />

          {/* Text Input */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder={placeholder || t('hiring.inputPlaceholder', 'Describe your ideal candidate...')}
            disabled={disabled}
            rows={1}
            className="flex-1 px-2 py-2.5 text-gray-900 placeholder-gray-400 bg-transparent resize-none focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ minHeight: '44px', maxHeight: '200px' }}
          />

          {/* Send Button */}
          <button
            onClick={handleSubmit}
            disabled={disabled || (!value.trim() && !attachedFile)}
            className={`flex-shrink-0 p-2.5 rounded-xl transition-all duration-200 ${
              value.trim() || attachedFile
                ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-200 hover:shadow-indigo-300 hover:scale-105'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            } disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100`}
            title={t('hiring.send', 'Send')}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
              />
            </svg>
          </button>
        </div>
      </div>

      {/* Helper Text */}
      <p className="mt-2 text-xs text-center text-gray-400">
        {t(
          'hiring.inputHelperText',
          'Press Enter to send, Shift+Enter for new line. Upload JD files for faster setup.'
        )}
      </p>
    </div>
  );
}
