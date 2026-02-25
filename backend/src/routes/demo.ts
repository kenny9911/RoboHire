import { Router } from 'express';

const router = Router();

/**
 * POST /api/v1/request-demo
 * Public endpoint — accepts demo request form submissions.
 * Logs the lead and optionally sends notification emails.
 */
router.post('/', async (req, res) => {
  try {
    const { name, email, company, teamSize, source, message } = req.body;

    if (!name || typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ success: false, error: 'Name is required' });
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ success: false, error: 'A valid email is required' });
    }

    const lead = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      company: company?.trim() || null,
      teamSize: teamSize || null,
      source: source || null,
      message: message?.trim() || null,
      createdAt: new Date().toISOString(),
    };

    console.log('[DemoRequest]', JSON.stringify(lead));

    // TODO: Send notification email via Resend when RESEND_API_KEY is configured
    // TODO: Store lead in database (DemoRequest model) for CRM tracking

    res.json({ success: true, message: 'Demo request received' });
  } catch (error) {
    console.error('Demo request error:', error);
    res.status(500).json({ success: false, error: 'Failed to process demo request' });
  }
});

export default router;
