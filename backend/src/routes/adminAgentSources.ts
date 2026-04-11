/**
 * Admin routes for managing Agent candidate-source configuration.
 *
 * Exposes two resources:
 *   1. SourceConfig — per-workspace toggles for the three canonical sources
 *      (instant_search, internal_minio, external_api). Single row per workspace.
 *   2. ExternalSourceConfig — CRUD for third-party sourcing vendors
 *      (LinkedIn, GitHub, SeekOut, custom HTTP). Credentials encrypted at rest.
 *
 * Mounted under `/api/v1/admin/agent-sources/*` — the parent admin router
 * already enforces `requireAuth + requireAdmin`.
 */

import { Router } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../lib/prisma.js';
import { encryptJson, decryptJson } from '../lib/crypto.js';

const router = Router();

const VALID_PROVIDERS = ['linkedin', 'github', 'seekout', 'fetcher', 'custom'] as const;
const VALID_AUTH_TYPES = ['api_key', 'oauth', 'basic'] as const;

// ── SourceConfig (per-workspace toggles) ────────────────────────────────────

router.get('/config', async (_req, res) => {
  try {
    // V1: single global row keyed by workspaceId = null. Multi-workspace
    // support lands when RoboHire introduces workspaces as first-class entities.
    let config = await prisma.sourceConfig.findFirst({ where: { workspaceId: null } });
    if (!config) {
      config = await prisma.sourceConfig.create({
        data: {
          workspaceId: null,
          instantSearchEnabled: true,
          internalMinioEnabled: false,
          externalApiEnabled: false,
        },
      });
    }
    res.json({ data: config });
  } catch (err) {
    console.error('Failed to load source config:', err);
    res.status(500).json({ error: 'Failed to load source config' });
  }
});

router.patch('/config', async (req, res) => {
  try {
    const { instantSearchEnabled, internalMinioEnabled, externalApiEnabled, minioBucket } = req.body;
    const existing = await prisma.sourceConfig.findFirst({ where: { workspaceId: null } });

    const data: {
      instantSearchEnabled?: boolean;
      internalMinioEnabled?: boolean;
      externalApiEnabled?: boolean;
      minioBucket?: string | null;
    } = {};
    if (typeof instantSearchEnabled === 'boolean') data.instantSearchEnabled = instantSearchEnabled;
    if (typeof internalMinioEnabled === 'boolean') data.internalMinioEnabled = internalMinioEnabled;
    if (typeof externalApiEnabled === 'boolean') data.externalApiEnabled = externalApiEnabled;
    if (typeof minioBucket === 'string' || minioBucket === null) data.minioBucket = minioBucket;

    const updated = existing
      ? await prisma.sourceConfig.update({ where: { id: existing.id }, data })
      : await prisma.sourceConfig.create({
          data: {
            workspaceId: null,
            instantSearchEnabled: true,
            internalMinioEnabled: false,
            externalApiEnabled: false,
            ...data,
          },
        });

    res.json({ data: updated });
  } catch (err) {
    console.error('Failed to update source config:', err);
    res.status(500).json({ error: 'Failed to update source config' });
  }
});

// ── ExternalSourceConfig (third-party vendor CRUD) ──────────────────────────

router.get('/external', async (_req, res) => {
  try {
    const rows = await prisma.externalSourceConfig.findMany({
      orderBy: { createdAt: 'desc' },
    });
    // Never return credentials over the wire — strip on response.
    const safe = rows.map((r) => ({
      id: r.id,
      name: r.name,
      provider: r.provider,
      enabled: r.enabled,
      baseUrl: r.baseUrl,
      authType: r.authType,
      config: r.config,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
      hasCredentials: Boolean(r.credentials),
    }));
    res.json({ data: safe });
  } catch (err) {
    console.error('Failed to list external sources:', err);
    res.status(500).json({ error: 'Failed to list external sources' });
  }
});

