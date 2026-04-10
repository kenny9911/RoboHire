export interface ParsedSalary {
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency: string;
  salaryPeriod: 'monthly' | 'yearly';
  salaryText?: string;
}

/**
 * Extract salary information from Chinese job description text.
 *
 * Handles common patterns:
 * - "月薪范围为13-17K" → min 13000, max 17000, monthly
 * - "月薪13K-17K"      → min 13000, max 17000, monthly
 * - "年薪20-30万"       → min 200000, max 300000, yearly
 * - "薪资8-12k"         → min 8000, max 12000, monthly
 * - "15K-20K"           → min 15000, max 20000, monthly
 */
export function parseSalaryFromText(text: string): ParsedSalary | null {
  if (!text) return null;

  // Pattern: 年薪 X-Y 万
  const yearlyWanMatch = text.match(/年薪[约为]*\s*(\d+(?:\.\d+)?)\s*[-–~至到]\s*(\d+(?:\.\d+)?)\s*万/);
  if (yearlyWanMatch) {
    return {
      salaryMin: Math.round(parseFloat(yearlyWanMatch[1]) * 10000),
      salaryMax: Math.round(parseFloat(yearlyWanMatch[2]) * 10000),
      salaryCurrency: 'CNY',
      salaryPeriod: 'yearly',
      salaryText: yearlyWanMatch[0],
    };
  }

  // Pattern: 月薪(范围为) X-Y K/k
  const monthlyKMatch = text.match(/月薪[范围为]*\s*(\d+(?:\.\d+)?)\s*[-–~至到]\s*(\d+(?:\.\d+)?)\s*[Kk]/);
  if (monthlyKMatch) {
    return {
      salaryMin: Math.round(parseFloat(monthlyKMatch[1]) * 1000),
      salaryMax: Math.round(parseFloat(monthlyKMatch[2]) * 1000),
      salaryCurrency: 'CNY',
      salaryPeriod: 'monthly',
      salaryText: monthlyKMatch[0],
    };
  }

  // Pattern: 薪资/薪酬 X-Y K/k
  const salaryKMatch = text.match(/(?:薪资|薪酬|工资)[约为]*\s*(\d+(?:\.\d+)?)\s*[-–~至到]\s*(\d+(?:\.\d+)?)\s*[Kk]/);
  if (salaryKMatch) {
    return {
      salaryMin: Math.round(parseFloat(salaryKMatch[1]) * 1000),
      salaryMax: Math.round(parseFloat(salaryKMatch[2]) * 1000),
      salaryCurrency: 'CNY',
      salaryPeriod: 'monthly',
      salaryText: salaryKMatch[0],
    };
  }

  // Pattern: standalone XK-YK or X-YK (e.g., "13-17K", "13K-17K")
  const standaloneKMatch = text.match(/(\d+(?:\.\d+)?)\s*[Kk]?\s*[-–~至到]\s*(\d+(?:\.\d+)?)\s*[Kk]/);
  if (standaloneKMatch) {
    return {
      salaryMin: Math.round(parseFloat(standaloneKMatch[1]) * 1000),
      salaryMax: Math.round(parseFloat(standaloneKMatch[2]) * 1000),
      salaryCurrency: 'CNY',
      salaryPeriod: 'monthly',
      salaryText: standaloneKMatch[0],
    };
  }

  // Pattern: X-Y 万/月 or X-Y 万/年
  const wanMatch = text.match(/(\d+(?:\.\d+)?)\s*[-–~至到]\s*(\d+(?:\.\d+)?)\s*万\s*[/／]\s*(月|年)/);
  if (wanMatch) {
    const period = wanMatch[3] === '年' ? 'yearly' : 'monthly';
    return {
      salaryMin: Math.round(parseFloat(wanMatch[1]) * 10000),
      salaryMax: Math.round(parseFloat(wanMatch[2]) * 10000),
      salaryCurrency: 'CNY',
      salaryPeriod: period,
      salaryText: wanMatch[0],
    };
  }

  return null;
}
