/**
 * hardRequirementsFilter — validates and applies user-declared hard
 * requirements against a resume pool.
 *
 * See docs/icp-architecture.md §3 for the authoritative spec.
 *
 * Two-stage execution is described in the spec (Prisma pre-filter + JS
 * post-filter). For Phase 6 v1 we implement BOTH stages in JS — every
 * rule is evaluated against the already-loaded resume row. The Prisma
 * SQL push-down is a follow-up (TODO below) that will materialize the
 * obvious predicates (experienceYears gte/lte, tags hasSome, etc.) into
 * the source-branch `where` clauses so large MinIO pools don't fully
 * hydrate into memory.
 */

import type { HardRequirement, HRField, HROperator } from '../types/icp.js';

export type { HardRequirement, HRField, HROperator };

// ── Resume shape accepted by the filter ───────────────────────────────────
//
// Intentionally a structural interface rather than the Prisma model so the
// source-branch helpers can pass their narrow `select` projection.
export interface HRResumeInput {
  id: string;
  name: string;
  resumeText?: string | null;
  currentRole?: string | null;
  highlight?: string | null;
  tags?: string[] | null;
  experienceYears?: string | null;
  parsedData?: unknown;
  preferences?: unknown;
}

export interface HardRequirementRejection {
  resume: HRResumeInput;
  ruleId: string;
  reason: string;
}

export interface ApplyHardRequirementsResult {
  passed: HRResumeInput[];
  rejected: HardRequirementRejection[];
}

// ── Legal blocklist ───────────────────────────────────────────────────────

/**
 * Substrings that, if found in a field path, must be rejected by validation.
 * Guards against anti-discrimination violations. Location and language are
 * explicitly allowed (they're business-legitimate filters).
 */
const LEGAL_BLOCKLIST = [
  'age',
  'gender',
  'race',
  'religion',
  'nationality',
  'marital',
  'pregnan', // pregnant / pregnancy
];

function isProtectedField(field: string): boolean {
  const lower = field.toLowerCase();
  return LEGAL_BLOCKLIST.some((term) => lower.includes(term));
}

// ── Type × operator matrix ────────────────────────────────────────────────

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

const DEGREE_RANK: Record<string, number> = {
  HighSchool: 1,
  Associate: 2,
  Bachelor: 3,
  Master: 4,
  PhD: 5,
  // Common aliases from the parser
  本科: 3,
  学士: 3,
  硕士: 4,
  研究生: 4,
  博士: 5,
  专科: 2,
  高中: 1,
};

// ── Validation ────────────────────────────────────────────────────────────

export interface ValidateResult {
  ok: boolean;
  error?: string;
}

