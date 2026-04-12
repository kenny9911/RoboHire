/**
 * InstantSearchMatchService
 *
 * Orchestrates parallel resume matching for Agent Alex.
 * Takes a Live Specification (HiringRequirements) and runs concurrent
 * ResumeMatchAgent instances against the talent pool, streaming results
 * back through chat events.
 */

import prisma from '../lib/prisma.js';
import { logger } from './LoggerService.js';
import { taskGenerator } from './TaskGeneratorService.js';
import type { HiringRequirements, ChatStreamEvent, SearchCandidate } from '../types/agentAlex.js';

// ── Types ──

interface SearchConfig {
  userId: string;
  requirements: HiringRequirements;
  sessionId?: string;
  jobId?: string;
  threshold?: number;      // Minimum score to include (default: 50)
  concurrency?: number;    // Parallel LLM calls (default: 5)
  maxResumes?: number;     // Max resumes to match (default: 200)
  requestId?: string;
}

interface SearchResult {
  agentId: string;
  searchId: string;
  totalResumes: number;
  filteredCount: number;
  matchedCount: number;
  candidates: SearchCandidate[];
  durationMs: number;
  error?: string;
}

interface MatchTaskResult {
  resumeId: string;
  resumeName: string;
  score: number;
  grade: string;
  verdict: string;
  highlights: string[];
  gaps: string[];
  error?: string;
}

// ── Service ──

const DEFAULT_CONCURRENCY = parseInt(process.env.MATCH_CONCURRENCY || '5', 10);
const DEFAULT_THRESHOLD = parseInt(process.env.MATCH_THRESHOLD || '50', 10);
const DEFAULT_MAX_RESUMES = parseInt(process.env.MATCH_MAX_RESUMES || '200', 10);

