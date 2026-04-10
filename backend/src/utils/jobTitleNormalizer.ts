/**
 * Normalize GoHire job titles by stripping the _YYYYMMDDHHMMSS timestamp suffix
 * that GoHire appends to job titles.
 *
 * Example: "大数据开发工程师 (ERP)_20260319140550" → "大数据开发工程师 (ERP)"
 */
export function normalizeGoHireJobTitle(raw: string): string {
  return raw.replace(/_\d{14}$/, '').trim();
}
