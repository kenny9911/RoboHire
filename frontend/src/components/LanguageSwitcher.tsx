import { useTranslation } from 'react-i18next';

const languageOptions = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
  { value: 'ja', label: '日本語' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'pt', label: 'Português' },
  { value: 'de', label: 'Deutsch' },
];

interface LanguageSwitcherProps {
  showLabel?: boolean;
  className?: string;
  selectClassName?: string;
}

export default function LanguageSwitcher({
  showLabel = false,
  className = '',
  selectClassName = '',
}: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation();

  return (
    <div className={className}>
      {showLabel && (
        <label className="block text-xs font-medium text-gray-500 mb-2">
          {t('language.label')}
        </label>
      )}
      <select
        value={i18n.language}
        onChange={(e) => i18n.changeLanguage(e.target.value)}
        className={`w-full text-sm border border-gray-300 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 ${selectClassName}`}
      >
        {languageOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
