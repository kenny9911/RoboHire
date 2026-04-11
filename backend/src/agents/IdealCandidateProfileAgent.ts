/**
 * IdealCandidateProfileAgent — synthesizes a structured Ideal Candidate
 * Profile (ICP) from a recruiter's like/dislike history + the job context.
 *
 * The system prompt and user-message layout are copied verbatim from
 * docs/icp-architecture.md §4.2 and §4.3. Keep them in sync with the doc;
 * the matcher assumes the exact JSON shape described here.
 */

import { BaseAgent } from './BaseAgent.js';
import type {
  IdealProfileInput,
  IdealProfileOutput,
  IdealCandidateProfile,
  HardRequirement,
  CoreSkill,
  ExemplarCandidate,
} from '../types/icp.js';

export class IdealCandidateProfileAgent extends BaseAgent<IdealProfileInput, IdealProfileOutput> {
  constructor() {
    super('IdealCandidateProfileAgent');
  }

  protected getTemperature(): number {
    // Synthesis needs a little creativity, but mostly grounded.
    return 0.4;
  }

  protected getAgentPrompt(): string {
    return `You are a senior technical recruiter and talent strategist analyzing a hiring manager's
preferences. You have been given:

  1. The job: title, description, and any recruiter instructions.
  2. The current evaluation criteria the recruiter has set up.
  3. The current Ideal Candidate Profile (ICP), if one already exists.
  4. The current hard requirements (硬性条件) the recruiter has declared. Treat these
     as facts, not as something to revise — your job is only to SUGGEST new ones.
  5. A list of candidates the recruiter LIKED.
  6. A list of candidates the recruiter DISLIKED.

Your job is to find the *patterns* in the recruiter's choices that go beyond the JD's
explicit requirements. The JD describes what the role formally needs; the like/dislike
history reveals what the recruiter actually wants but hasn't written down. You must
extract that hidden preference signal and encode it as a structured profile that the
matcher can use on every future run.

## How to think

For each pattern you propose, you MUST be able to point to evidence in the data. Do
not invent traits the data does not support. If only one liked candidate has a given
skill, that is NOT a pattern — call it out as a single observation, not a core skill.

Use the following analysis framework:

  Step 1 — Common thread in LIKES
    What do the liked candidates share that the disliked candidates lack? Look at:
    - Specific technical skills (Go, Kubernetes, etc.)
    - Years and shape of experience (full-time only? lots of internship? gaps?)
    - Education tier (985/211, overseas, specific schools)
    - Industry background (fintech, gaming, etc.)
    - Role progression (IC → lead, founder, switched companies frequently)
    - Soft signals from the headline / notable line (ships fast, owns on-call,
      cross-functional, etc.)

  Step 2 — Common thread in DISLIKES
    What do the disliked candidates share that liked candidates lack? These become
    ANTI-SIGNALS — explicit red flags that the matcher should penalize.

  Step 3 — Differential analysis
    For each candidate trait, ask: "Is this trait actually predictive, or is it just
    correlated by chance?" If the sample size is small (<3 candidates), down-weight
    your confidence. The user values you being honest about uncertainty more than
    confidently producing a wrong profile.

  Step 4 — Synthesis
    Build the structured ICP. Every coreSkill, bonusSkill, antiSkill, signal, and
    yearsOfExperience field must trace back to evidence in the data.

  Step 5 — Hard requirement suggestions
    Propose new hard requirements ONLY if a pattern is EXTREME — meaning ALL liked
    candidates have a trait AND no disliked candidate has it, OR vice versa. Examples:
      - "All 5 liked candidates are based in Beijing → suggest location = Beijing"
      - "All 4 liked candidates have a Master's degree → suggest education.degree
        gte Master"
      - "All 6 disliked candidates have <3 years experience → suggest
        experienceYears gte 3"
    If a pattern is merely strong but not absolute, encode it in the profile signals
    instead of as a hard requirement. Hard requirements are gatekeepers — proposing
    a borderline one will silently exclude good candidates and the recruiter will
    blame the agent.
    NEVER suggest a hard requirement on a protected attribute (age, gender, race,
    religion, nationality, marital status, pregnancy). These are illegal filters.

  Step 6 — Confidence
    Compute self-reported confidence in [0, 1]:
      - 0.0–0.3: less than 3 likes OR less than 3 dislikes; patterns are speculative
      - 0.3–0.6: 3–5 examples per side, signal is moderate
      - 0.6–0.85: ≥6 examples per side with consistent signal
      - 0.85–1.0: large sample (≥10/side) with extremely consistent signal
    Be conservative. The product surfaces this number to the user, and a high number
    you cannot back up will erode trust.

  Step 7 — Narrative summary
    1–2 sentences in the recruiter's language. Plain, direct, no marketing. Example:
    "你偏好北京 985 背景的中级 Go 工程师，重视分布式系统经验和团队 ownership；
     避开转行型候选人和经验不足 3 年的应聘者。"

## Cold start handling

If there are ZERO likes AND ZERO dislikes, you MUST STILL produce a profile using
only the job description + criteria + instructions as evidence. In this JD-only
mode:
  - Derive coreSkills, yearsOfExperience, and preferredIndustries from the JD.
  - Leave antiSkills, anchorCandidateIds, and antiAnchorCandidateIds empty arrays.
  - Set confidence between 0.10 and 0.25 to reflect the cold start.
  - Do NOT propose any suggestedHardRequirements (you have no like/dislike
    evidence to justify them).

## Output format

Return ONLY a single JSON object inside a \`\`\`json code fence. No prose before or
after the fence. The shape:

\`\`\`json
{
  "profile": {
    "seniorityRange": { "min": 3, "ideal": 5, "max": 8, "unit": "years" },
    "preferredLocations": ["Beijing"],
    "preferredIndustries": ["ad tech", "short video"],
    "coreSkills": [
      { "skill": "Go", "importance": "critical", "rationale": "5/5 liked candidates" },
      { "skill": "Distributed systems", "importance": "high", "rationale": "4/5 likes mention it" }
    ],
    "bonusSkills": ["Kafka", "Kubernetes"],
    "antiSkills": ["React Native"],
    "preferredCompanySizes": ["enterprise"],
    "preferredRoleProgression": "IC → tech lead at large internet company",
    "yearsOfExperience": { "min": 3, "ideal": 5, "max": 8 },
    "signals": [
      { "trait": "owns on-call rotations", "weight": 0.8, "source": "liked",
        "evidence": "Wang Tao notable line" },
      { "trait": "frequent job-hopping", "weight": 0.7, "source": "disliked",
        "evidence": "3 of 4 dislikes had >3 employers in 5 years" }
    ],
    "anchorCandidateIds": ["<liked candidate ids>"],
    "antiAnchorCandidateIds": ["<disliked candidate ids>"],
    "generatedAt": "<ISO timestamp>"
  },
  "suggestedHardRequirements": [
    {
      "id": "<uuid>",
      "field": "experienceYears",
      "operator": "gte",
      "value": 3,
      "description": "至少 3 年全职经验 (建议: 全部 6 位被拒候选人都低于 3 年)",
      "enabled": false,
      "source": "icp_suggestion"
    }
  ],
  "narrativeSummary": "<1-2 sentence digest in recruiter's language>",
  "confidence": 0.72,
  "reasoningTrace": "<chain of thought, 200-500 tokens>"
}
\`\`\`

## Constraints

- NEVER invent traits the data does not support.
- NEVER output more than 8 coreSkills.
- NEVER output more than 5 antiSkills.
- NEVER suggest more than 3 hardRequirements per regen.
- NEVER propose hard requirements on protected attributes (age, gender, race,
  religion, nationality, marital status, pregnancy).
- ALWAYS preserve the existing currentHardRequirements verbatim — they are not in
  scope for you to modify. Your suggestedHardRequirements MUST NOT duplicate any
  rule already enforced.
- ALWAYS write narrativeSummary in the same language as the JD.
- ALWAYS produce a coreSkills array with at least one entry.
- Every numeric weight in signals MUST be between 0 and 1 inclusive.
- confidence MUST be a number between 0 and 1 inclusive.`;
  }

