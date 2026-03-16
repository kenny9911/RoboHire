import { Router, type Request, type Response } from 'express';
import prisma from '../lib/prisma.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

/**
 * GET /api/v1/teams/my
 * Get the current user's team memberships and lead status
 */
router.get('/my', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const memberships = await prisma.teamMember.findMany({
      where: { userId: req.user.id },
      include: {
        team: {
          include: {
            members: { select: { id: true, name: true, email: true, avatar: true } },
          },
        },
      },
    });

    res.json({ success: true, data: memberships });
  } catch (error) {
    console.error('Get my teams error:', error);
    res.status(500).json({ success: false, error: 'Failed to get teams' });
  }
});

/**
 * POST /api/v1/teams/:teamId/invite
 * Team Lead invites a user by email. Creates a TeamInvitation or directly adds the user.
 * Body: { email: string }
 */
router.post('/:teamId/invite', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const { email } = req.body;
    if (!email || typeof email !== 'string' || !email.trim()) {
      return res.status(400).json({ success: false, error: 'Email is required' });
    }

    const isAdmin = (req.user as any).role === 'admin';

    // Check if user is a team lead for this team (or admin)
    if (!isAdmin) {
      const membership = await prisma.teamMember.findUnique({
        where: { userId_teamId: { userId: req.user.id, teamId: req.params.teamId } },
      });
      if (!membership || membership.role !== 'lead') {
        return res.status(403).json({ success: false, error: 'Only team leads can invite members' });
      }
    }

    const team = await prisma.team.findUnique({ where: { id: req.params.teamId }, select: { id: true, name: true } });
    if (!team) return res.status(404).json({ success: false, error: 'Team not found' });

    const trimmedEmail = email.trim().toLowerCase();

    // Check if user exists
    const targetUser = await prisma.user.findUnique({
      where: { email: trimmedEmail },
      select: { id: true, email: true, name: true },
    });

    if (targetUser) {
      // User exists — check if already a member
      const existing = await prisma.teamMember.findUnique({
        where: { userId_teamId: { userId: targetUser.id, teamId: team.id } },
      });
      if (existing) {
        return res.status(400).json({ success: false, error: 'User is already a team member' });
      }

      // Directly add them as a member
      await prisma.teamMember.create({
        data: { userId: targetUser.id, teamId: team.id, role: 'member' },
      });
      // Also set their primary teamId if not set
      await prisma.user.update({
        where: { id: targetUser.id, teamId: null },
        data: { teamId: team.id },
      }).catch(() => { /* teamId already set, ignore */ });

      return res.json({
        success: true,
        data: { type: 'added', user: targetUser, teamName: team.name },
      });
    }

    // User doesn't exist — create a pending invitation
    const invitation = await prisma.teamInvitation.upsert({
      where: { teamId_email: { teamId: team.id, email: trimmedEmail } },
      create: { teamId: team.id, email: trimmedEmail, invitedBy: req.user.id },
      update: { invitedBy: req.user.id, status: 'pending' },
    });

    res.json({
      success: true,
      data: { type: 'invited', invitation, teamName: team.name },
    });
  } catch (error) {
    console.error('Team invite error:', error);
    res.status(500).json({ success: false, error: 'Failed to invite member' });
  }
});

/**
 * GET /api/v1/teams/:teamId/invitations
 * List pending invitations for a team (team lead or admin)
 */
router.get('/:teamId/invitations', async (req: Request, res: Response) => {
  try {
    if (!req.user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const isAdmin = (req.user as any).role === 'admin';
    if (!isAdmin) {
      const membership = await prisma.teamMember.findUnique({
        where: { userId_teamId: { userId: req.user.id, teamId: req.params.teamId } },
      });
      if (!membership || membership.role !== 'lead') {
        return res.status(403).json({ success: false, error: 'Only team leads can view invitations' });
      }
    }

    const invitations = await prisma.teamInvitation.findMany({
      where: { teamId: req.params.teamId },
      include: { inviter: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ success: true, data: invitations });
  } catch (error) {
    console.error('List invitations error:', error);
    res.status(500).json({ success: false, error: 'Failed to list invitations' });
  }
});

export default router;
