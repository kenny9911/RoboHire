import prisma from '../lib/prisma.js';
import { logger, generateRequestId } from './LoggerService.js';
import { candidateProfileAgent } from '../agents/CandidateProfileAgent.js';
import { sourcingStrategyAgent } from '../agents/SourcingStrategyAgent.js';
import { marketIntelligenceAgent } from '../agents/MarketIntelligenceAgent.js';
import type {
  RecruitmentIntelligenceReport,
  RecruitmentIntelligenceInput,
} from '../types/index.js';

const CACHE_TTL_DAYS = 7;

export class RecruitmentIntelligenceService {
  /**
   * Generate or retrieve cached intelligence report for a hiring request.
   * Orchestration: CandidateProfile first, then Sourcing + Market in parallel.
   */
  async generate(
    hiringRequestId: string,
    userId: string,
    options: { force?: boolean } = {},
    requestId?: string
  ): Promise<RecruitmentIntelligenceReport> {
    const rid = requestId || generateRequestId();

    // 1. Fetch hiring request + verify ownership
    const hr = await prisma.hiringRequest.findFirst({
      where: { id: hiringRequestId, userId },
      select: {
        id: true,
        title: true,
        requirements: true,
        jobDescription: true,
        intelligenceData: true,
        intelligenceUpdatedAt: true,
      },
    });

    if (!hr) {
      throw new Error('Hiring request not found');
    }

    // 2. Check cache (7-day TTL)
    if (!options.force && hr.intelligenceData && hr.intelligenceUpdatedAt) {
      const ttlBoundary = new Date();
      ttlBoundary.setDate(ttlBoundary.getDate() - CACHE_TTL_DAYS);
      if (hr.intelligenceUpdatedAt > ttlBoundary) {
        logger.info('INTEL', 'Returning cached intelligence report', { hiringRequestId }, rid);
        return hr.intelligenceData as unknown as RecruitmentIntelligenceReport;
      }
    }

    // 3. Build input
    const input: RecruitmentIntelligenceInput = {
      title: hr.title,
      requirements: hr.requirements,
      jobDescription: hr.jobDescription || undefined,
    };

    // 4. Step 1: CandidateProfile (sequential — other agents depend on it)
    logger.info('INTEL', 'Step 1: Generating candidate profile', { hiringRequestId }, rid);
    const candidateProfile = await candidateProfileAgent.analyze(input, rid);

    // 5. Step 2: Sourcing + Market in parallel
    logger.info('INTEL', 'Step 2: Generating sourcing strategy + market intelligence (parallel)', { hiringRequestId }, rid);
    const [sourcingStrategy, marketIntelligence] = await Promise.all([
      sourcingStrategyAgent.analyze({ ...input, candidateProfile }, rid),
      marketIntelligenceAgent.analyze({ ...input, candidateProfile }, rid),
    ]);

    // 6. Assemble report
    const report: RecruitmentIntelligenceReport = {
      candidateProfile,
      sourcingStrategy,
      marketIntelligence,
      generatedAt: new Date().toISOString(),
    };

    // 7. Cache in DB
    await prisma.hiringRequest.update({
      where: { id: hiringRequestId },
      data: {
        intelligenceData: JSON.parse(JSON.stringify(report)),
        intelligenceUpdatedAt: new Date(),
      },
    });

    logger.info('INTEL', 'Intelligence report generated and cached', {
      hiringRequestId,
      difficultyScore: marketIntelligence.recruitmentDifficulty.score,
    }, rid);

    return report;
  }
}

export const recruitmentIntelligenceService = new RecruitmentIntelligenceService();
