const { google } = require('googleapis');
const { ConfidentialClientApplication } = require('@azure/msal-node');

// Gmail OAuth Configuration
const GMAIL_CONFIG = {
  clientId: process.env.GMAIL_CLIENT_ID,
  clientSecret: process.env.GMAIL_CLIENT_SECRET,
  redirectUri: process.env.GMAIL_REDIRECT_URI || 'http://localhost:4000/api/auth/gmail/callback',
  scopes: [
    'https://www.googleapis.com/auth/gmail.readonly',
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/gmail.compose',
    'https://www.googleapis.com/auth/gmail.modify',
    'https://mail.google.com/'
  ]
};

// Outlook OAuth Configuration
const OUTLOOK_CONFIG = {
  auth: {
    clientId: process.env.OUTLOOK_CLIENT_ID,
    authority: 'https://login.microsoftonline.com/common',
    clientSecret: process.env.OUTLOOK_CLIENT_SECRET
  },
  system: {
    loggerOptions: {
      loggerCallback(loglevel, message, containsPii) {
        if (!containsPii) {
          console.log(message);
        }
      },
      piiLoggingEnabled: false,
      logLevel: 3
    }
  },
  scopes: [
    'https://graph.microsoft.com/Mail.Read',
    'https://graph.microsoft.com/Mail.Send',
    'https://graph.microsoft.com/Mail.ReadWrite',
    'https://graph.microsoft.com/User.Read'
  ]
};

class OAuthService {
  constructor() {
    // Initialize Gmail OAuth2 client
    this.gmailOAuth2Client = new google.auth.OAuth2(
      GMAIL_CONFIG.clientId,
      GMAIL_CONFIG.clientSecret,
      GMAIL_CONFIG.redirectUri
    );

    // Initialize Outlook MSAL client
    this.outlookClient = new ConfidentialClientApplication(OUTLOOK_CONFIG.auth);
  }

