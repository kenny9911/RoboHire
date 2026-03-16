export type InterviewLanguageCode = 'en' | 'zh' | 'zh-TW' | 'ja' | 'es' | 'fr' | 'pt' | 'de';

export const INTERVIEW_LANGUAGE_OPTIONS: Array<{ value: InterviewLanguageCode; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'zh', label: '中文' },
  { value: 'zh-TW', label: '繁體中文' },
  { value: 'ja', label: '日本語' },
  { value: 'es', label: 'Español' },
  { value: 'fr', label: 'Français' },
  { value: 'pt', label: 'Português' },
  { value: 'de', label: 'Deutsch' },
];

const SUPPORTED_INTERVIEW_LANGUAGES = new Set<InterviewLanguageCode>(
  INTERVIEW_LANGUAGE_OPTIONS.map((option) => option.value),
);

const LOCALE_LANGUAGE_MAP: Record<string, InterviewLanguageCode> = {
  en: 'en',
  'en-us': 'en',
  'en-gb': 'en',
  zh: 'zh',
  'zh-cn': 'zh',
  'zh-hans': 'zh',
  'zh-sg': 'zh',
  'zh-tw': 'zh-TW',
  'zh-hant': 'zh-TW',
  ja: 'ja',
  es: 'es',
  fr: 'fr',
  pt: 'pt',
  'pt-br': 'pt',
  'pt-pt': 'pt',
  de: 'de',
};

const INTERVIEW_LANGUAGE_DISPLAY = Object.fromEntries(
  INTERVIEW_LANGUAGE_OPTIONS.map((option) => [option.value, option.label]),
) as Record<InterviewLanguageCode, string>;

const INTERVIEW_LANGUAGE_API_NAMES: Record<InterviewLanguageCode, string> = {
  en: 'English',
  zh: '中文 (Chinese)',
  'zh-TW': '繁體中文 (Traditional Chinese)',
  ja: '日本語 (Japanese)',
  es: 'Español (Spanish)',
  fr: 'Français (French)',
  pt: 'Português (Portuguese)',
  de: 'Deutsch (German)',
};

export function normalizeInterviewLanguage(value?: string | null): InterviewLanguageCode {
  if (!value) return 'en';

  const trimmed = value.trim();
  if (!trimmed) return 'en';

  const normalized = LOCALE_LANGUAGE_MAP[trimmed.toLowerCase()];
  if (normalized) return normalized;

  return SUPPORTED_INTERVIEW_LANGUAGES.has(trimmed as InterviewLanguageCode)
    ? trimmed as InterviewLanguageCode
    : 'en';
}

export function getInterviewLanguageDisplay(value?: string | null): string {
  return INTERVIEW_LANGUAGE_DISPLAY[normalizeInterviewLanguage(value)];
}

export function getInterviewLanguageApiName(value?: string | null): string {
  return INTERVIEW_LANGUAGE_API_NAMES[normalizeInterviewLanguage(value)];
}