export function validateHardRequirement(rule: HardRequirement): ValidateResult {
  if (!rule || typeof rule !== 'object') return { ok: false, error: 'rule is not an object' };
  if (typeof rule.id !== 'string' || rule.id.length === 0) {
    return { ok: false, error: 'rule.id must be a non-empty string' };
  }
  if (typeof rule.field !== 'string') return { ok: false, error: 'rule.field is required' };

  if (isProtectedField(rule.field)) {
    return { ok: false, error: 'field cannot be used (anti-discrimination law)' };
  }

  const allowedOps = FIELD_OPERATORS[rule.field as HRField];
  if (!allowedOps) {
    return { ok: false, error: `unknown field "${rule.field}"` };
  }
  if (!allowedOps.includes(rule.operator)) {
    return {
      ok: false,
      error: `operator "${rule.operator}" not allowed on field "${rule.field}"`,
    };
  }

  // Type-check `value` against the operator family.
  if (['eq', 'neq', 'gte', 'lte', 'gt', 'lt'].includes(rule.operator)) {
    if (rule.field === 'experienceYears' || rule.field === 'salaryExpectation') {
      if (typeof rule.value !== 'number' || !Number.isFinite(rule.value)) {
        return { ok: false, error: `${rule.field} ${rule.operator} requires a numeric value` };
      }
    } else if (rule.field === 'education.degree') {
      if (typeof rule.value !== 'string') {
        return { ok: false, error: 'education.degree value must be a string' };
      }
    } else {
      // location/currentRole string comparisons
      if (typeof rule.value !== 'string') {
        return { ok: false, error: `${rule.operator} requires a string value` };
      }
    }
  }

  if (rule.operator === 'in' || rule.operator === 'not_in') {
    if (!Array.isArray(rule.value)) {
      return { ok: false, error: `${rule.operator} requires an array value` };
    }
  }

  if (
    rule.operator === 'contains' ||
    rule.operator === 'contains_any' ||
    rule.operator === 'contains_all' ||
    rule.operator === 'not_contains'
  ) {
    if (!(typeof rule.value === 'string' || Array.isArray(rule.value))) {
      return { ok: false, error: `${rule.operator} requires a string or string[] value` };
    }
  }

  if (rule.operator === 'matches' || rule.operator === 'not_matches') {
    if (rule.field === 'custom') {
      if (!rule.value || typeof rule.value !== 'object') {
        return { ok: false, error: 'custom matches requires { field, pattern, flags? }' };
      }
      const v = rule.value as { field?: unknown; pattern?: unknown; flags?: unknown };
      if (typeof v.pattern !== 'string') {
        return { ok: false, error: 'custom.pattern must be a string' };
      }
      try {
        new RegExp(v.pattern, typeof v.flags === 'string' ? v.flags : undefined);
      } catch {
        return { ok: false, error: 'custom.pattern is not a valid regex' };
      }
    } else {
      if (typeof rule.value !== 'string') {
        return { ok: false, error: `${rule.operator} requires a string regex value` };
      }
      try {
        new RegExp(rule.value);
      } catch {
        return { ok: false, error: 'value is not a valid regex' };
      }
    }
  }

  return { ok: true };
}

// ── Field extraction from Resume rows ─────────────────────────────────────

function parseExperienceYears(resume: HRResumeInput): number | null {
  // Prefer a numeric field inside parsedData if present, else parse the
  // "5 years 3 months" string column.
  const pd = (resume.parsedData ?? null) as Record<string, unknown> | null;
  if (pd) {
    const v = pd.yearsOfExperience ?? pd.experienceYears ?? pd.totalYearsExperience;
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const m = v.match(/(\d+(?:\.\d+)?)/);
      if (m) return parseFloat(m[1]);
    }
  }
  if (typeof resume.experienceYears === 'string') {
    const m = resume.experienceYears.match(/(\d+(?:\.\d+)?)/);
    if (m) return parseFloat(m[1]);
  }
  return null;
}

function parseSalaryExpectation(resume: HRResumeInput): number | null {
  const prefs = (resume.preferences ?? null) as Record<string, unknown> | null;
  if (prefs) {
    const sal = prefs.salary ?? prefs.salaryExpectation;
    if (typeof sal === 'number' && Number.isFinite(sal)) return sal;
    if (sal && typeof sal === 'object') {
      const o = sal as Record<string, unknown>;
      if (typeof o.min === 'number') return o.min;
      if (typeof o.expected === 'number') return o.expected;
    }
  }
  return null;
}

function parseLocation(resume: HRResumeInput): string | null {
  const pd = (resume.parsedData ?? null) as Record<string, unknown> | null;
  if (pd) {
    if (typeof pd.location === 'string') return pd.location;
    const contact = pd.contact as Record<string, unknown> | undefined;
    if (contact && typeof contact.location === 'string') return contact.location;
    if (contact && typeof contact.city === 'string') return contact.city;
  }
  return null;
}

