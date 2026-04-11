import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * HardRequirement — mirrors the backend shape in `lib/hardRequirementSchema.ts`
 * (see `docs/icp-architecture.md` §3). Full replace semantics: saving sends the
 * entire list back to `PATCH /api/v1/agents/:id/hard-requirements`.
 */
export type HRField =
  | 'experienceYears'
  | 'salaryExpectation'
  | 'location'
  | 'currentRole'
  | 'education.degree'
  | 'education.field'
  | 'languages'
  | 'skills.technical'
  | 'tags'
  | 'custom';

export type HROperator =
  | 'eq'
  | 'neq'
  | 'gte'
  | 'lte'
  | 'gt'
  | 'lt'
  | 'contains'
  | 'contains_any'
  | 'contains_all'
  | 'not_contains'
  | 'matches'
  | 'not_matches'
  | 'in'
  | 'not_in';

export interface HardRequirement {
  id: string;
  field: HRField;
  operator: HROperator;
  value: unknown;
  description: string;
  enabled: boolean;
  source?: 'user' | 'icp_suggestion';
  sourceIcpVersion?: number;
  createdAt: string;
  updatedAt: string;
}

interface Props {
  value: HardRequirement[];
  onChange: (next: HardRequirement[]) => void;
  disabled?: boolean;
  /** Optional live dry-run preview: % of pool currently excluded by the rules */
  dryRunExcludedPct?: number;
  /** Compact layout for the AgentCriteriaModal top section */
  compact?: boolean;
}

/** Field → allowed operators. Hard-coded per design §3.5. Legal-blocked fields (age / gender / race / etc.) are simply not in this list. */
const FIELD_OPERATORS: Record<HRField, HROperator[]> = {
  experienceYears: ['eq', 'neq', 'gte', 'lte', 'gt', 'lt'],
  salaryExpectation: ['gte', 'lte', 'gt', 'lt'],
  location: ['eq', 'neq', 'in', 'not_in', 'matches'],
  currentRole: ['eq', 'contains', 'not_contains', 'matches', 'not_matches'],
  'education.degree': ['eq', 'in', 'not_in', 'gte'],
  'education.field': ['eq', 'in', 'contains', 'not_contains'],
  languages: ['contains', 'contains_any', 'contains_all', 'not_contains'],
  'skills.technical': ['contains', 'contains_any', 'contains_all', 'not_contains'],
  tags: ['contains', 'contains_any', 'contains_all', 'not_contains'],
  custom: ['matches', 'not_matches'],
};

const FIELD_ICONS: Record<HRField, string> = {
  experienceYears: '💼',
  salaryExpectation: '💰',
  location: '📍',
  currentRole: '🏷',
  'education.degree': '🎓',
  'education.field': '📚',
  languages: '🌐',
  'skills.technical': '🛠',
  tags: '🔖',
  custom: '⚙',
};

const ARRAY_OPERATORS: HROperator[] = [
  'in',
  'not_in',
  'contains',
  'contains_any',
  'contains_all',
  'not_contains',
];
const NUMBER_FIELDS: HRField[] = ['experienceYears', 'salaryExpectation'];
const DEGREE_VALUES = ['HighSchool', 'Associate', 'Bachelor', 'Master', 'PhD'] as const;

function uuid(): string {
  // lightweight client-side uuid — crypto.randomUUID may not exist in older browsers
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return (crypto as { randomUUID: () => string }).randomUUID();
  }
  return `hr_${Math.random().toString(36).slice(2, 12)}`;
}

function emptyRule(field: HRField = 'experienceYears'): HardRequirement {
  const now = new Date().toISOString();
  const op = FIELD_OPERATORS[field][0];
  return {
    id: uuid(),
    field,
    operator: op,
    value: NUMBER_FIELDS.includes(field) ? 0 : ARRAY_OPERATORS.includes(op) ? [] : '',
    description: '',
    enabled: true,
    source: 'user',
    createdAt: now,
    updatedAt: now,
  };
}

function validateRule(rule: HardRequirement): string | null {
  if (NUMBER_FIELDS.includes(rule.field)) {
    if (typeof rule.value !== 'number' || Number.isNaN(rule.value)) {
      return 'mustBeNumber';
    }
  }
  if (ARRAY_OPERATORS.includes(rule.operator)) {
    if (!Array.isArray(rule.value) || rule.value.length === 0) {
      return 'addAtLeastOne';
    }
  }
  if (rule.field === 'custom' && (rule.operator === 'matches' || rule.operator === 'not_matches')) {
    const v = rule.value as { pattern?: string } | string | undefined;
    const pattern = typeof v === 'string' ? v : v?.pattern;
    if (!pattern) return 'emptyRegex';
    try {
      new RegExp(pattern);
    } catch {
      return 'invalidRegex';
    }
  }
  return null;
}

