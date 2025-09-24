/**
 * Microsoft Graph API Service - Direct Outlook Integration
 * Bypasses Nylas for Outlook to get proper refresh tokens
 */

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export interface OutlookAccount {
  id: string;
  userId: string;
  email: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  isActive: boolean;
  connectedAt: Date;
}

export interface GraphEmail {
  id: string;
  subject: string;
  from: { emailAddress: { address: string; name: string } };
  toRecipients: Array<{ emailAddress: { address: string; name: string } }>;
  body: { content: string; contentType: string };
  receivedDateTime: string;
  isRead: boolean;
  hasAttachments: boolean;
  attachments?: any[];
}

class MicrosoftGraphService {
  private readonly clientId = process.env.OUTLOOK_CLIENT_ID;
  private readonly clientSecret = process.env.OUTLOOK_CLIENT_SECRET;
  private readonly redirectUri = `${process.env.APP_URL}/api/nylas/callback`;
  private readonly scopes = [
    'https://graph.microsoft.com/Mail.Read',
    'https://graph.microsoft.com/Mail.Send',
    'offline_access'
  ];

  /**
   * Initialize database table for Outlook accounts
   */
  async initializeTable() {
    try {
      const { error } = await supabase.from('outlook_accounts').select('count', { count: 'exact', head: true });

      if (error && error.code === '42P01') {
        console.log('📧 Creating outlook_accounts table...');

        await supabase.rpc('exec', {
          sql: `
            CREATE TABLE outlook_accounts (
              id VARCHAR(255) PRIMARY KEY,
              user_id VARCHAR(255) NOT NULL,
              email VARCHAR(255) NOT NULL,
              access_token TEXT NOT NULL,
              refresh_token TEXT NOT NULL,
              expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
              is_active BOOLEAN DEFAULT true,
              connected_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
              updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
            );
          `
        });
        console.log('✅ outlook_accounts table created');
      }
    } catch (error) {
      console.log('📧 Microsoft Graph service ready - table will be created as needed');
    }
  }

