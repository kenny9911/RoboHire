import { PrismaClient } from '@prisma/client';
import type { ATSAdapter, ATSCredentials, ATSCandidate, ATSProvider } from './ATSAdapter.js';
import { ATS_PROVIDERS } from './ATSAdapter.js';
import { encryptCredentials, decryptCredentials } from './CredentialEncryption.js';
import { GreenhouseAdapter } from './adapters/GreenhouseAdapter.js';
import { LeverAdapter } from './adapters/LeverAdapter.js';
import { AshbyAdapter } from './adapters/AshbyAdapter.js';
import { BambooHRAdapter } from './adapters/BambooHRAdapter.js';
import { WorkableAdapter } from './adapters/WorkableAdapter.js';
import { logger } from '../LoggerService.js';

const prisma = new PrismaClient();

const adapters: Record<ATSProvider, ATSAdapter> = {
  greenhouse: new GreenhouseAdapter(),
  lever: new LeverAdapter(),
  ashby: new AshbyAdapter(),
  bamboohr: new BambooHRAdapter(),
  workable: new WorkableAdapter(),
};

export class ATSIntegrationService {
  getAdapter(provider: ATSProvider): ATSAdapter {
    const adapter = adapters[provider];
    if (!adapter) throw new Error(`Unknown ATS provider: ${provider}`);
    return adapter;
  }

  isValidProvider(provider: string): provider is ATSProvider {
    return ATS_PROVIDERS.includes(provider as ATSProvider);
  }

  async connect(
    userId: string,
    provider: ATSProvider,
    credentials: ATSCredentials,
  ): Promise<{ id: string; provider: string; isActive: boolean }> {
    const adapter = this.getAdapter(provider);

    // Test connection before saving
    const valid = await adapter.testConnection(credentials);
    if (!valid) {
      throw new Error(`Failed to connect to ${provider}. Please check your credentials.`);
    }

    const encrypted = encryptCredentials(credentials as Record<string, unknown>);

    const integration = await prisma.aTSIntegration.upsert({
      where: { userId_provider: { userId, provider } },
      create: {
        userId,
        provider,
        credentials: encrypted,
        isActive: true,
        syncEnabled: true,
      },
      update: {
        credentials: encrypted,
        isActive: true,
        updatedAt: new Date(),
      },
    });

    logger.info('ATS', `Connected ${provider} for user ${userId}`, { integrationId: integration.id });

    return { id: integration.id, provider: integration.provider, isActive: integration.isActive };
  }

  async disconnect(userId: string, integrationId: string): Promise<void> {
    const integration = await prisma.aTSIntegration.findFirst({
      where: { id: integrationId, userId },
    });
    if (!integration) throw new Error('Integration not found');

    await prisma.aTSIntegration.update({
      where: { id: integrationId },
      data: { isActive: false },
    });

    logger.info('ATS', `Disconnected ${integration.provider} for user ${userId}`);
  }

  async testConnection(userId: string, integrationId: string): Promise<boolean> {
    const integration = await prisma.aTSIntegration.findFirst({
      where: { id: integrationId, userId },
    });
    if (!integration) throw new Error('Integration not found');

    const adapter = this.getAdapter(integration.provider as ATSProvider);
    const credentials = decryptCredentials(integration.credentials) as ATSCredentials;
    return adapter.testConnection(credentials);
  }

  async getIntegrations(userId: string) {
    return prisma.aTSIntegration.findMany({
      where: { userId },
      select: {
        id: true,
        provider: true,
        isActive: true,
        syncEnabled: true,
        lastSyncAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async syncCandidateToATS(
    userId: string,
    candidateId: string,
    integrationId: string,
    atsJobId: string,
  ): Promise<string | null> {
    const integration = await prisma.aTSIntegration.findFirst({
      where: { id: integrationId, userId, isActive: true },
    });
    if (!integration) throw new Error('Active integration not found');

    const candidate = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });
    if (!candidate) throw new Error('Candidate not found');

    const adapter = this.getAdapter(integration.provider as ATSProvider);
    const credentials = decryptCredentials(integration.credentials) as ATSCredentials;

    const atsCandidate: ATSCandidate = {
      name: candidate.name,
      email: candidate.email,
      resumeText: candidate.resumeText,
    };

    try {
      const externalId = await adapter.pushCandidate(credentials, atsJobId, atsCandidate);

      // Update candidate with external ATS ID
      await prisma.candidate.update({
        where: { id: candidateId },
        data: {
          externalAtsId: externalId,
          externalAtsProvider: integration.provider,
        },
      });

      // Log sync
      await prisma.aTSSyncLog.create({
        data: {
          integrationId: integration.id,
          direction: 'outbound',
          entityType: 'candidate',
          entityId: candidateId,
          externalId,
          status: 'success',
        },
      });

      // Update last sync time
      await prisma.aTSIntegration.update({
        where: { id: integration.id },
        data: { lastSyncAt: new Date() },
      });

      logger.info('ATS', `Synced candidate ${candidateId} to ${integration.provider}`, { externalId });
      return externalId;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);

      await prisma.aTSSyncLog.create({
        data: {
          integrationId: integration.id,
          direction: 'outbound',
          entityType: 'candidate',
          entityId: candidateId,
          status: 'failed',
          error: errorMsg,
        },
      });

      logger.error('ATS', `Failed to sync candidate ${candidateId} to ${integration.provider}`, { error: errorMsg });
      throw err;
    }
  }

  async listATSJobs(userId: string, integrationId: string) {
    const integration = await prisma.aTSIntegration.findFirst({
      where: { id: integrationId, userId, isActive: true },
    });
    if (!integration) throw new Error('Active integration not found');

    const adapter = this.getAdapter(integration.provider as ATSProvider);
    const credentials = decryptCredentials(integration.credentials) as ATSCredentials;
    return adapter.listJobs(credentials);
  }

  async getSyncLogs(userId: string, integrationId: string, limit = 50) {
    // Verify ownership
    const integration = await prisma.aTSIntegration.findFirst({
      where: { id: integrationId, userId },
    });
    if (!integration) throw new Error('Integration not found');

    return prisma.aTSSyncLog.findMany({
      where: { integrationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }

  async handleInboundWebhook(provider: ATSProvider, payload: unknown, signature?: string) {
    const adapter = this.getAdapter(provider);
    const event = adapter.parseWebhookPayload(payload, signature);

    if (!event) {
      logger.warn('ATS', `Invalid inbound webhook from ${provider}`);
      return;
    }

    logger.info('ATS', `Received inbound webhook from ${provider}: ${event.type}`, {
      candidateId: event.candidateId,
      applicationId: event.applicationId,
    });

    // If we can match an external ATS ID to a local candidate, update status
    if (event.candidateId) {
      const candidate = await prisma.candidate.findFirst({
        where: {
          externalAtsId: event.candidateId,
          externalAtsProvider: provider,
        },
      });

      if (candidate && event.stage) {
        const mappedStatus = adapter.mapStageToRoboHire(event.stage);
        await prisma.candidate.update({
          where: { id: candidate.id },
          data: { status: mappedStatus },
        });

        logger.info('ATS', `Updated candidate ${candidate.id} status to ${mappedStatus} from ${provider} webhook`);
      }
    }
  }
}

export const atsIntegrationService = new ATSIntegrationService();
