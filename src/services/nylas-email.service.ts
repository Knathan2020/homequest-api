/**
 * Nylas Email Service - Unified Email System
 * Replaces scattered OAuth and provides AI document sending
 */

import Nylas from 'nylas';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Initialize database tables on first run
const initializeTables = async () => {
  try {
    // Simply try to create the table if it doesn't exist
    const { error } = await supabase.from('user_email_accounts').select('count', { count: 'exact', head: true });

    if (error && error.code === '42P01') {
      console.log('📧 Creating user_email_accounts table...');

      // Create the table structure manually
      await supabase.rpc('exec', {
        sql: `
          CREATE TABLE user_email_accounts (
            id VARCHAR(255) PRIMARY KEY,
            user_id VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL,
            provider VARCHAR(20) NOT NULL CHECK (provider IN ('gmail', 'outlook')),
            grant_id VARCHAR(255) NOT NULL UNIQUE,
            is_active BOOLEAN DEFAULT true,
            connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            last_sync TIMESTAMP WITH TIME ZONE,
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
          );
        `
      });
      console.log('✅ user_email_accounts table created');
    }
  } catch (error) {
    // Table will be created manually or already exists
    console.log('📧 Nylas email service ready - table will be created as needed');
  }
};

// Initialize on import
initializeTables();

const nylas = new Nylas({
  apiKey: process.env.NYLAS_API_KEY || 'nyk_v0_4ISIfsspwyWvUVZMxKo4FEVEMyO5AC0N4nAhmVdONxi9BoCnnSfF1hV9lBOV6CWj',
  apiUri: process.env.NYLAS_API_URI || 'https://api.us.nylas.com'
});

export interface EmailAccount {
  id: string;
  userId: string;
  email: string;
  provider: 'gmail' | 'outlook';
  grantId: string;
  isActive: boolean;
  connectedAt: Date;
}

export interface SendDocumentRequest {
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  message: string;
  documentId?: string; // From your documents table
  documentPath?: string; // Direct file path
  documentName?: string;
}

export interface EmailMessage {
  id: string;
  threadId: string;
  from: string;
  to: string[];
  subject: string;
  body: string;
  date: Date;
  isRead: boolean;
  attachments: any[];
}

class NylasEmailService {