  // Gmail OAuth Methods
  getGmailAuthUrl(state) {
    return this.gmailOAuth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: GMAIL_CONFIG.scopes,
      state: state,
      prompt: 'consent'
    });
  }

  async getGmailTokens(code) {
    try {
      const { tokens } = await this.gmailOAuth2Client.getToken(code);
      this.gmailOAuth2Client.setCredentials(tokens);
      
      // Get user info
      const oauth2 = google.oauth2({
        auth: this.gmailOAuth2Client,
        version: 'v2'
      });
      
      const { data } = await oauth2.userinfo.get();
      
      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiry: tokens.expiry_date,
        email: data.email,
        name: data.name
      };
    } catch (error) {
      console.error('Error getting Gmail tokens:', error);
      throw error;
    }
  }

  async refreshGmailToken(refreshToken) {
    try {
      this.gmailOAuth2Client.setCredentials({
        refresh_token: refreshToken
      });
      
      const { credentials } = await this.gmailOAuth2Client.refreshAccessToken();
      
      return {
        accessToken: credentials.access_token,
        expiry: credentials.expiry_date
      };
    } catch (error) {
      console.error('Error refreshing Gmail token:', error);
      throw error;
    }
  }

  // Outlook OAuth Methods
  getOutlookAuthUrl(state) {
    const authCodeUrlParameters = {
      scopes: OUTLOOK_CONFIG.scopes,
      redirectUri: process.env.OUTLOOK_REDIRECT_URI || 'http://localhost:4000/api/auth/outlook/callback',
      state: state
    };

    return this.outlookClient.getAuthCodeUrl(authCodeUrlParameters);
  }

  async getOutlookTokens(code) {
    try {
      const tokenRequest = {
        code: code,
        scopes: OUTLOOK_CONFIG.scopes,
        redirectUri: process.env.OUTLOOK_REDIRECT_URI || 'http://localhost:4000/api/auth/outlook/callback'
      };

      const response = await this.outlookClient.acquireTokenByCode(tokenRequest);
      
      return {
        accessToken: response.accessToken,
        refreshToken: response.account.idTokenClaims.preferred_username,
        expiry: response.expiresOn,
        email: response.account.username,
        name: response.account.name
      };
    } catch (error) {
      console.error('Error getting Outlook tokens:', error);
      throw error;
    }
  }

  async refreshOutlookToken(refreshToken) {
    try {
      const refreshTokenRequest = {
        refreshToken: refreshToken,
        scopes: OUTLOOK_CONFIG.scopes
      };

      const response = await this.outlookClient.acquireTokenByRefreshToken(refreshTokenRequest);
      
      return {
        accessToken: response.accessToken,
        expiry: response.expiresOn
      };
    } catch (error) {
      console.error('Error refreshing Outlook token:', error);
      throw error;
    }
  }

  // Gmail API Methods
  async fetchGmailMessages(accessToken, query = '') {
    try {
      this.gmailOAuth2Client.setCredentials({
        access_token: accessToken
      });

      const gmail = google.gmail({ version: 'v1', auth: this.gmailOAuth2Client });
      
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 50
      });

      const messages = [];
      
      for (const message of response.data.messages || []) {
        const fullMessage = await gmail.users.messages.get({
          userId: 'me',
          id: message.id
        });
        messages.push(this.parseGmailMessage(fullMessage.data));
      }

      return messages;
    } catch (error) {
      console.error('Error fetching Gmail messages:', error);
      throw error;
    }
  }

  async sendGmailMessage(accessToken, to, subject, body, attachments = []) {
    try {
      this.gmailOAuth2Client.setCredentials({
        access_token: accessToken
      });

      const gmail = google.gmail({ version: 'v1', auth: this.gmailOAuth2Client });
      
      const message = this.createMimeMessage(to, subject, body, attachments);
      
      const response = await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
        }
      });

      return response.data;
    } catch (error) {
      console.error('Error sending Gmail message:', error);
      throw error;
    }
  }

  // Outlook API Methods
  async fetchOutlookMessages(accessToken, query = '') {
    try {
      const response = await fetch('https://graph.microsoft.com/v1.0/me/messages' + (query ? `?$search="${query}"` : ''), {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Outlook API error: ${response.status}`);
      }

      const data = await response.json();
      return data.value.map(this.parseOutlookMessage);
    } catch (error) {
      console.error('Error fetching Outlook messages:', error);
      throw error;
    }
  }

  async sendOutlookMessage(accessToken, to, subject, body, attachments = []) {
    try {
      const message = {
        message: {
          subject: subject,
          body: {
            contentType: 'HTML',
            content: body
          },
          toRecipients: Array.isArray(to) ? to.map(email => ({
            emailAddress: { address: email }
          })) : [{
            emailAddress: { address: to }
          }]
        }
      };

      const response = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(message)
      });

      if (!response.ok) {
        throw new Error(`Outlook API error: ${response.status}`);
      }

      return { success: true };
    } catch (error) {
      console.error('Error sending Outlook message:', error);
      throw error;
    }
  }

  // Helper Methods
  parseGmailMessage(message) {
    const headers = message.payload.headers;
    const getHeader = (name) => headers.find(h => h.name === name)?.value || '';

    return {
      id: message.id,
      threadId: message.threadId,
      from: getHeader('From'),
      to: getHeader('To').split(',').map(e => e.trim()),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      snippet: message.snippet,
      body: this.getGmailBody(message.payload),
      attachments: this.getGmailAttachments(message.payload)
    };
  }

  parseOutlookMessage(message) {
    return {
      id: message.id,
      conversationId: message.conversationId,
      from: message.from?.emailAddress?.address || '',
      to: message.toRecipients?.map(r => r.emailAddress.address) || [],
      subject: message.subject,
      date: message.receivedDateTime,
      snippet: message.bodyPreview,
      body: message.body?.content || '',
      attachments: message.attachments?.map(a => ({
        id: a.id,
        name: a.name,
        size: a.size,
        contentType: a.contentType
      })) || []
    };
  }

  getGmailBody(payload) {
    let body = '';
    
    if (payload.body?.data) {
      body = Buffer.from(payload.body.data, 'base64').toString();
    } else if (payload.parts) {
      for (const part of payload.parts) {
        if (part.mimeType === 'text/html' && part.body?.data) {
          body = Buffer.from(part.body.data, 'base64').toString();
          break;
        } else if (part.mimeType === 'text/plain' && part.body?.data && !body) {
          body = Buffer.from(part.body.data, 'base64').toString();
        }
      }
    }
    
    return body;
  }

  getGmailAttachments(payload) {
    const attachments = [];
    
    const processparts = (parts) => {
      if (!parts) return;
      
      for (const part of parts) {
        if (part.filename && part.body?.attachmentId) {
          attachments.push({
            id: part.body.attachmentId,
            name: part.filename,
            size: part.body.size,
            mimeType: part.mimeType
          });
        }
        
        if (part.parts) {
          processParts(part.parts);
        }
      }
    };
    
    processParts(payload.parts);
    return attachments;
  }

  createMimeMessage(to, subject, body, attachments) {
    const boundary = '----=_Part_' + Date.now();
    const toAddresses = Array.isArray(to) ? to.join(', ') : to;
    
    let message = [
      `To: ${toAddresses}`,
      `Subject: ${subject}`,
      'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      `--${boundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      'Content-Transfer-Encoding: 7bit',
      '',
      body
    ];

    // Add attachments if any
    for (const attachment of attachments) {
      message.push(
        `--${boundary}`,
        `Content-Type: ${attachment.mimeType}; name="${attachment.name}"`,
        'Content-Transfer-Encoding: base64',
        `Content-Disposition: attachment; filename="${attachment.name}"`,
        '',
        attachment.data
      );
    }

    message.push(`--${boundary}--`);
    
    return message.join('\r\n');
  }
}

module.exports = new OAuthService();