router.post('/external', async (req, res) => {
  try {
    const { name, provider, baseUrl, authType, credentials, config, enabled } = req.body;
    if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name is required' });
    if (!provider || !(VALID_PROVIDERS as readonly string[]).includes(provider)) {
      return res.status(400).json({ error: `provider must be one of: ${VALID_PROVIDERS.join(', ')}` });
    }
    if (!baseUrl || typeof baseUrl !== 'string') return res.status(400).json({ error: 'baseUrl is required' });
    if (!authType || !(VALID_AUTH_TYPES as readonly string[]).includes(authType)) {
      return res.status(400).json({ error: `authType must be one of: ${VALID_AUTH_TYPES.join(', ')}` });
    }
    if (!credentials || typeof credentials !== 'object') {
      return res.status(400).json({ error: 'credentials object is required' });
    }

    const encrypted = encryptJson(credentials);

    const row = await prisma.externalSourceConfig.create({
      data: {
        name,
        provider,
        baseUrl,
        authType,
        credentials: encrypted,
        config: config ?? Prisma.JsonNull,
        enabled: enabled !== false,
      },
    });

    res.status(201).json({
      data: {
        id: row.id,
        name: row.name,
        provider: row.provider,
        enabled: row.enabled,
        baseUrl: row.baseUrl,
        authType: row.authType,
        config: row.config,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        hasCredentials: true,
      },
    });
  } catch (err) {
    console.error('Failed to create external source:', err);
    res.status(500).json({ error: 'Failed to create external source' });
  }
});

router.patch('/external/:id', async (req, res) => {
  try {
    const { name, baseUrl, authType, credentials, config, enabled } = req.body;

    const data: Record<string, unknown> = {};
    if (typeof name === 'string') data.name = name;
    if (typeof baseUrl === 'string') data.baseUrl = baseUrl;
    if (typeof authType === 'string') {
      if (!(VALID_AUTH_TYPES as readonly string[]).includes(authType)) {
        return res.status(400).json({ error: `authType must be one of: ${VALID_AUTH_TYPES.join(', ')}` });
      }
      data.authType = authType;
    }
    if (credentials !== undefined) {
      if (!credentials || typeof credentials !== 'object') {
        return res.status(400).json({ error: 'credentials must be an object' });
      }
      data.credentials = encryptJson(credentials);
    }
    if (config !== undefined) data.config = config;
    if (typeof enabled === 'boolean') data.enabled = enabled;

    const row = await prisma.externalSourceConfig.update({
      where: { id: req.params.id },
      data,
    });
    res.json({
      data: {
        id: row.id,
        name: row.name,
        provider: row.provider,
        enabled: row.enabled,
        baseUrl: row.baseUrl,
        authType: row.authType,
        config: row.config,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        hasCredentials: Boolean(row.credentials),
      },
    });
  } catch (err) {
    console.error('Failed to update external source:', err);
    res.status(500).json({ error: 'Failed to update external source' });
  }
});

router.delete('/external/:id', async (req, res) => {
  try {
    await prisma.externalSourceConfig.delete({ where: { id: req.params.id } });
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to delete external source:', err);
    res.status(500).json({ error: 'Failed to delete external source' });
  }
});

// ── Test an external source — fires a dry-run request ──────────────────────

router.post('/external/:id/test', async (req, res) => {
  try {
    const row = await prisma.externalSourceConfig.findUnique({ where: { id: req.params.id } });
    if (!row) return res.status(404).json({ error: 'External source not found' });

    let decryptedCreds: Record<string, unknown>;
    try {
      decryptedCreds = decryptJson<Record<string, unknown>>(
        typeof row.credentials === 'string' ? row.credentials : JSON.stringify(row.credentials),
      );
    } catch {
      return res.status(500).json({ error: 'Stored credentials could not be decrypted' });
    }

    const { searchWithCustomHttpDriver } = await import('../services/sources/drivers/CustomHttpDriver.js');
    const ctrl = new AbortController();
    const timeout = setTimeout(() => ctrl.abort(), 15_000);
    try {
      const candidates = await searchWithCustomHttpDriver(
        {
          baseUrl: row.baseUrl,
          authType: row.authType,
          credentials: decryptedCreds,
          config: (row.config as Record<string, unknown> | null) ?? null,
        },
        {
          criteria: 'test query',
          instructions: null,
          jobTitle: null,
          limit: 1,
        },
        ctrl.signal,
      );
      res.json({ data: { ok: true, sample: candidates.slice(0, 3) } });
    } catch (err) {
      res.json({ data: { ok: false, error: err instanceof Error ? err.message : String(err) } });
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error('Failed to test external source:', err);
    res.status(500).json({ error: 'Failed to test external source' });
  }
});

export default router;