  /**
   * Get OAuth URL for Microsoft authentication
   */
  getAuthUrl(userId: string): string {
    const params = new URLSearchParams({
      client_id: this.clientId!,
      response_type: 'code',
      redirect_uri: this.redirectUri,
      scope: this.scopes.join(' '),
      state: JSON.stringify({ userId, provider: 'outlook', isDirect: true }),
      prompt: 'consent', // Force consent to ensure refresh token
      access_type: 'offline'
    });

    const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;

    console.log('🔥 MICROSOFT DIRECT OAuth URL:', authUrl);
    return authUrl;
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleCallback(code: string, state: string): Promise<OutlookAccount> {
    try {
      const { userId } = JSON.parse(state);

      console.log('🔥 MICROSOFT DIRECT - Exchanging code for tokens');

      // Exchange authorization code for tokens
      const tokenResponse = await axios.post(
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        new URLSearchParams({
          client_id: this.clientId!,
          client_secret: this.clientSecret!,
          code,
          redirect_uri: this.redirectUri,
          grant_type: 'authorization_code',
          scope: this.scopes.join(' ')
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const tokens = tokenResponse.data;
      console.log('🔥 MICROSOFT TOKENS RECEIVED:', {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
        expiresIn: tokens.expires_in
      });

      if (!tokens.refresh_token) {
        throw new Error('No refresh token received from Microsoft');
      }

      // Get user profile to get email address
      const profileResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });

      const email = profileResponse.data.mail || profileResponse.data.userPrincipalName;
      const expiresAt = new Date(Date.now() + (tokens.expires_in * 1000));

      // Save account to database
      const account: OutlookAccount = {
        id: `${userId}-outlook-direct`,
        userId,
        email,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        isActive: true,
        connectedAt: new Date()
      };

      await this.saveAccount(account);

      console.log(`✅ MICROSOFT DIRECT - Connected Outlook: ${email} for user ${userId}`);
      return account;

    } catch (error) {
      console.error('❌ MICROSOFT DIRECT OAuth callback failed:', error);
      throw new Error('Failed to connect Outlook account via Microsoft Graph');
    }
  }

  /**
   * Get user's Outlook accounts
   */
  async getUserAccounts(userId: string): Promise<OutlookAccount[]> {
    try {
      const { data, error } = await supabase
        .from('outlook_accounts')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (error) throw error;

      return (data || []).map(row => ({
        id: row.id,
        userId: row.user_id,
        email: row.email,
        accessToken: row.access_token,
        refreshToken: row.refresh_token,
        expiresAt: new Date(row.expires_at),
        isActive: row.is_active,
        connectedAt: new Date(row.connected_at)
      }));
    } catch (error) {
      console.error('Failed to get Outlook accounts:', error);
      return [];
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(account: OutlookAccount): Promise<string> {
    try {
      const response = await axios.post(
        'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        new URLSearchParams({
          client_id: this.clientId!,
          client_secret: this.clientSecret!,
          refresh_token: account.refreshToken,
          grant_type: 'refresh_token',
          scope: this.scopes.join(' ')
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      const tokens = response.data;
      const newExpiresAt = new Date(Date.now() + (tokens.expires_in * 1000));

      // Update stored tokens
      await supabase
        .from('outlook_accounts')
        .update({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token || account.refreshToken, // Keep old refresh token if new one not provided
          expires_at: newExpiresAt.toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', account.id);

      console.log('✅ MICROSOFT DIRECT - Access token refreshed');
      return tokens.access_token;

    } catch (error) {
      console.error('❌ Failed to refresh Microsoft access token:', error);
      throw new Error('Failed to refresh access token');
    }
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getValidAccessToken(account: OutlookAccount): Promise<string> {
    // Check if token expires in next 5 minutes
    const fiveMinutesFromNow = new Date(Date.now() + 5 * 60 * 1000);

    if (account.expiresAt <= fiveMinutesFromNow) {
      console.log('🔄 MICROSOFT DIRECT - Token expiring soon, refreshing...');
      return await this.refreshAccessToken(account);
    }

    return account.accessToken;
  }

  /**
   * Get emails from Outlook
   */
  async getEmails(userId: string, limit: number = 20): Promise<any[]> {
    try {
      const accounts = await this.getUserAccounts(userId);
      if (accounts.length === 0) return [];

      const account = accounts[0];
      const accessToken = await this.getValidAccessToken(account);

      console.log('📧 MICROSOFT DIRECT - Getting emails for:', account.email);

      const response = await axios.get(
        `https://graph.microsoft.com/v1.0/me/messages?$top=${limit}&$orderby=receivedDateTime desc`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`
          }
        }
      );

      const emails = response.data.value.map((msg: GraphEmail) => ({
        id: msg.id,
        threadId: msg.id, // Graph API doesn't have thread concept like Gmail
        fromEmail: msg.from?.emailAddress?.address || '',
        fromName: msg.from?.emailAddress?.name || '',
        to: msg.toRecipients?.map(t => t.emailAddress.address) || [],
        subject: msg.subject || '',
        bodyText: msg.body?.content || '',
        bodyHtml: msg.body?.content || '',
        folder: 'inbox',
        category: null,
        priority: null,
        status: msg.isRead ? 'read' : 'unread',
        aiProcessed: false,
        aiSummary: null,
        aiExtractedData: null,
        aiSuggestedResponse: null,
        requiresAction: false,
        isStarred: false,
        isImportant: false,
        isRead: msg.isRead,
        readAt: null,
        readBy: null,
        attachments: msg.attachments || [],
        sentDate: msg.receivedDateTime,
        receivedDate: msg.receivedDateTime,
        date: new Date(msg.receivedDateTime)
      }));

      console.log(`✅ MICROSOFT DIRECT - Retrieved ${emails.length} emails`);
      return emails;

    } catch (error) {
      console.error('❌ MICROSOFT DIRECT - Failed to get emails:', error);
      return [];
    }
  }

  /**
   * Send email via Microsoft Graph
   */
  async sendEmail(
    userId: string,
    to: string[],
    subject: string,
    body: string,
    cc?: string[],
    bcc?: string[]
  ): Promise<boolean> {
    try {
      const accounts = await this.getUserAccounts(userId);
      if (accounts.length === 0) throw new Error('No Outlook account connected');

      const account = accounts[0];
      const accessToken = await this.getValidAccessToken(account);

      const message = {
        subject,
        body: {
          contentType: 'html',
          content: body
        },
        toRecipients: to.map(email => ({
          emailAddress: { address: email }
        })),
        ccRecipients: cc?.map(email => ({
          emailAddress: { address: email }
        })) || [],
        bccRecipients: bcc?.map(email => ({
          emailAddress: { address: email }
        })) || []
      };

      await axios.post(
        'https://graph.microsoft.com/v1.0/me/sendMail',
        { message },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`✅ MICROSOFT DIRECT - Email sent to ${to.join(', ')}`);
      return true;

    } catch (error) {
      console.error('❌ MICROSOFT DIRECT - Failed to send email:', error);
      return false;
    }
  }

  /**
   * Mark email as read
   */
  async markAsRead(userId: string, messageId: string): Promise<boolean> {
    try {
      const accounts = await this.getUserAccounts(userId);
      if (accounts.length === 0) throw new Error('No Outlook account connected');

      const account = accounts[0];
      const accessToken = await this.getValidAccessToken(account);

      await axios.patch(
        `https://graph.microsoft.com/v1.0/me/messages/${messageId}`,
        { isRead: true },
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      console.log(`✅ MICROSOFT DIRECT - Marked email ${messageId} as read`);
      return true;

    } catch (error) {
      console.error('❌ MICROSOFT DIRECT - Failed to mark email as read:', error);
      return false;
    }
  }

  // Private helper methods
  private async saveAccount(account: OutlookAccount): Promise<void> {
    const { error } = await supabase
      .from('outlook_accounts')
      .upsert({
        id: account.id,
        user_id: account.userId,
        email: account.email,
        access_token: account.accessToken,
        refresh_token: account.refreshToken,
        expires_at: account.expiresAt.toISOString(),
        is_active: account.isActive,
        connected_at: account.connectedAt.toISOString()
      });

    if (error) {
      console.error('Failed to save Outlook account:', error);
      throw error;
    }
  }
}

export default new MicrosoftGraphService();