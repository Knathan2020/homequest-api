/**
 * Resend Email Service
 * Sends beautiful HTML emails using Resend
 */

import { Resend } from 'resend';
import fs from 'fs';
import path from 'path';

const resend = new Resend(process.env.RESEND_API_KEY);

interface TeamInviteData {
  email: string;
  fullName: string;
  teamName: string;
  role: string;
  department: string;
  inviteUrl: string;
}

class ResendEmailService {
  private teamInviteTemplate: string = '';

  constructor() {
    this.loadTemplates();
  }

  private loadTemplates() {
    try {
      // Try production path first (dist/templates), then development path (src/templates)
      let templatePath = path.join(__dirname, '../templates/team-invite.html');

      if (!fs.existsSync(templatePath)) {
        // Fallback to src directory for development or if templates aren't copied
        templatePath = path.join(process.cwd(), 'src/templates/team-invite.html');
      }

      this.teamInviteTemplate = fs.readFileSync(templatePath, 'utf-8');
      console.log('✅ Email templates loaded from:', templatePath);
    } catch (error) {
      console.error('❌ Error loading email templates:', error);
    }
  }

  private replaceVariables(template: string, data: Record<string, string>): string {
    let html = template;
    Object.keys(data).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      html = html.replace(regex, data[key] || '');
    });
    return html;
  }

  async sendTeamInvite(data: TeamInviteData): Promise<boolean> {
    try {
      const html = this.replaceVariables(this.teamInviteTemplate, {
        fullName: data.fullName,
        teamName: data.teamName,
        role: data.role,
        department: data.department,
        inviteUrl: data.inviteUrl
      });

      const result = await resend.emails.send({
        from: 'HomeQuest Tech <onboarding@resend.dev>', // Change to your verified domain later
        to: data.email,
        subject: `You're invited to join ${data.teamName} on HomeQuest`,
        html: html
      });

      console.log('✅ Invitation email sent:', result.data?.id || 'sent');
      return true;
    } catch (error) {
      console.error('❌ Error sending invitation email:', error);
      return false;
    }
  }
}

export default new ResendEmailService();