function parseEducationDegree(resume: HRResumeInput): string | null {
  const pd = (resume.parsedData ?? null) as Record<string, unknown> | null;
  if (!pd) return null;
  const edu = pd.education;
  if (Array.isArray(edu) && edu.length > 0) {
    // Highest-ranked degree wins.
    let best: { raw: string; rank: number } | null = null;
    for (const e of edu) {
      if (!e || typeof e !== 'object') continue;
      const degree = (e as Record<string, unknown>).degree;
      if (typeof degree !== 'string') continue;
      const rank = DEGREE_RANK[degree] ?? 0;
      if (!best || rank > best.rank) best = { raw: degree, rank };
    }
    if (best) return best.raw;
  }
  const highest = (pd as Record<string, unknown>).highestDegree;
  if (typeof highest === 'string') return highest;
  return null;
}

function parseEducationField(resume: HRResumeInput): string | null {
  const pd = (resume.parsedData ?? null) as Record<string, unknown> | null;
  if (!pd) return null;
  const edu = pd.education;
  if (Array.isArray(edu) && edu.length > 0) {
    for (const e of edu) {
      if (!e || typeof e !== 'object') continue;
      const field = (e as Record<string, unknown>).field;
      if (typeof field === 'string') return field;
    }
  }
  return null;
}

function parseTechnicalSkills(resume: HRResumeInput): string[] {
  const pd = (resume.parsedData ?? null) as Record<string, unknown> | null;
  if (!pd) return [];
  const out: string[] = [];
  const push = (v: unknown) => {
    if (typeof v === 'string') out.push(v);
  };
  if (Array.isArray(pd.skills)) {
    for (const s of pd.skills as unknown[]) {
      if (typeof s === 'string') push(s);
      else if (s && typeof s === 'object') {
        const o = s as Record<string, unknown>;
        push(o.name);
        push(o.skill);
      }
    }
  }
  if (Array.isArray(pd.technicalSkills)) {
    for (const s of pd.technicalSkills as unknown[]) push(s);
  }
  return out;
}

function parseLanguages(resume: HRResumeInput): string[] {
  const pd = (resume.parsedData ?? null) as Record<string, unknown> | null;
  if (!pd) return [];
  const out: string[] = [];
  if (Array.isArray(pd.languages)) {
    for (const l of pd.languages as unknown[]) {
      if (typeof l === 'string') out.push(l);
      else if (l && typeof l === 'object') {
        const o = l as Record<string, unknown>;
        if (typeof o.language === 'string') out.push(o.language);
        else if (typeof o.name === 'string') out.push(o.name);
      }
    }
  }
  return out;
}

// ── Evaluator ─────────────────────────────────────────────────────────────

interface Evaluation {
  passed: boolean;
  reason: string;
}

function describeRule(rule: HardRequirement): string {
  const v = typeof rule.value === 'string' ? rule.value : JSON.stringify(rule.value);
  return rule.description || `${rule.field} ${rule.operator} ${v}`;
}

function evaluateNumeric(value: number | null, op: HROperator, target: number): Evaluation {
  if (value === null) return { passed: false, reason: 'missing numeric field' };
  switch (op) {
    case 'eq':
      return { passed: value === target, reason: `${value} != ${target}` };
    case 'neq':
      return { passed: value !== target, reason: `${value} == ${target}` };
    case 'gte':
      return { passed: value >= target, reason: `${value} < ${target}` };
    case 'lte':
      return { passed: value <= target, reason: `${value} > ${target}` };
    case 'gt':
      return { passed: value > target, reason: `${value} <= ${target}` };
    case 'lt':
      return { passed: value < target, reason: `${value} >= ${target}` };
    default:
      return { passed: false, reason: `unsupported operator ${op}` };
  }
}

