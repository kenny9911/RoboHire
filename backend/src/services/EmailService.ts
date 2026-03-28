import prisma from '../lib/prisma.js';

interface SendEmailOptions {
  to: string | string[];
  subject: string;
  html: string;
}

class EmailService {
  private apiKey: string | undefined;
  private from: string;

  constructor() {
    this.apiKey = process.env.RESEND_API_KEY;
    this.from = process.env.EMAIL_FROM || 'RoboHire <noreply@robohire.io>';
  }

  get isConfigured(): boolean {
    return !!this.apiKey;
  }

  async send(options: SendEmailOptions): Promise<boolean> {
    if (!this.apiKey) return false;

    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          from: this.from,
          to: Array.isArray(options.to) ? options.to : [options.to],
          subject: options.subject,
          html: options.html,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error('EmailService send failed:', res.status, body);
      }
      return res.ok;
    } catch (err) {
      console.error('EmailService send error:', err);
      return false;
    }
  }

  async notifyAdminsOfSignup(user: {
    name?: string | null;
    email: string;
    company?: string | null;
    createdAt: Date;
  }): Promise<void> {
    if (!this.isConfigured) return;

    const admins = await prisma.user.findMany({
      where: { role: 'admin' },
      select: { email: true },
    });

    if (admins.length === 0) return;

    const adminEmails = admins.map((a) => a.email);
    const time = user.createdAt.toISOString().replace('T', ' ').slice(0, 19) + ' UTC';

    await this.send({
      to: adminEmails,
      subject: `New RoboHire signup: ${user.email}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1e293b; margin-bottom: 16px;">New User Signup</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr><td style="padding: 8px 0; color: #64748b; width: 100px;">Name</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(user.name || '(not provided)')}</td></tr>
            <tr><td style="padding: 8px 0; color: #64748b;">Email</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(user.email)}</td></tr>
            <tr><td style="padding: 8px 0; color: #64748b;">Company</td><td style="padding: 8px 0; color: #1e293b;">${escapeHtml(user.company || '(not provided)')}</td></tr>
            <tr><td style="padding: 8px 0; color: #64748b;">Time</td><td style="padding: 8px 0; color: #1e293b;">${time}</td></tr>
          </table>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="color: #94a3b8; font-size: 12px;">This is an automated notification from RoboHire.</p>
        </div>
      `,
    });
  }
}

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const emailService = new EmailService();
export default emailService;
