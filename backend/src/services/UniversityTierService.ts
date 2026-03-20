import { CHINESE_UNIVERSITIES, ChineseUniversity } from '../data/chineseUniversityTiers.js';

export interface UniversityTierResult {
  found: boolean;
  /** Canonical Chinese name if found */
  name: string;
  /** Tier memberships, e.g. ['985', '211', '双一流'] */
  tiers: string[];
  /** Highest tier: '985' > '211' > '双一流' > 'none' */
  highestTier: string;
  /** Annotation string for injection, e.g. "[985/211/双一流]" */
  annotation: string;
}

interface Education {
  institution?: string;
  degree?: string;
  field?: string;
  [key: string]: unknown;
}

const TIER_RANK: Record<string, number> = { '985': 3, '211': 2, '双一流': 1 };

/**
 * Service for looking up Chinese university tier classifications (985/211/双一流).
 * Builds a normalized index at construction time for fast lookups.
 */
class UniversityTierServiceImpl {
  /** Normalized alias → university record */
  private nameMap = new Map<string, ChineseUniversity>();

  constructor() {
    for (const uni of CHINESE_UNIVERSITIES) {
      for (const alias of uni.aliases) {
        this.nameMap.set(this.normalize(alias), uni);
      }
      // Also index the canonical name
      this.nameMap.set(this.normalize(uni.name), uni);
    }
  }

  private normalize(s: string): string {
    return s.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  /**
   * Look up a university by institution name.
   * Tries exact match first, then substring match against aliases.
   */
  lookup(institutionName: string): UniversityTierResult {
    if (!institutionName || !institutionName.trim()) {
      return { found: false, name: institutionName, tiers: [], highestTier: 'none', annotation: '' };
    }

    const normalized = this.normalize(institutionName);

    // 1. Exact match
    const exact = this.nameMap.get(normalized);
    if (exact) {
      return this.buildResult(exact);
    }

    // 2. Check if input contains a known alias as substring
    for (const [alias, uni] of this.nameMap) {
      if (alias.length >= 2 && normalized.includes(alias)) {
        return this.buildResult(uni);
      }
    }

    // 3. Check if any alias is contained within the input (handles "I studied at 清华大学计算机系")
    for (const uni of CHINESE_UNIVERSITIES) {
      for (const alias of uni.aliases) {
        const normalizedAlias = this.normalize(alias);
        if (normalizedAlias.length >= 2 && normalized.includes(normalizedAlias)) {
          return this.buildResult(uni);
        }
      }
    }

    return { found: false, name: institutionName, tiers: [], highestTier: 'none', annotation: '' };
  }

  private buildResult(uni: ChineseUniversity): UniversityTierResult {
    const sorted = [...uni.tiers].sort((a, b) => (TIER_RANK[b] || 0) - (TIER_RANK[a] || 0));
    return {
      found: true,
      name: uni.name,
      tiers: sorted,
      highestTier: sorted[0] || 'none',
      annotation: `[${sorted.join('/')}]`,
    };
  }

  /**
   * Detect whether an institution name looks like an international (non-Chinese) university.
   * Heuristic: if the name contains no CJK characters, it is likely international.
   */
  private isLikelyInternational(name: string): boolean {
    // CJK Unified Ideographs range
    return !/[\u4e00-\u9fff\u3400-\u4dbf]/.test(name);
  }

  /**
   * Annotate a resume text with system-verified university tier information.
   * Appends a structured section at the end of the resume.
   *
   * @param resumeText The raw resume text
   * @param parsedEducation Optional structured education array from parsed resume data
   */
  annotateResumeEducation(resumeText: string, parsedEducation?: Education[]): string {
    if (!resumeText) return resumeText;

    const annotations: string[] = [];

    if (parsedEducation && parsedEducation.length > 0) {
      // Mode 1: Use structured data — most reliable
      for (const edu of parsedEducation) {
        const inst = edu.institution?.trim();
        if (!inst) continue;

        const result = this.lookup(inst);
        if (result.found) {
          annotations.push(`- ${result.name}: ${result.annotation}`);
        } else if (this.isLikelyInternational(inst)) {
          annotations.push(`- ${inst}: [海外/International]`);
        } else {
          annotations.push(`- ${inst}: [Not in 985/211/双一流 lists]`);
        }
      }
    } else {
      // Mode 2: Scan resume text for known university names
      const found = new Set<string>();
      for (const uni of CHINESE_UNIVERSITIES) {
        for (const alias of uni.aliases) {
          if (alias.length >= 2 && resumeText.includes(alias) && !found.has(uni.name)) {
            found.add(uni.name);
            const result = this.buildResult(uni);
            annotations.push(`- ${uni.name}: ${result.annotation}`);
            break;
          }
        }
      }
    }

    if (annotations.length === 0) return resumeText;

    return `${resumeText}\n\n## Education Tier Classification (System-Verified)\n${annotations.join('\n')}`;
  }
}

export const universityTierService = new UniversityTierServiceImpl();