function evaluateString(value: string | null, op: HROperator, target: unknown): Evaluation {
  if (value === null) return { passed: false, reason: 'missing string field' };
  const lower = value.toLowerCase();
  switch (op) {
    case 'eq':
      return { passed: lower === String(target).toLowerCase(), reason: `value "${value}" != "${target}"` };
    case 'neq':
      return { passed: lower !== String(target).toLowerCase(), reason: `value matches forbidden "${target}"` };
    case 'in': {
      const arr = Array.isArray(target) ? target : [];
      const ok = arr.some((t) => typeof t === 'string' && lower === t.toLowerCase());
      return { passed: ok, reason: `"${value}" not in ${JSON.stringify(arr)}` };
    }
    case 'not_in': {
      const arr = Array.isArray(target) ? target : [];
      const ok = !arr.some((t) => typeof t === 'string' && lower === t.toLowerCase());
      return { passed: ok, reason: `"${value}" in disallowed ${JSON.stringify(arr)}` };
    }
    case 'contains':
      return {
        passed: lower.includes(String(target).toLowerCase()),
        reason: `"${value}" does not contain "${target}"`,
      };
    case 'not_contains':
      return {
        passed: !lower.includes(String(target).toLowerCase()),
        reason: `"${value}" contains disallowed "${target}"`,
      };
    case 'matches':
    case 'not_matches': {
      try {
        const re = new RegExp(String(target));
        const hit = re.test(value);
        const ok = op === 'matches' ? hit : !hit;
        return { passed: ok, reason: `"${value}" ${op} /${target}/ failed` };
      } catch {
        return { passed: false, reason: 'invalid regex' };
      }
    }
    default:
      return { passed: false, reason: `unsupported operator ${op}` };
  }
}

function evaluateArray(values: string[], op: HROperator, target: unknown): Evaluation {
  const lowered = values.map((v) => v.toLowerCase());
  const targets = Array.isArray(target) ? target.map(String) : [String(target)];
  const targetsLc = targets.map((t) => t.toLowerCase());

  switch (op) {
    case 'contains': {
      const ok = targetsLc.every((t) => lowered.some((v) => v.includes(t)));
      return { passed: ok, reason: `missing ${JSON.stringify(targets)}` };
    }
    case 'contains_any': {
      const ok = targetsLc.some((t) => lowered.some((v) => v.includes(t)));
      return { passed: ok, reason: `none of ${JSON.stringify(targets)} present` };
    }
    case 'contains_all': {
      const ok = targetsLc.every((t) => lowered.some((v) => v.includes(t)));
      return { passed: ok, reason: `missing one of ${JSON.stringify(targets)}` };
    }
    case 'not_contains': {
      const ok = !targetsLc.some((t) => lowered.some((v) => v.includes(t)));
      return { passed: ok, reason: `contains disallowed ${JSON.stringify(targets)}` };
    }
    default:
      return { passed: false, reason: `unsupported operator ${op}` };
  }
}

function evaluateDegree(value: string | null, op: HROperator, target: unknown): Evaluation {
  if (value === null) return { passed: false, reason: 'missing education.degree' };

  if (op === 'gte') {
    const targetRank = DEGREE_RANK[String(target)] ?? 0;
    const actualRank = DEGREE_RANK[value] ?? 0;
    if (targetRank === 0) return { passed: false, reason: `unknown target degree ${target}` };
    if (actualRank === 0) return { passed: false, reason: `unknown candidate degree ${value}` };
    return {
      passed: actualRank >= targetRank,
      reason: `${value} below required ${target}`,
    };
  }
  return evaluateString(value, op, target);
}

function evaluateCustom(resume: HRResumeInput, op: HROperator, target: unknown): Evaluation {
  if (!target || typeof target !== 'object') return { passed: false, reason: 'missing custom config' };
  const cfg = target as { field?: string; pattern?: string; flags?: string };
  if (!cfg.pattern) return { passed: false, reason: 'missing custom.pattern' };

  let haystack = '';
  switch (cfg.field) {
    case 'resumeText':
      haystack = resume.resumeText ?? '';
      break;
    case 'highlight':
      haystack = resume.highlight ?? '';
      break;
    case 'name':
      haystack = resume.name ?? '';
      break;
    default:
      haystack = resume.resumeText ?? '';
  }

  let re: RegExp;
  try {
    re = new RegExp(cfg.pattern, cfg.flags);
  } catch {
    return { passed: false, reason: 'invalid custom regex' };
  }
  const hit = re.test(haystack);
  const passed = op === 'matches' ? hit : !hit;
  return { passed, reason: `custom ${op} /${cfg.pattern}/ failed` };
}