  protected formatInput(input: IdealProfileInput): string {
    const lines: string[] = [];

    lines.push('## Job');
    lines.push(`Title: ${input.jobTitle || '(untitled)'}`);
    lines.push('Description:');
    lines.push(input.jobDescription || '(no description)');
    lines.push('');

    lines.push('## Recruiter instructions');
    lines.push(input.agentInstructions?.trim() || '(none)');
    lines.push('');

    lines.push('## Current evaluation criteria');
    if (input.currentCriteria.length === 0) {
      lines.push('(none)');
    } else {
      input.currentCriteria.forEach((c, i) => {
        const tag = c.pinned
          ? 'PINNED, MOST IMPORTANT'
          : c.bucket === 'most'
            ? 'MOST IMPORTANT'
            : 'LEAST IMPORTANT';
        lines.push(`${i + 1}. [${tag}] ${c.text}`);
      });
    }
    lines.push('');

    lines.push('## Current ICP');
    if (input.currentICP) {
      lines.push('```json');
      lines.push(JSON.stringify(input.currentICP, null, 2));
      lines.push('```');
    } else {
      lines.push('(none — first generation)');
    }
    lines.push('');

    lines.push('## Current hard requirements (DO NOT MODIFY)');
    if (input.currentHardRequirements.length === 0) {
      lines.push('(none)');
    } else {
      for (const r of input.currentHardRequirements) {
        const state = r.enabled ? 'enabled' : 'disabled';
        lines.push(
          `- ${r.field} ${r.operator} ${JSON.stringify(r.value)} (${state}) — ${r.description}`,
        );
      }
    }
    lines.push('');

    lines.push(`## LIKED candidates (count: ${input.likedCandidates.length})`);
    if (input.likedCandidates.length === 0) {
      lines.push('(none yet)');
    } else {
      input.likedCandidates.forEach((c, i) => {
        lines.push('');
        lines.push(`### Like #${i + 1} — ${c.name}`);
        lines.push(c.resumeDigest);
        if (c.reason) lines.push(`RECRUITER REASON: ${c.reason}`);
        lines.push(`AGENT_CANDIDATE_ID: ${c.id}`);
      });
    }
    lines.push('');

    lines.push(`## DISLIKED candidates (count: ${input.dislikedCandidates.length})`);
    if (input.dislikedCandidates.length === 0) {
      lines.push('(none yet)');
    } else {
      input.dislikedCandidates.forEach((c, i) => {
        lines.push('');
        lines.push(`### Dislike #${i + 1} — ${c.name}`);
        lines.push(c.resumeDigest);
        if (c.reason) lines.push(`RECRUITER REASON: ${c.reason}`);
        lines.push(`AGENT_CANDIDATE_ID: ${c.id}`);
      });
    }
    lines.push('');

    lines.push('---');
    lines.push('');
    lines.push(
      'Now produce the new ICP. Cite specific candidate names in your reasoningTrace',
    );
    lines.push('when explaining why you proposed each pattern.');

    return lines.join('\n');
  }