export async function executeInstantSearch(
  config: SearchConfig,
  onEvent: (event: ChatStreamEvent) => void,
): Promise<SearchResult> {
  const startTime = Date.now();
  const searchId = generateId();
  const {
    userId,
    requirements,
    sessionId,
    jobId,
    threshold = DEFAULT_THRESHOLD,
    concurrency = DEFAULT_CONCURRENCY,
    maxResumes = DEFAULT_MAX_RESUMES,
    requestId = searchId,
  } = config;

  logger.info('INSTANT_SEARCH', 'Starting instant search match', {
    requestId, searchId, userId,
    jobTitle: requirements.jobTitle,
    threshold, concurrency, maxResumes,
  });

  try {
    // ── Step 1: Create Agent record ──
    const agentName = `${requirements.jobTitle || 'Search'} — ${new Date().toLocaleString('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`;

    const agent = await prisma.agent.create({
      data: {
        userId,
        name: agentName,
        description: buildSearchDescription(requirements),
        taskType: 'instantSearchMatch',
        status: 'active',
        jobId: jobId || null,
        config: JSON.parse(JSON.stringify({
          searchCriteria: requirements,
          threshold,
          concurrency,
          sessionId,
        })),
      },
    });

    // ── Step 2: Query talent pool ──
    const resumes = await prisma.resume.findMany({
      where: {
        userId,
        status: 'active',
        resumeText: { not: '' },
      },
      select: {
        id: true,
        name: true,
        resumeText: true,
        currentRole: true,
        experienceYears: true,
        tags: true,
        email: true,
      },
      orderBy: { createdAt: 'desc' },
      take: maxResumes,
    });

    if (resumes.length === 0) {
      await prisma.agent.update({ where: { id: agent.id }, data: { status: 'completed' } });
      return {
        agentId: agent.id, searchId, totalResumes: 0, filteredCount: 0,
        matchedCount: 0, candidates: [], durationMs: Date.now() - startTime,
      };
    }

    // ── Step 3: Pre-filter (keyword, no LLM cost) ──
    const { passed, excluded } = preFilterResumes(resumes, requirements);

    // Check for already-matched resumes (dedup)
    const existingCandidates = await prisma.agentCandidate.findMany({
      where: { agentId: agent.id },
      select: { resumeId: true },
    });
    const alreadyMatched = new Set(existingCandidates.map(c => c.resumeId));
    const toMatch = passed.filter(r => !alreadyMatched.has(r.id));

    onEvent({
      type: 'search-started',
      data: {
        searchId,
        agentId: agent.id,
        totalResumes: resumes.length,
        filteredCount: toMatch.length,
      },
    });

    logger.info('INSTANT_SEARCH', 'Pre-filter complete', {
      requestId, searchId,
      total: resumes.length,
      passed: passed.length,
      excluded: excluded.length,
      deduped: passed.length - toMatch.length,
      toMatch: toMatch.length,
    });

    // ── Step 4: Build JD text from requirements ──
    const jdText = buildJDFromRequirements(requirements);

    // ── Step 5: Parallel matching ──
    // Uses LLMService (multi-provider: OpenAI, OpenRouter, Google, Kimi)
    // Model override: LLM_MATCH_RESUME env var, or falls back to default LLM_MODEL
    const matchModel = process.env.LLM_MATCH_RESUME || undefined;
    const { ResumeMatchAgent } = await import('../agents/ResumeMatchAgent.js');
    const matchAgent = new ResumeMatchAgent();
    const allResults: MatchTaskResult[] = [];
    let completed = 0;

    for (let i = 0; i < toMatch.length; i += concurrency) {
      const batch = toMatch.slice(i, i + concurrency);

      const batchResults = await Promise.allSettled(
        batch.map(async (resume): Promise<MatchTaskResult> => {
          try {
            const matchResult = await matchAgent.execute(
              {
                resume: resume.resumeText,
                jd: jdText,
                candidatePreferences: undefined,
              },
              jdText,
              requestId,
              undefined,  // locale — auto-detect from JD
              matchModel,  // LLM_MATCH_RESUME or default
            );

            const score = matchResult?.overallMatchScore?.score ?? 0;
            const grade = matchResult?.overallMatchScore?.grade ?? 'F';
            const verdict = matchResult?.overallFit?.verdict ?? 'Unknown';

            // Extract highlights and gaps
            const highlights: string[] = [];
            const gaps: string[] = [];

            if (matchResult?.skillMatch?.matchedMustHave) {
              highlights.push(...matchResult.skillMatch.matchedMustHave
                .slice(0, 3)
                .map((s: any) => typeof s === 'string' ? s : s.skill || s.name || String(s)));
            }
            if (matchResult?.candidatePotential?.uniqueValueProps) {
              highlights.push(...matchResult.candidatePotential.uniqueValueProps.slice(0, 2));
            }
            if (matchResult?.hardRequirementGaps) {
              gaps.push(...matchResult.hardRequirementGaps
                .slice(0, 3)
                .map((g: any) => typeof g === 'string' ? g : g.gap || g.requirement || String(g)));
            }

            return {
              resumeId: resume.id,
              resumeName: resume.name || 'Unknown',
              score,
              grade,
              verdict,
              highlights: highlights.slice(0, 5),
              gaps: gaps.slice(0, 3),
            };
          } catch (err) {
            logger.error('INSTANT_SEARCH', 'Match failed for resume', {
              requestId, resumeId: resume.id,
              error: err instanceof Error ? err.message : String(err),
            });
            return {
              resumeId: resume.id,
              resumeName: resume.name || 'Unknown',
              score: 0, grade: 'F', verdict: 'Error',
              highlights: [], gaps: [],
              error: err instanceof Error ? err.message : 'Match failed',
            };
          }
        }),
      );

      // Process batch results
      for (const settled of batchResults) {
        completed++;
        const result = settled.status === 'fulfilled' ? settled.value : {
          resumeId: 'unknown', resumeName: 'Unknown', score: 0, grade: 'F',
          verdict: 'Error', highlights: [], gaps: [], error: String((settled as any).reason),
        };

        allResults.push(result);

        // Stream progress every completion
        onEvent({
          type: 'search-progress',
          data: { searchId, completed, total: toMatch.length },
        });

        // Stream individual result if above threshold
        if (result.score >= threshold && !result.error) {
          onEvent({
            type: 'search-result',
            data: {
              searchId,
              candidate: {
                name: result.resumeName,
                score: result.score,
                grade: result.grade,
                resumeId: result.resumeId,
                verdict: result.verdict,
                highlights: result.highlights,
                gaps: result.gaps,
              },
            },
          });
        }
      }
    }

    // ── Step 6: Save candidates to DB ──
    const qualifiedResults = allResults
      .filter(r => r.score >= threshold && !r.error)
      .sort((a, b) => b.score - a.score);

    if (qualifiedResults.length > 0) {
      await prisma.agentCandidate.createMany({
        data: qualifiedResults.map(r => ({
          agentId: agent.id,
          resumeId: r.resumeId,
          name: r.resumeName,
          matchScore: r.score,
          status: 'pending',
          metadata: {
            grade: r.grade,
            verdict: r.verdict,
            highlights: r.highlights,
            gaps: r.gaps,
            whyMatched: {
              reasons: [
                ...r.highlights.map((h) => ({ type: 'good' as const, title: h, detail: '' })),
                ...r.gaps.map((g) => ({ type: 'concern' as const, title: g, detail: 'Verify in interview.' })),
              ],
              strengths: r.highlights,
              areasToExplore: r.gaps,
              skillMap: { matched: r.highlights, missing: r.gaps, extra: [] },
              overallVerdict: r.verdict,
              grade: r.grade,
            },
          } as unknown as object,
        })),
        skipDuplicates: true,
      });

      // Task generation: review agent-sourced candidates
      for (const r of qualifiedResults.slice(0, 5)) { // limit to top 5 tasks per run
        void taskGenerator.onAgentCandidateFound(
          { id: '', agentId: agent.id, name: r.resumeName, matchScore: r.score },
          agent.userId, agent.name,
        );
      }
    }

    // Update agent stats
    await prisma.agent.update({
      where: { id: agent.id },
      data: {
        status: 'completed',
        totalSourced: toMatch.length,
        totalApproved: qualifiedResults.length,
        lastRunAt: new Date(),
        config: {
          ...(agent.config as any || {}),
          preFilterStats: {
            total: resumes.length,
            passed: passed.length,
            excluded: excluded.length,
          },
          resultsSummary: {
            totalMatched: qualifiedResults.length,
            avgScore: qualifiedResults.length > 0
              ? Math.round(qualifiedResults.reduce((s, r) => s + r.score, 0) / qualifiedResults.length)
              : 0,
            topGrade: qualifiedResults[0]?.grade || '-',
          },
        },
      },
    });

    // ── Step 7: Stream completion ──
    const topCandidates: SearchCandidate[] = qualifiedResults.slice(0, 10).map(r => ({
      name: r.resumeName,
      score: r.score,
      grade: r.grade,
      resumeId: r.resumeId,
      verdict: r.verdict,
      highlights: r.highlights,
      gaps: r.gaps,
    }));

    onEvent({
      type: 'search-completed',
      data: {
        searchId,
        agentId: agent.id,
        totalMatched: qualifiedResults.length,
        totalScreened: toMatch.length,
        topCandidates,
      },
    });

    const durationMs = Date.now() - startTime;
    logger.info('INSTANT_SEARCH', 'Search completed', {
      requestId, searchId, agentId: agent.id,
      totalResumes: resumes.length,
      filtered: toMatch.length,
      matched: qualifiedResults.length,
      durationMs,
    });

    return {
      agentId: agent.id,
      searchId,
      totalResumes: resumes.length,
      filteredCount: toMatch.length,
      matchedCount: qualifiedResults.length,
      candidates: topCandidates,
      durationMs,
    };

  } catch (error) {
    logger.error('INSTANT_SEARCH', 'Search failed', {
      requestId, searchId,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      agentId: '', searchId,
      totalResumes: 0, filteredCount: 0, matchedCount: 0,
      candidates: [], durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : 'Search failed',
    };
  }
}

// ── Helpers ──

function generateId(): string {
  return Math.random().toString(36).substring(2, 15);
}

function preFilterResumes(
  resumes: Array<{ id: string; name: string; resumeText: string; tags: string[]; currentRole: string | null; experienceYears: string | null }>,
  requirements: HiringRequirements,
): { passed: typeof resumes; excluded: Array<{ resume: typeof resumes[0]; reason: string }> } {
  const mustHaveSkills = (requirements.hardSkills || []).map(s => s.toLowerCase());
  const softSkills = (requirements.softSkills || []).map(s => s.toLowerCase());
  const allSkills = [...mustHaveSkills, ...softSkills];
  const jobTitle = (requirements.jobTitle || '').toLowerCase();

  // If no skills specified, pass all resumes through
  if (allSkills.length === 0 && !jobTitle) {
    return { passed: resumes, excluded: [] };
  }

  const passed: typeof resumes = [];
  const excluded: Array<{ resume: typeof resumes[0]; reason: string }> = [];

  for (const resume of resumes) {
    const text = (resume.resumeText + ' ' + (resume.tags || []).join(' ') + ' ' + (resume.currentRole || '')).toLowerCase();

    // Check if at least 1 must-have skill keyword appears
    if (mustHaveSkills.length > 0) {
      const hits = mustHaveSkills.filter(skill => text.includes(skill));
      if (hits.length === 0) {
        excluded.push({ resume, reason: 'No must-have skill keywords found in resume' });
        continue;
      }
    }

    // Check job title relevance (loose match)
    if (jobTitle && jobTitle.length > 2) {
      const titleWords = jobTitle.split(/[\s/,]+/).filter(w => w.length > 1);
      const titleHits = titleWords.filter(w => text.includes(w));
      // At least 1 title word should match (very loose)
      if (titleWords.length > 0 && titleHits.length === 0) {
        // Still pass — we're intentionally loose. Just no extra boost.
      }
    }

    passed.push(resume);
  }

  return { passed, excluded };
}

function buildJDFromRequirements(req: HiringRequirements): string {
  const sections: string[] = [];

  if (req.jobTitle) sections.push(`# ${req.jobTitle}`);
  if (req.department) sections.push(`部门/团队: ${req.department}`);
  if (req.roleType) sections.push(`类型: ${req.roleType}`);

  if (req.primaryResponsibilities?.length) {
    sections.push('\n## 核心职责\n' + req.primaryResponsibilities.map(r => `- ${r}`).join('\n'));
  }
  if (req.secondaryResponsibilities?.length) {
    sections.push('\n## 其他职责\n' + req.secondaryResponsibilities.map(r => `- ${r}`).join('\n'));
  }

  const hardReqs: string[] = [];
  if (req.hardSkills?.length) hardReqs.push('硬性技能: ' + req.hardSkills.join(', '));
  if (req.yearsOfExperience) hardReqs.push('经验要求: ' + req.yearsOfExperience);
  if (req.education) hardReqs.push('学历要求: ' + req.education);
  if (req.industryExperience) hardReqs.push('行业经验: ' + req.industryExperience);
  if (req.softSkills?.length) hardReqs.push('软技能: ' + req.softSkills.join(', '));
  if (hardReqs.length) sections.push('\n## 硬性要求（必须）\n' + hardReqs.join('\n'));

  if (req.preferredQualifications?.length) {
    sections.push('\n## 加分项（优先）\n' + req.preferredQualifications.map(q => `- ${q}`).join('\n'));
  }

  if (req.salaryRange) sections.push(`\n薪资范围: ${req.salaryRange}`);
  if (req.workLocation) sections.push(`工作地点: ${req.workLocation}`);
  if (req.dealBreakers?.length) {
    sections.push('\n## 一票否决\n' + req.dealBreakers.map(d => `- ${d}`).join('\n'));
  }

  return sections.join('\n') || 'No specific requirements defined.';
}

function buildSearchDescription(req: HiringRequirements): string {
  const parts: string[] = [];
  if (req.jobTitle) parts.push(req.jobTitle);
  if (req.hardSkills?.length) parts.push(`Skills: ${req.hardSkills.slice(0, 5).join(', ')}`);
  if (req.yearsOfExperience) parts.push(req.yearsOfExperience);
  if (req.workLocation) parts.push(req.workLocation);
  return parts.join(' | ') || 'Instant search match';
}
