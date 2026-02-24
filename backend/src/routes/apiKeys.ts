import { Router } from 'express';
import crypto from 'crypto';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';
import '../types/auth.js';

const router = Router();

// All API key routes require authentication
router.use(requireAuth);

/**
 * Generate a secure API key
 * Format: rh_[32 random hex chars]
 */
function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(24);
  return `rh_${randomBytes.toString('hex')}`;
}

/**
 * Get the prefix (first 12 chars) for display
 */
function getKeyPrefix(key: string): string {
  return key.substring(0, 12);
}

/**
 * Mask an API key for display (show prefix and last 4 chars)
 */
function maskApiKey(key: string): string {
  const prefix = key.substring(0, 12);
  const suffix = key.substring(key.length - 4);
  return `${prefix}...${suffix}`;
}

/**
 * POST /api/v1/api-keys
 * Create a new API key
 */
router.post('/', async (req, res) => {
  try {
    const userId = req.user!.id;
    const { name, scopes, expiresAt } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Name is required',
      });
    }

    // Check if user already has 10 API keys (limit)
    const existingKeysCount = await prisma.apiKey.count({
      where: { userId },
    });

    if (existingKeysCount >= 10) {
      return res.status(400).json({
        success: false,
        error: 'Maximum of 10 API keys allowed per user',
      });
    }

    // Generate new API key
    const key = generateApiKey();
    const prefix = getKeyPrefix(key);

    // Validate scopes if provided
    const validScopes = ['read', 'write'];
    const keyScopes = scopes && Array.isArray(scopes) 
      ? scopes.filter((s: string) => validScopes.includes(s))
      : ['read', 'write'];

    // Validate expiration date if provided
    let expirationDate: Date | null = null;
    if (expiresAt) {
      expirationDate = new Date(expiresAt);
      if (isNaN(expirationDate.getTime()) || expirationDate <= new Date()) {
        return res.status(400).json({
          success: false,
          error: 'Invalid or past expiration date',
        });
      }
    }

    const apiKey = await prisma.apiKey.create({
      data: {
        userId,
        name: name.trim(),
        key,
        prefix,
        scopes: keyScopes,
        expiresAt: expirationDate,
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        expiresAt: true,
        isActive: true,
        createdAt: true,
      },
    });

    // Return the full key only on creation (this is the only time it's shown)
    res.status(201).json({
      success: true,
      data: {
        ...apiKey,
        key, // Full key shown only once
      },
      message: 'API key created. Save this key securely - it will not be shown again.',
    });
  } catch (error) {
    console.error('Create API key error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create API key',
    });
  }
});

/**
 * GET /api/v1/api-keys
 * List all API keys for the current user
 */
router.get('/', async (req, res) => {
  try {
    const userId = req.user!.id;

    const apiKeys = await prisma.apiKey.findMany({
      where: { userId },
      select: {
        id: true,
        name: true,
        prefix: true,
        key: true, // We'll mask this
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      success: true,
      data: apiKeys,
    });
  } catch (error) {
    console.error('List API keys error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list API keys',
    });
  }
});

/**
 * GET /api/v1/api-keys/:id
 * Get a single API key
 */
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const apiKey = await prisma.apiKey.findFirst({
      where: { id, userId },
      select: {
        id: true,
        name: true,
        prefix: true,
        key: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!apiKey) {
      return res.status(404).json({
        success: false,
        error: 'API key not found',
      });
    }

    res.json({
      success: true,
      data: {
        ...apiKey,
        key: maskApiKey(apiKey.key),
      },
    });
  } catch (error) {
    console.error('Get API key error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get API key',
    });
  }
});

/**
 * PATCH /api/v1/api-keys/:id
 * Update an API key (name, scopes, active status)
 */
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;
    const { name, scopes, isActive } = req.body;

    // Verify ownership
    const existing = await prisma.apiKey.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'API key not found',
      });
    }

    // Validate scopes if provided
    const validScopes = ['read', 'write'];
    let keyScopes: string[] | undefined;
    if (scopes !== undefined) {
      if (!Array.isArray(scopes)) {
        return res.status(400).json({
          success: false,
          error: 'Scopes must be an array',
        });
      }
      keyScopes = scopes.filter((s: string) => validScopes.includes(s));
      if (keyScopes.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'At least one valid scope is required',
        });
      }
    }

    const apiKey = await prisma.apiKey.update({
      where: { id },
      data: {
        ...(name !== undefined && { name: name.trim() }),
        ...(keyScopes !== undefined && { scopes: keyScopes }),
        ...(isActive !== undefined && { isActive: Boolean(isActive) }),
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        key: true,
        scopes: true,
        lastUsedAt: true,
        expiresAt: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json({
      success: true,
      data: {
        ...apiKey,
        key: maskApiKey(apiKey.key),
      },
    });
  } catch (error) {
    console.error('Update API key error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update API key',
    });
  }
});

/**
 * DELETE /api/v1/api-keys/:id
 * Delete an API key
 */
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Verify ownership
    const existing = await prisma.apiKey.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'API key not found',
      });
    }

    await prisma.apiKey.delete({
      where: { id },
    });

    res.json({
      success: true,
      message: 'API key deleted successfully',
    });
  } catch (error) {
    console.error('Delete API key error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete API key',
    });
  }
});

/**
 * GET /api/v1/api-keys/:id/reveal
 * Return the full unmasked API key (requires authenticated owner)
 */
router.get('/:id/reveal', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    const apiKey = await prisma.apiKey.findFirst({
      where: { id, userId },
      select: { key: true },
    });

    if (!apiKey) {
      return res.status(404).json({ success: false, error: 'API key not found' });
    }

    res.json({ success: true, data: { key: apiKey.key } });
  } catch (error) {
    console.error('Reveal API key error:', error);
    res.status(500).json({ success: false, error: 'Failed to reveal API key' });
  }
});

/**
 * POST /api/v1/api-keys/:id/regenerate
 * Regenerate an API key (creates new secret, same metadata)
 */
router.post('/:id/regenerate', async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user!.id;

    // Verify ownership
    const existing = await prisma.apiKey.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'API key not found',
      });
    }

    // Generate new key
    const newKey = generateApiKey();
    const newPrefix = getKeyPrefix(newKey);

    const apiKey = await prisma.apiKey.update({
      where: { id },
      data: {
        key: newKey,
        prefix: newPrefix,
        lastUsedAt: null, // Reset last used
      },
      select: {
        id: true,
        name: true,
        prefix: true,
        scopes: true,
        expiresAt: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    // Return the new full key
    res.json({
      success: true,
      data: {
        ...apiKey,
        key: newKey, // Full key shown only on regeneration
      },
      message: 'API key regenerated. Save this key securely - it will not be shown again.',
    });
  } catch (error) {
    console.error('Regenerate API key error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to regenerate API key',
    });
  }
});

export default router;