  protected parseOutput(response: string): IdealProfileOutput {
    const jsonMatch =
      response.match(/```json\s*([\s\S]*?)\s*```/) ||
      response.match(/```\s*([\s\S]*?)\s*```/) ||
      response.match(/(\{[\s\S]*\})/);

    let raw: unknown = null;
    if (jsonMatch && jsonMatch[1]) {
      try {
        raw = JSON.parse(jsonMatch[1].trim());
      } catch {
        // fall through
      }
    }
    if (raw === null) {
      try {
        raw = JSON.parse(response);
      } catch {
        throw new Error('IdealCandidateProfileAgent: LLM did not return parseable JSON');
      }
    }

    if (!raw || typeof raw !== 'object') {
      throw new Error('IdealCandidateProfileAgent: parsed response is not an object');
    }

    const validated = validateIdealProfileOutput(raw);
    return validated;
  }

  /**
   * Convenience entry point used by IdealProfileService. Mirrors the
   * `.match()` / `.parse()` helpers on the other BaseAgent subclasses.
   */
  async generate(input: IdealProfileInput, requestId?: string): Promise<IdealProfileOutput> {
    return this.executeWithJsonResponse(input, input.jobDescription, requestId);
  }
}

// ── Validation ─────────────────────────────────────────────────────────────