  /**
   * Get connected email accounts for a user
   */
  async getUserAccounts(userId: string): Promise<EmailAccount[]> {
    try {
      const { data, error } = await supabase
        .from('user_email_accounts')
        .select('id, user_id, email, provider, grant_id, is_active, connected_at')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error) throw error;

      // Map database fields to TypeScript interface
      const dbAccounts = (data || []).map(row => ({
        id: row.id,
        userId: row.user_id,
        email: row.email,
        provider: row.provider,
        grantId: row.grant_id, // Map snake_case to camelCase
        isActive: row.is_active,
        connectedAt: new Date(row.connected_at)
      }));

      return dbAccounts;
    } catch (error) {
      console.error('Failed to get user accounts:', error);
      return [];
    }
  }

  /**
   * Connect new email account (Step 1: Get OAuth URL)
   */
  async getAuthUrl(provider: 'gmail' | 'outlook', userId: string): Promise<string> {
    try {
      // Use our custom callback endpoint that's configured in Google OAuth
      const redirectUri = `https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev/api/nylas/callback`;
      const clientId = process.env.NYLAS_CLIENT_ID;

      console.log('📧 Nylas OAuth Config:', {
        clientId: clientId ? `${clientId.substring(0, 8)}...` : 'MISSING',
        provider: provider === 'gmail' ? 'google' : 'microsoft',
        redirectUri,
        hasApiKey: !!process.env.NYLAS_API_KEY,
        hasClientSecret: !!process.env.NYLAS_CLIENT_SECRET
      });

      if (!clientId) {
        throw new Error('NYLAS_CLIENT_ID environment variable is not set');
      }

      const oauthConfig = {
        clientId,
        provider: provider === 'gmail' ? 'google' : 'microsoft',
        redirectUri,
        scope: this.getScopes(provider),
        state: JSON.stringify({ userId, provider }),
        accessType: 'offline',  // Force offline access for refresh tokens
        ...(provider === 'outlook' && {
          prompt: 'consent',  // Force consent screen for Microsoft
          responseType: 'code'  // Explicitly request authorization code
        })
      };

      console.log('🔥 OAuth Config:', JSON.stringify(oauthConfig, null, 2));

      const authUrl = nylas.auth.urlForOAuth2(oauthConfig);

      console.log('📧 Generated OAuth URL:', authUrl);
      return authUrl;
    } catch (error) {
      console.error('Failed to generate auth URL:', error);
      throw new Error('Failed to generate authentication URL');
    }
  }

  /**
   * Handle OAuth callback (Step 2: Exchange code for grant)
   */
  async handleCallback(code: string, state: string): Promise<EmailAccount> {
    try {
      const { userId, provider } = JSON.parse(state);

      console.log('🔥 EXCHANGING CODE FOR TOKEN:', {
        clientId: process.env.NYLAS_CLIENT_ID,
        hasClientSecret: !!process.env.NYLAS_CLIENT_SECRET,
        code: code ? `${code.substring(0, 20)}...` : 'MISSING',
        provider,
        userId
      });

      const grant = await nylas.auth.exchangeCodeForToken({
        clientSecret: process.env.NYLAS_CLIENT_SECRET || '',
        clientId: process.env.NYLAS_CLIENT_ID || '',
        redirectUri: `https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev/api/nylas/callback`,
        code
      });

      console.log('🔥 GRANT RESPONSE RECEIVED:', {
        grantId: grant.grantId,
        id: grant.id,
        email: grant.email,
        fullResponse: JSON.stringify(grant, null, 2)
      });

      // Store account in database
      const account: EmailAccount = {
        id: `${userId}-${provider}`,
        userId,
        email: grant.email || '',
        provider,
        grantId: grant.grantId || grant.id, // Use the correct property
        isActive: true,
        connectedAt: new Date()
      };

      await this.saveAccount(account);

      console.log(`✅ Connected ${provider} account: ${grant.email} for user ${userId} with grantId: ${account.grantId}`);
      return account;
    } catch (error) {
      console.error('OAuth callback failed:', error);
      throw new Error('Failed to connect email account');
    }
  }

  /**
   * Send document via email
   */
  async sendDocument(request: SendDocumentRequest, userId: string, preferredProvider?: 'gmail' | 'outlook'): Promise<boolean> {
    try {
      // Get user's active email account
      const accounts = await this.getUserAccounts(userId);
      let account = accounts.find(acc => acc.provider === preferredProvider) || accounts[0];

      if (!account) {
        throw new Error('No connected email account found. Please connect Gmail or Outlook first.');
      }

      // Get document data
      let documentBuffer: Buffer;
      let documentName: string;

      if (request.documentId) {
        // Get document from database
        const { data: doc, error } = await supabase
          .from('documents')
          .select('*')
          .eq('id', request.documentId)
          .single();

        if (error || !doc) throw new Error('Document not found');

        documentBuffer = await this.readFile(doc.file_path);
        documentName = doc.original_name || doc.name;
      } else if (request.documentPath) {
        // Use direct file path
        documentBuffer = await this.readFile(request.documentPath);
        documentName = request.documentName || path.basename(request.documentPath);
      } else {
        throw new Error('Either documentId or documentPath is required');
      }

      // Send email with attachment
      await nylas.messages.send({
        identifier: account.grantId,
        requestBody: {
          to: request.to.map(email => ({ email })),
          cc: request.cc?.map(email => ({ email })),
          bcc: request.bcc?.map(email => ({ email })),
          subject: request.subject,
          body: request.message,
          attachments: [{
            filename: documentName,
            content: documentBuffer.toString('base64'),
            contentType: this.getContentType(documentName)
          }]
        }
      });

      console.log(`📧 Document sent: ${documentName} to ${request.to.join(', ')} via ${account.provider}`);
      return true;

    } catch (error) {
      console.error('Failed to send document:', error);
      return false;
    }
  }

  /**
   * Read emails from connected account
   */
  async getEmails(userId: string, limit: number = 20): Promise<EmailMessage[]> {
    try {
      const accounts = await this.getUserAccounts(userId);
      if (accounts.length === 0) return [];

      const account = accounts[0]; // Use first account for now

      console.log('📧 Getting emails for account:', {
        userId,
        accountId: account.id,
        grantId: account.grantId,
        email: account.email
      });

      // Fix Nylas SDK parameter structure
      try {
        const messages = await nylas.messages.list({
          identifier: account.grantId,
          queryParams: {
            limit: limit
          }
        });
        console.log('✅ Nylas messages API call successful, got', messages.data?.length, 'messages');
        return messages.data.map(msg => ({
          id: msg.id,
          threadId: msg.threadId || '',
          from: msg.from?.[0]?.email || '',
          fromEmail: msg.from?.[0]?.email || '',
          fromName: msg.from?.[0]?.name || msg.from?.[0]?.email || '',
          to: msg.to?.map(t => t.email) || [],
          subject: msg.subject || '',
          body: msg.body || '',
          bodyText: msg.body || '',
          bodyHtml: msg.body || '',
          folder: msg.folders?.[0] || 'inbox',
          category: null,
          priority: null,
          status: msg.unread ? 'unread' : 'read',
          aiProcessed: false,
          aiSummary: null,
          aiExtractedData: null,
          aiSuggestedResponse: null,
          requiresAction: false,
          isStarred: msg.starred || false,
          isImportant: false, // Nylas doesn't have direct importance flag
          isRead: !msg.unread,
          readAt: null,
          readBy: null,
          attachments: msg.attachments || [],
          sentDate: new Date(msg.date * 1000).toISOString(),
          receivedDate: new Date(msg.date * 1000).toISOString(),
          date: new Date(msg.date * 1000)
        }));
      } catch (nylasError) {
        console.error('❌ Nylas API error:', nylasError);
        // Return empty array for now
        return [];
      }

    } catch (error) {
      console.error('Failed to get emails:', error);
      return [];
    }
  }

  /**
   * Send regular email (no attachments)
   */
  async sendEmail(
    to: string[],
    subject: string,
    body: string,
    userId: string,
    cc?: string[],
    bcc?: string[]
  ): Promise<boolean> {
    try {
      const accounts = await this.getUserAccounts(userId);
      if (accounts.length === 0) throw new Error('No connected email account');

      const account = accounts[0];

      await nylas.messages.send({
        identifier: account.grantId,
        requestBody: {
          to: to.map(email => ({ email })),
          cc: cc?.map(email => ({ email })),
          bcc: bcc?.map(email => ({ email })),
          subject,
          body
        }
      });

      return true;
    } catch (error) {
      console.error('Failed to send email:', error);
      return false;
    }
  }

  /**
   * Mark email as read
   */
  async markAsRead(messageId: string, userId: string): Promise<boolean> {
    try {
      const accounts = await this.getUserAccounts(userId);
      if (accounts.length === 0) throw new Error('No connected email account');

      const account = accounts[0];

      await nylas.messages.update({
        identifier: account.grantId,
        messageId: messageId,
        requestBody: {
          unread: false
        }
      });

      console.log(`✅ Marked email ${messageId} as read`);
      return true;
    } catch (error) {
      console.error('Failed to mark email as read:', error);
      return false;
    }
  }

  /**
   * Mark email as unread
   */
  async markAsUnread(messageId: string, userId: string): Promise<boolean> {
    try {
      const accounts = await this.getUserAccounts(userId);
      if (accounts.length === 0) throw new Error('No connected email account');

      const account = accounts[0];

      await nylas.messages.update({
        identifier: account.grantId,
        messageId: messageId,
        requestBody: {
          unread: true
        }
      });

      console.log(`✅ Marked email ${messageId} as unread`);
      return true;
    } catch (error) {
      console.error('Failed to mark email as unread:', error);
      return false;
    }
  }

  // Private helper methods
  private async saveAccount(account: EmailAccount): Promise<void> {
    const { error } = await supabase
      .from('user_email_accounts')
      .upsert({
        id: account.id,
        user_id: account.userId,
        email: account.email,
        provider: account.provider,
        grant_id: account.grantId,
        is_active: account.isActive,
        connected_at: account.connectedAt.toISOString()
      });

    if (error) {
      console.error('Failed to save account:', error);
      throw error;
    }
  }

  private async readFile(filePath: string): Promise<Buffer> {
    const fullPath = filePath.startsWith('/uploads/')
      ? path.join(process.cwd(), filePath.replace('/uploads/', 'uploads/'))
      : filePath;

    return fs.promises.readFile(fullPath);
  }

  private getContentType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase();
    const types: Record<string, string> = {
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'txt': 'text/plain',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'csv': 'text/csv',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    };
    return types[ext || ''] || 'application/octet-stream';
  }

  private getScopes(provider: 'gmail' | 'outlook'): string[] {
    if (provider === 'gmail') {
      return [
        'https://www.googleapis.com/auth/gmail.send',
        'https://www.googleapis.com/auth/gmail.readonly'
      ];
    } else {
      // Microsoft - ONLY offline_access to force refresh token
      // Let Nylas handle the mail permissions automatically
      return [
        'offline_access'
      ];
    }
  }
}

export default new NylasEmailService();