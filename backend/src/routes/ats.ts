import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { atsIntegrationService } from '../services/ats/ATSIntegrationService.js';
import type { ATSProvider } from '../services/ats/ATSAdapter.js';
import { logger } from '../services/LoggerService.js';
import '../types/auth.js';

const router = Router();

/**
 * GET /api/v1/ats/integrations
 * List all ATS integrations for the authenticated user.
 */
router.get('/integrations', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const integrations = await atsIntegrationService.getIntegrations(userId);
    res.json({ success: true, data: integrations });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to list integrations';
    res.status(500).json({ success: false, error: msg });
  }
});

/**
 * POST /api/v1/ats/integrations
 * Connect a new ATS integration.
 * Body: { provider, credentials: { apiKey, subdomain? } }
 */
router.post('/integrations', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { provider, credentials } = req.body;

    if (!provider || !credentials?.apiKey) {
      res.status(400).json({ success: false, error: 'provider and credentials.apiKey are required' });
      return;
    }

    if (!atsIntegrationService.isValidProvider(provider)) {
      res.status(400).json({ success: false, error: `Invalid ATS provider: ${provider}. Supported: greenhouse, lever, ashby, bamboohr, workable` });
      return;
    }

    const integration = await atsIntegrationService.connect(userId, provider, credentials);
    res.json({ success: true, data: integration });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to connect integration';
    res.status(400).json({ success: false, error: msg });
  }
});

/**
 * DELETE /api/v1/ats/integrations/:id
 * Disconnect an ATS integration.
 */
router.delete('/integrations/:id', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    await atsIntegrationService.disconnect(userId, req.params.id);
    res.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to disconnect integration';
    res.status(400).json({ success: false, error: msg });
  }
});

/**
 * POST /api/v1/ats/integrations/:id/test
 * Test connection for an existing integration.
 */
router.post('/integrations/:id/test', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const connected = await atsIntegrationService.testConnection(userId, req.params.id);
    res.json({ success: true, data: { connected } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to test connection';
    res.status(400).json({ success: false, error: msg });
  }
});

/**
 * POST /api/v1/ats/integrations/:id/sync
 * Sync a candidate to the connected ATS.
 * Body: { candidateId, atsJobId }
 */
router.post('/integrations/:id/sync', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { candidateId, atsJobId } = req.body;

    if (!candidateId || !atsJobId) {
      res.status(400).json({ success: false, error: 'candidateId and atsJobId are required' });
      return;
    }

    const externalId = await atsIntegrationService.syncCandidateToATS(userId, candidateId, req.params.id, atsJobId);
    res.json({ success: true, data: { externalId } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to sync candidate';
    res.status(400).json({ success: false, error: msg });
  }
});

/**
 * GET /api/v1/ats/integrations/:id/jobs
 * List jobs from the connected ATS.
 */
router.get('/integrations/:id/jobs', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const jobs = await atsIntegrationService.listATSJobs(userId, req.params.id);
    res.json({ success: true, data: jobs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to list ATS jobs';
    res.status(400).json({ success: false, error: msg });
  }
});

/**
 * GET /api/v1/ats/integrations/:id/logs
 * View sync logs for an integration.
 */
router.get('/integrations/:id/logs', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const logs = await atsIntegrationService.getSyncLogs(userId, req.params.id, limit);
    res.json({ success: true, data: logs });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to get sync logs';
    res.status(500).json({ success: false, error: msg });
  }
});

/**
 * POST /api/v1/ats/webhooks/:provider
 * Inbound webhook endpoint for ATS providers.
 * Public (no auth) — validated by provider-specific signature verification.
 */
router.post('/webhooks/:provider', async (req, res) => {
  try {
    const provider = req.params.provider as ATSProvider;

    if (!atsIntegrationService.isValidProvider(provider)) {
      res.status(400).json({ success: false, error: 'Invalid provider' });
      return;
    }

    const signature = (req.headers['x-hook-secret'] || req.headers['x-greenhouse-signature'] || req.headers['x-workable-signature'] || '') as string;

    await atsIntegrationService.handleInboundWebhook(provider, req.body, signature);
    res.json({ success: true });
  } catch (err) {
    logger.error('ATS', 'Inbound webhook error', { error: String(err) });
    // Always return 200 to prevent ATS from retrying endlessly
    res.json({ success: true });
  }
});

export default router;
