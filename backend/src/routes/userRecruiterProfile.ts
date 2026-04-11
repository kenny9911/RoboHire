/**
 * User Recruiter Profile — Phase 7a
 *
 * Exposes the aggregated cross-agent taste model:
 *   GET  /api/v1/user-recruiter-profile         → current user's profile
 *   POST /api/v1/user-recruiter-profile/rebuild → force a rebuild now
 *   DELETE /api/v1/user-recruiter-profile       → hard reset (start fresh)
 */

import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { userRecruiterProfileService } from '../services/UserRecruiterProfileService.js';
import '../types/auth.js';

const router = Router();

router.get('/', requireAuth, async (req, res) => {
  try {
    const profile = await userRecruiterProfileService.getForUser(req.user!.id);
    res.json({ data: profile });
  } catch (err) {
    console.error('Failed to load user recruiter profile:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

router.post('/rebuild', requireAuth, async (req, res) => {
  try {
    // Synchronous rebuild — the user explicitly asked for it, so don't throttle.
    await userRecruiterProfileService.rebuildForUser(req.user!.id);
    const profile = await userRecruiterProfileService.getForUser(req.user!.id);
    res.json({ data: profile });
  } catch (err) {
    console.error('Failed to rebuild user recruiter profile:', err);
    res.status(500).json({ error: 'Failed to rebuild profile' });
  }
});

router.delete('/', requireAuth, async (req, res) => {
  try {
    await userRecruiterProfileService.resetForUser(req.user!.id);
    res.json({ success: true });
  } catch (err) {
    console.error('Failed to reset user recruiter profile:', err);
    res.status(500).json({ error: 'Failed to reset profile' });
  }
});

export default router;