function evaluateRule(resume: HRResumeInput, rule: HardRequirement): Evaluation {
  switch (rule.field) {
    case 'experienceYears': {
      const v = parseExperienceYears(resume);
      return evaluateNumeric(v, rule.operator, Number(rule.value));
    }
    case 'salaryExpectation': {
      const v = parseSalaryExpectation(resume);
      return evaluateNumeric(v, rule.operator, Number(rule.value));
    }
    case 'location': {
      const v = parseLocation(resume);
      return evaluateString(v, rule.operator, rule.value);
    }
    case 'currentRole': {
      return evaluateString(resume.currentRole ?? null, rule.operator, rule.value);
    }
    case 'education.degree': {
      return evaluateDegree(parseEducationDegree(resume), rule.operator, rule.value);
    }
    case 'education.field': {
      return evaluateString(parseEducationField(resume), rule.operator, rule.value);
    }
    case 'languages': {
      return evaluateArray(parseLanguages(resume), rule.operator, rule.value);
    }
    case 'skills.technical': {
      return evaluateArray(parseTechnicalSkills(resume), rule.operator, rule.value);
    }
    case 'tags': {
      return evaluateArray(resume.tags ?? [], rule.operator, rule.value);
    }
    case 'custom': {
      return evaluateCustom(resume, rule.operator, rule.value);
    }
    default:
      return { passed: false, reason: `unknown field ${rule.field}` };
  }
}

/**
 * Apply every enabled rule against every resume. A resume is "passed" if it
 * clears all enabled rules; otherwise it's rejected with the FIRST failing
 * rule's id + reason. (We deliberately short-circuit on the first failure
 * for cheap rejection; the design doc only surfaces per-rule counts, not
 * per-rule chain explanations.)
 *
 * TODO(phase-6.5): add a Prisma-level pre-filter that pushes the obvious
 * predicates (experienceYears gte/lte, tags hasSome, location in) into the
 * source-branch `where` clauses so large MinIO pools don't need full
 * hydration. Guard with a feature flag before flipping.
 */
export function applyHardRequirements(
  resumes: HRResumeInput[],
  rules: HardRequirement[],
): ApplyHardRequirementsResult {
  const enabled = (rules ?? []).filter((r) => r.enabled !== false);
  if (enabled.length === 0) {
    return { passed: resumes.slice(), rejected: [] };
  }

  const passed: HRResumeInput[] = [];
  const rejected: HardRequirementRejection[] = [];

  for (const resume of resumes) {
    let rejectedBy: HardRequirementRejection | null = null;
    for (const rule of enabled) {
      const ev = evaluateRule(resume, rule);
      if (!ev.passed) {
        rejectedBy = { resume, ruleId: rule.id, reason: `${describeRule(rule)} (${ev.reason})` };
        break;
      }
    }
    if (rejectedBy) rejected.push(rejectedBy);
    else passed.push(resume);
  }

  return { passed, rejected };
}

/**
 * Aggregate rejection reasons by rule for dry-run output.
 */
export function topRejectionReasons(
  rejected: HardRequirementRejection[],
  rules: HardRequirement[],
): Array<{ ruleId: string; description: string; count: number }> {
  const byRule = new Map<string, number>();
  for (const r of rejected) {
    byRule.set(r.ruleId, (byRule.get(r.ruleId) ?? 0) + 1);
  }
  const descByRule = new Map<string, string>();
  for (const r of rules) descByRule.set(r.id, describeRule(r));

  return Array.from(byRule.entries())
    .map(([ruleId, count]) => ({
      ruleId,
      description: descByRule.get(ruleId) ?? ruleId,
      count,
    }))
    .sort((a, b) => b.count - a.count);
}
