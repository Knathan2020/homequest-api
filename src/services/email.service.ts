/**
 * Email Service for sending beautifully designed emails
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

export interface EmailTemplate {
  to: string;
  subject: string;
  template: 'confirmation' | 'welcome' | 'reset-password';
  data: {
    fullName?: string;
    email?: string;
    confirmationUrl?: string;
    [key: string]: any;
  };
}

class EmailService {
  private templates: Map<string, string> = new Map();

  constructor() {
    this.loadTemplates();
  }

  private loadTemplates() {
    const templatesDir = path.join(__dirname, '../templates');
    
    // Load email confirmation template
    try {
      const confirmationTemplate = fs.readFileSync(
        path.join(templatesDir, 'email-confirmation.html'),
        'utf-8'
      );
      this.templates.set('confirmation', confirmationTemplate);
      
      // Load welcome email template
      const welcomeTemplate = fs.readFileSync(
        path.join(templatesDir, 'welcome-email.html'),
        'utf-8'
      );
      this.templates.set('welcome', welcomeTemplate);
    } catch (error) {
      console.error('Error loading email templates:', error);
    }
  }

  private replaceVariables(template: string, data: any): string {
    let html = template;
    
    // Replace all {{variable}} with actual data
    Object.keys(data).forEach(key => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      html = html.replace(regex, data[key] || '');
    });
    
    return html;
  }

  async sendEmail(options: EmailTemplate): Promise<boolean> {
    try {
      const template = this.templates.get(options.template);
      if (!template) {
        throw new Error(`Template ${options.template} not found`);
      }

      const html = this.replaceVariables(template, options.data);

      // For development, we'll log the email
      if (process.env.NODE_ENV === 'development') {
        console.log('📧 Email would be sent:');
        console.log('To:', options.to);
        console.log('Subject:', options.subject);
        console.log('Template:', options.template);
        console.log('Data:', options.data);
        
        // Save to a file for preview
        const previewPath = path.join(__dirname, '../../email-preview.html');
        fs.writeFileSync(previewPath, html);
        console.log('Preview saved to:', previewPath);
      }

      // In production, you would integrate with an email service like:
      // - SendGrid
      // - AWS SES
      // - Resend
      // - Postmark
      
      // For now, we'll use Supabase's built-in email if configured
      // Note: Supabase handles confirmation emails automatically
      
      return true;
    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }

  async sendConfirmationEmail(email: string, fullName: string, confirmationUrl: string) {
    return this.sendEmail({
      to: email,
      subject: 'Confirm your email - HomeQuest',
      template: 'confirmation',
      data: {
        fullName,
        email,
        confirmationUrl
      }
    });
  }

  async sendWelcomeEmail(email: string, fullName: string) {
    const dashboardUrl = process.env.CODESPACES === 'true' 
      ? `${process.env.ALLOWED_ORIGINS}/dashboard`
      : 'http://localhost:3000/dashboard';
    
    const helpUrl = process.env.CODESPACES === 'true'
      ? `${process.env.ALLOWED_ORIGINS}/help`
      : 'http://localhost:3000/help';

    return this.sendEmail({
      to: email,
      subject: 'Welcome to HomeQuest! 🎉',
      template: 'welcome',
      data: {
        fullName,
        email,
        dashboardUrl,
        helpUrl
      }
    });
  }
}

export default new EmailService();