function validateIdealProfileOutput(raw: unknown): IdealProfileOutput {
  const r = raw as Record<string, unknown>;

  // If the model emits the documented insufficient-data sentinel, treat as failure.
  if (typeof r.error === 'string' && r.error === 'insufficient_data') {
    throw new Error('IdealCandidateProfileAgent: LLM reported insufficient_data');
  }

  const profile = r.profile as Record<string, unknown> | undefined;
  if (!profile || typeof profile !== 'object') {
    throw new Error('IdealCandidateProfileAgent: missing profile object');
  }

  if (!Array.isArray(profile.coreSkills)) {
    throw new Error('IdealCandidateProfileAgent: profile.coreSkills must be an array');
  }
  const coreSkills: CoreSkill[] = (profile.coreSkills as unknown[])
    .map((s) => {
      if (!s || typeof s !== 'object') return null;
      const obj = s as Record<string, unknown>;
      const skill = typeof obj.skill === 'string' ? obj.skill : null;
      const importance = obj.importance as CoreSkill['importance'] | undefined;
      if (!skill || !importance) return null;
      if (importance !== 'critical' && importance !== 'high' && importance !== 'medium') return null;
      return {
        skill,
        importance,
        rationale: typeof obj.rationale === 'string' ? obj.rationale : '',
      };
    })
    .filter((s): s is CoreSkill => s !== null);

  if (coreSkills.length === 0) {
    throw new Error('IdealCandidateProfileAgent: profile.coreSkills must have at least 1 valid entry');
  }

  const yoe = profile.yearsOfExperience as Record<string, unknown> | undefined;
  if (!yoe || typeof yoe !== 'object') {
    throw new Error('IdealCandidateProfileAgent: profile.yearsOfExperience is required');
  }
  const min = typeof yoe.min === 'number' ? yoe.min : 0;
  const ideal = typeof yoe.ideal === 'number' ? yoe.ideal : min;
  const max = typeof yoe.max === 'number' ? yoe.max : undefined;

  const narrativeSummary = typeof r.narrativeSummary === 'string' ? r.narrativeSummary.trim() : '';
  if (!narrativeSummary) {
    throw new Error('IdealCandidateProfileAgent: narrativeSummary must be a non-empty string');
  }

  const rawConfidence = typeof r.confidence === 'number' ? r.confidence : NaN;
  if (!Number.isFinite(rawConfidence) || rawConfidence < 0 || rawConfidence > 1) {
    throw new Error('IdealCandidateProfileAgent: confidence must be a number in [0, 1]');
  }

  const signals = Array.isArray(profile.signals)
    ? (profile.signals as unknown[])
        .map((s) => {
          if (!s || typeof s !== 'object') return null;
          const obj = s as Record<string, unknown>;
          const trait = typeof obj.trait === 'string' ? obj.trait : null;
          const weightN = typeof obj.weight === 'number' ? obj.weight : NaN;
          const source = obj.source as 'liked' | 'disliked' | 'jd' | undefined;
          if (!trait || !Number.isFinite(weightN)) return null;
          if (source !== 'liked' && source !== 'disliked' && source !== 'jd') return null;
          const weight = Math.max(0, Math.min(1, weightN));
          return {
            trait,
            weight,
            source,
            evidence: typeof obj.evidence === 'string' ? obj.evidence : undefined,
          };
        })
        .filter((s): s is NonNullable<typeof s> => s !== null)
    : [];

  const asStringArray = (v: unknown): string[] =>
    Array.isArray(v) ? (v.filter((x) => typeof x === 'string') as string[]) : [];

  const companySizes = Array.isArray(profile.preferredCompanySizes)
    ? (profile.preferredCompanySizes as unknown[]).filter(
        (x): x is 'startup' | 'midsize' | 'enterprise' =>
          x === 'startup' || x === 'midsize' || x === 'enterprise',
      )
    : undefined;

  const seniority = profile.seniorityRange as Record<string, unknown> | undefined;
  const seniorityRange =
    seniority && typeof seniority === 'object' && typeof seniority.min === 'number'
      ? {
          min: seniority.min,
          ideal: typeof seniority.ideal === 'number' ? seniority.ideal : seniority.min,
          max: typeof seniority.max === 'number' ? seniority.max : undefined,
          unit: 'years' as const,
        }
      : undefined;

  const validatedProfile: IdealCandidateProfile = {
    seniorityRange,
    preferredLocations: Array.isArray(profile.preferredLocations)
      ? asStringArray(profile.preferredLocations)
      : undefined,
    preferredIndustries: Array.isArray(profile.preferredIndustries)
      ? asStringArray(profile.preferredIndustries)
      : undefined,
    coreSkills: coreSkills.slice(0, 8),
    bonusSkills: asStringArray(profile.bonusSkills),
    antiSkills: asStringArray(profile.antiSkills).slice(0, 5),
    preferredCompanySizes: companySizes,
    preferredRoleProgression:
      typeof profile.preferredRoleProgression === 'string' ? profile.preferredRoleProgression : undefined,
    yearsOfExperience: { min, ideal, max },
    signals,
    anchorCandidateIds: asStringArray(profile.anchorCandidateIds),
    antiAnchorCandidateIds: asStringArray(profile.antiAnchorCandidateIds),
    generatedAt:
      typeof profile.generatedAt === 'string' ? profile.generatedAt : new Date().toISOString(),
  };

  const suggestedHardRequirements = Array.isArray(r.suggestedHardRequirements)
    ? (r.suggestedHardRequirements as unknown[])
        .map((x): HardRequirement | null => {
          if (!x || typeof x !== 'object') return null;
          const o = x as Record<string, unknown>;
          const field = o.field as HardRequirement['field'] | undefined;
          const operator = o.operator as HardRequirement['operator'] | undefined;
          if (typeof o.id !== 'string' || !field || !operator) return null;
          return {
            id: o.id,
            field,
            operator,
            value: o.value,
            description: typeof o.description === 'string' ? o.description : '',
            enabled: false, // suggestions are never auto-active
            source: 'icp_suggestion',
            sourceIcpVersion: typeof o.sourceIcpVersion === 'number' ? o.sourceIcpVersion : undefined,
          };
        })
        .filter((x): x is HardRequirement => x !== null)
        .slice(0, 3)
    : [];

  const reasoningTrace = typeof r.reasoningTrace === 'string' ? r.reasoningTrace : '';

  return {
    profile: validatedProfile,
    suggestedHardRequirements,
    narrativeSummary,
    confidence: rawConfidence,
    reasoningTrace,
  };
}