type Translator = (k: string, d?: string) => string;

function autoDescribe(rule: HardRequirement, translate: Translator): string {
  const field = translate(`agents.workbench.hardRequirements.fields.${rule.field}`, rule.field);
  const op = translate(`agents.workbench.hardRequirements.operators.${rule.operator}`, rule.operator);
  const val = Array.isArray(rule.value) ? rule.value.join(', ') : String(rule.value ?? '');
  return `${field} ${op} ${val}`.trim();
}

export default function HardRequirementsEditor({
  value,
  onChange,
  disabled = false,
  dryRunExcludedPct,
  compact = false,
}: Props) {
  const { t } = useTranslation();

  const updateRule = (id: string, patch: Partial<HardRequirement>) => {
    onChange(
      value.map((r) =>
        r.id === id ? { ...r, ...patch, updatedAt: new Date().toISOString() } : r,
      ),
    );
  };

  const removeRule = (id: string) => {
    onChange(value.filter((r) => r.id !== id));
  };

  const addRule = (field: HRField = 'experienceYears') => {
    onChange([...value, emptyRule(field)]);
  };

  const addPreset = (preset: 'yearsExp' | 'location' | 'english' | 'bachelor') => {
    const now = new Date().toISOString();
    let rule: HardRequirement;
    switch (preset) {
      case 'yearsExp':
        rule = {
          ...emptyRule('experienceYears'),
          operator: 'gte',
          value: 5,
          description: t('agents.workbench.hardRequirements.presets.yearsExp', 'At least 5 years'),
          updatedAt: now,
        };
        break;
      case 'location':
        rule = {
          ...emptyRule('location'),
          operator: 'in',
          value: [],
          description: t('agents.workbench.hardRequirements.presets.location', 'Located in…'),
          updatedAt: now,
        };
        break;
      case 'english':
        rule = {
          ...emptyRule('languages'),
          operator: 'contains_any',
          value: ['English'],
          description: t('agents.workbench.hardRequirements.presets.english', 'Speaks English'),
          updatedAt: now,
        };
        break;
      case 'bachelor':
      default:
        rule = {
          ...emptyRule('education.degree'),
          operator: 'gte',
          value: 'Bachelor',
          description: t('agents.workbench.hardRequirements.presets.bachelor', 'Bachelor or higher'),
          updatedAt: now,
        };
        break;
    }
    onChange([...value, rule]);
  };

  // Field options for the dropdown. Legal-blocked fields (age, gender, race,
  // nationality, marital status, religion, disability) are intentionally omitted.
  const fieldOptions = useMemo<HRField[]>(
    () => [
      'experienceYears',
      'salaryExpectation',
      'location',
      'currentRole',
      'education.degree',
      'education.field',
      'languages',
      'skills.technical',
      'tags',
      'custom',
    ],
    [],
  );

  return (
    <div
      className={`rounded-2xl border border-amber-300 bg-amber-50/40 ${
        compact ? '' : 'shadow-sm'
      }`}
      aria-label={t('agents.workbench.hardRequirements.title', 'Hard requirements')}
    >
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-amber-200 bg-amber-100/60 px-4 py-3">
        <svg className="mt-0.5 h-5 w-5 flex-none text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
        </svg>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-semibold text-amber-900">
              {t('agents.workbench.hardRequirements.titleCn', '硬性条件')}
              {t('agents.workbench.hardRequirements.titleCn', '硬性条件') && ' · '}
              {t('agents.workbench.hardRequirements.titleEn', 'Hard requirements')}
            </h3>
            <span
              aria-hidden="true"
              className="rounded-full bg-amber-600 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.1em] text-white"
            >
              {t('agents.workbench.hardRequirements.badge', 'Strict Filter')}
            </span>
          </div>
          <p className="mt-1 text-xs text-amber-800/80">
            {t(
              'agents.workbench.hardRequirements.warning',
              'Candidates not meeting ALL of these are excluded entirely — not down-scored. Use sparingly.',
            )}
          </p>
          {typeof dryRunExcludedPct === 'number' && dryRunExcludedPct > 0 && (
            <p className={`mt-1 text-xs ${dryRunExcludedPct > 90 ? 'font-semibold text-rose-600' : 'text-amber-700'}`}>
              {dryRunExcludedPct > 90
                ? t(
                    'agents.workbench.hardRequirements.dryRunWarning',
                    'Warning: would exclude almost everyone ({{pct}}%)',
                    { pct: dryRunExcludedPct.toFixed(0) },
                  )
                : t('agents.workbench.hardRequirements.dryRun', 'Currently excludes ~{{pct}}% of candidates', {
                    pct: dryRunExcludedPct.toFixed(0),
                  })}
            </p>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="space-y-2 px-4 py-3">
        {value.length === 0 ? (
          <div className="rounded-xl border border-dashed border-amber-300 bg-white/50 px-4 py-6 text-center">
            <p className="text-sm font-medium text-slate-700">
              {t('agents.workbench.hardRequirements.emptyTitle', 'No strict filters yet.')}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {t(
                'agents.workbench.hardRequirements.emptyDesc',
                'Every sourced candidate will reach the scoring stage.',
              )}
            </p>
          </div>
        ) : (
          value.map((rule) => {
            const errorKey = validateRule(rule);
            return (
              <RuleRow
                key={rule.id}
                rule={rule}
                fieldOptions={fieldOptions}
                disabled={disabled}
                errorKey={errorKey}
                autoDesc={autoDescribe(rule, t as unknown as Translator)}
                onChange={(patch) => updateRule(rule.id, patch)}
                onRemove={() => removeRule(rule.id)}
              />
            );
          })
        )}

        <div className="pt-1">
          <button
            type="button"
            onClick={() => addRule()}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
            {t('agents.workbench.hardRequirements.addRule', 'Add hard requirement')}
          </button>
        </div>

        {/* Quick-add chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-2">
          <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-700">
            {t('agents.workbench.hardRequirements.quickAdd', 'Quick add')}
          </span>
          {(['yearsExp', 'location', 'english', 'bachelor'] as const).map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => addPreset(preset)}
              disabled={disabled}
              className="rounded-full border border-amber-300 bg-white px-2.5 py-0.5 text-[11px] font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              {t(`agents.workbench.hardRequirements.presets.${preset}`, preset)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Rule row ─────────────────────────────────────────────────────────────────

interface RuleRowProps {
  rule: HardRequirement;
  fieldOptions: HRField[];
  disabled: boolean;
  errorKey: string | null;
  autoDesc: string;
  onChange: (patch: Partial<HardRequirement>) => void;
  onRemove: () => void;
}

function RuleRow({ rule, fieldOptions, disabled, errorKey, autoDesc, onChange, onRemove }: RuleRowProps) {
  const { t } = useTranslation();
  const operators = FIELD_OPERATORS[rule.field];
  const hasError = errorKey !== null;
  const isNumber = NUMBER_FIELDS.includes(rule.field);
  const isArray = ARRAY_OPERATORS.includes(rule.operator);
  const isDegree = rule.field === 'education.degree';

  const handleFieldChange = (next: HRField) => {
    const nextOp = FIELD_OPERATORS[next][0];
    onChange({
      field: next,
      operator: nextOp,
      value: NUMBER_FIELDS.includes(next) ? 0 : ARRAY_OPERATORS.includes(nextOp) ? [] : '',
    });
  };

  const handleOperatorChange = (next: HROperator) => {
    const nowArray = ARRAY_OPERATORS.includes(next);
    const wasArray = Array.isArray(rule.value);
    let value = rule.value;
    if (nowArray && !wasArray) value = rule.value ? [String(rule.value)] : [];
    if (!nowArray && wasArray) value = (rule.value as string[])[0] ?? '';
    onChange({ operator: next, value });
  };

  return (
    <div
      role="group"
      aria-label={autoDesc}
      className={`rounded-xl border bg-white px-3 py-2.5 ${
        hasError ? 'border-rose-300' : 'border-amber-200'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2 md:flex-nowrap">
        <span className="text-base" aria-hidden="true">
          {FIELD_ICONS[rule.field]}
        </span>
        <select
          aria-label={t('agents.workbench.hardRequirements.fieldLabel', 'Field')}
          value={rule.field}
          onChange={(e) => handleFieldChange(e.target.value as HRField)}
          disabled={disabled}
          className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
        >
          {fieldOptions.map((f) => (
            <option key={f} value={f}>
              {t(`agents.workbench.hardRequirements.fields.${f}`, f)}
            </option>
          ))}
        </select>
        <select
          aria-label={t('agents.workbench.hardRequirements.operatorLabel', 'Operator')}
          value={rule.operator}
          onChange={(e) => handleOperatorChange(e.target.value as HROperator)}
          disabled={disabled}
          className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-medium text-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
        >
          {operators.map((op) => (
            <option key={op} value={op}>
              {t(`agents.workbench.hardRequirements.operators.${op}`, op)}
            </option>
          ))}
        </select>

        <div className="min-w-0 flex-1">
          <ValueInput
            rule={rule}
            isNumber={isNumber}
            isArray={isArray}
            isDegree={isDegree}
            disabled={disabled}
            onChange={(value) => onChange({ value })}
          />
        </div>

        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={t('agents.workbench.hardRequirements.removeRule', 'Remove rule: {{desc}}', {
            desc: autoDesc,
          })}
          className="rounded-md p-1 text-slate-300 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Description line — auto OR user-written */}
      <div className="mt-1.5 flex items-center gap-2 pl-6">
        <input
          type="text"
          value={rule.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder={autoDesc}
          disabled={disabled}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[11px] italic text-slate-500 placeholder:text-slate-400 focus:outline-none focus:ring-0"
        />
      </div>

      {hasError && (
        <p className="mt-1 pl-6 text-[11px] text-rose-600">
          {t(`agents.workbench.hardRequirements.validation.${errorKey}`, errorKey || '')}
        </p>
      )}
    </div>
  );
}

// ── Value input dispatcher ───────────────────────────────────────────────────

function ValueInput({
  rule,
  isNumber,
  isArray,
  isDegree,
  disabled,
  onChange,
}: {
  rule: HardRequirement;
  isNumber: boolean;
  isArray: boolean;
  isDegree: boolean;
  disabled: boolean;
  onChange: (next: unknown) => void;
}) {
  const { t } = useTranslation();

  if (isDegree && !isArray) {
    return (
      <select
        value={String(rule.value || 'Bachelor')}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
      >
        {DEGREE_VALUES.map((d) => (
          <option key={d} value={d}>
            {t(`agents.workbench.hardRequirements.degrees.${d}`, d)}
          </option>
        ))}
      </select>
    );
  }

  if (isNumber) {
    return (
      <input
        type="number"
        value={Number(rule.value ?? 0)}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
      />
    );
  }

  if (rule.field === 'custom') {
    const v = typeof rule.value === 'object' && rule.value !== null ? (rule.value as { pattern?: string }) : { pattern: String(rule.value || '') };
    return (
      <input
        type="text"
        value={v.pattern || ''}
        onChange={(e) => onChange({ field: 'resumeText', pattern: e.target.value })}
        placeholder="regex"
        disabled={disabled}
        className="w-full rounded-lg border border-slate-200 px-2 py-1 font-mono text-xs text-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
      />
    );
  }

  if (isArray) {
    return <TagInput value={(rule.value as string[]) || []} onChange={onChange} disabled={disabled} />;
  }

  return (
    <input
      type="text"
      value={String(rule.value ?? '')}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="w-full rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
    />
  );
}

function TagInput({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (next: unknown) => void;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const add = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter' && e.key !== ',') return;
    e.preventDefault();
    const input = e.currentTarget;
    const next = input.value.trim();
    if (!next) return;
    if (!value.includes(next)) onChange([...value, next]);
    input.value = '';
  };
  const remove = (tag: string) => {
    onChange(value.filter((v) => v !== tag));
  };
  return (
    <div className="flex min-h-[26px] flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1">
      {value.map((tag) => (
        <span
          key={tag}
          className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-800"
        >
          {tag}
          <button
            type="button"
            onClick={() => remove(tag)}
            disabled={disabled}
            className="text-amber-600 hover:text-rose-600"
            aria-label={`Remove ${tag}`}
          >
            ×
          </button>
        </span>
      ))}
      <input
        type="text"
        onKeyDown={add}
        disabled={disabled}
        placeholder={value.length === 0 ? t('agents.workbench.hardRequirements.tagPlaceholder', 'Type and press Enter') : ''}
        className="min-w-[80px] flex-1 border-0 bg-transparent p-0 text-xs text-slate-700 placeholder:text-slate-400 focus:outline-none focus:ring-0"
      />
    </div>
  );
}