// ── Resume digest builder — used by IdealProfileService ────────────────────
//
// Exported so the service can compose ExemplarCandidate objects without
// re-implementing the format. See architecture spec §4.1.

export function buildResumeDigest(args: {
  name: string;
  headline: string | null;
  parsedData: unknown;
}): string {
  const parsed = (args.parsedData ?? {}) as Record<string, unknown>;
  const lines: string[] = [];
  lines.push(`NAME: ${args.name || 'Unknown'}`);
  if (args.headline) lines.push(`HEADLINE: ${args.headline}`);

  const location =
    typeof parsed.location === 'string'
      ? parsed.location
      : typeof (parsed.contact as Record<string, unknown> | undefined)?.location === 'string'
        ? ((parsed.contact as Record<string, unknown>).location as string)
        : null;
  if (location) lines.push(`LOCATION: ${location}`);

  const education = parsed.education;
  if (Array.isArray(education) && education.length > 0) {
    const top = education[0] as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof top.degree === 'string') parts.push(top.degree);
    if (typeof top.field === 'string') parts.push(top.field);
    if (typeof top.school === 'string') parts.push(top.school);
    if (parts.length > 0) lines.push(`EDUCATION: ${parts.join(' ')}`);
  }

  const skills = parsed.skills;
  if (Array.isArray(skills) && skills.length > 0) {
    const flat = skills
      .map((s) => {
        if (typeof s === 'string') return s;
        if (s && typeof s === 'object') {
          const o = s as Record<string, unknown>;
          return typeof o.name === 'string' ? o.name : typeof o.skill === 'string' ? o.skill : null;
        }
        return null;
      })
      .filter((s): s is string => !!s)
      .slice(0, 12);
    if (flat.length > 0) lines.push(`SKILLS: ${flat.join(', ')}`);
  } else if (parsed.technicalSkills && Array.isArray(parsed.technicalSkills)) {
    const flat = (parsed.technicalSkills as unknown[])
      .filter((s): s is string => typeof s === 'string')
      .slice(0, 12);
    if (flat.length > 0) lines.push(`SKILLS: ${flat.join(', ')}`);
  }

  const industries = parsed.industries;
  if (Array.isArray(industries) && industries.length > 0) {
    const flat = industries
      .filter((s): s is string => typeof s === 'string')
      .slice(0, 6);
    if (flat.length > 0) lines.push(`INDUSTRIES: ${flat.join(', ')}`);
  }

  const languages = parsed.languages;
  if (Array.isArray(languages) && languages.length > 0) {
    const flat = languages
      .map((l) => {
        if (typeof l === 'string') return l;
        if (l && typeof l === 'object') {
          const o = l as Record<string, unknown>;
          return typeof o.language === 'string' ? o.language : typeof o.name === 'string' ? o.name : null;
        }
        return null;
      })
      .filter((s): s is string => !!s)
      .slice(0, 6);
    if (flat.length > 0) lines.push(`LANGUAGES: ${flat.join(', ')}`);
  }

  const achievements = parsed.keyAchievements;
  if (Array.isArray(achievements) && achievements.length > 0) {
    const first = achievements.find((a): a is string => typeof a === 'string');
    if (first) lines.push(`NOTABLE: ${first}`);
  }

  return lines.join('\n');
}

// ── Typed helper for the exported singleton ───────────────────────────────

export const idealCandidateProfileAgent = new IdealCandidateProfileAgent();

// Re-export for convenience so service code can import both symbols
// from one place.
export type { ExemplarCandidate };
