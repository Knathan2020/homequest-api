const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');

// Create Supabase client
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

// Simple OAuth service without MSAL (which was causing the error)
const oauthService = {
  getGmailAuthUrl(state) {
    const params = new URLSearchParams({
      client_id: process.env.GMAIL_CLIENT_ID,
      redirect_uri: process.env.GMAIL_REDIRECT_URI || 'https://cuddly-giggle-69p59v4xv5gw2rvw7-4001.app.github.dev/api/auth/gmail/callback',
      scope: 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send',
      response_type: 'code',
      access_type: 'offline',
      state: state,
      prompt: 'consent'
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },
  
  async getOutlookAuthUrl(state) {
    const params = new URLSearchParams({
      client_id: process.env.OUTLOOK_CLIENT_ID,
      redirect_uri: process.env.OUTLOOK_REDIRECT_URI || 'https://cuddly-giggle-69p59v4xv5gw2rvw7-4001.app.github.dev/api/auth/outlook/callback',
      scope: 'https://graph.microsoft.com/Mail.Read https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read',
      response_type: 'code',
      state: state
    });
    return `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  },

  async getGmailTokens(code) {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.GMAIL_CLIENT_ID,
        client_secret: process.env.GMAIL_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.GMAIL_REDIRECT_URI || 'https://cuddly-giggle-69p59v4xv5gw2rvw7-4001.app.github.dev/api/auth/gmail/callback'
      })
    });
    
    const tokens = await response.json();
    if (!response.ok) throw new Error(tokens.error_description || 'Token exchange failed');
    
    // Get user info
    const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const userInfo = await userResponse.json();
    
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiry: Date.now() + (tokens.expires_in * 1000),
      email: userInfo.email
    };
  },

  async getOutlookTokens(code) {
    const response = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.OUTLOOK_CLIENT_ID,
        client_secret: process.env.OUTLOOK_CLIENT_SECRET,
        code,
        grant_type: 'authorization_code',
        redirect_uri: process.env.OUTLOOK_REDIRECT_URI || 'https://cuddly-giggle-69p59v4xv5gw2rvw7-4001.app.github.dev/api/auth/outlook/callback'
      })
    });
    
    const tokens = await response.json();
    if (!response.ok) throw new Error(tokens.error_description || 'Token exchange failed');
    
    // Get user info
    const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const userInfo = await userResponse.json();
    
    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiry: Date.now() + (tokens.expires_in * 1000),
      email: userInfo.mail || userInfo.userPrincipalName
    };
  }
};

// Gmail OAuth Routes
router.get('/auth/gmail', async (req, res) => {
  try {
    // Generate state token for security
    const state = jwt.sign(
      { userId: req.user?.id, timestamp: Date.now() },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );
    
    const authUrl = oauthService.getGmailAuthUrl(state);
    res.json({ authUrl });
  } catch (error) {
    console.error('Gmail auth error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/auth/gmail/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    // Verify state token
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    
    // Exchange code for tokens
    const tokens = await oauthService.getGmailTokens(code);
    
    // Save to database
    const { data, error } = await supabase
      .from('email_accounts')
      .upsert({
        user_id: decoded.userId,
        provider: 'gmail',
        email_address: tokens.email,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_expiry: new Date(tokens.expiry).toISOString(),
        connected_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Show success page and close popup
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Gmail Connected Successfully</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
          .success { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; margin: 0 auto; }
          .checkmark { color: #4CAF50; font-size: 48px; margin-bottom: 20px; }
          h1 { color: #333; margin-bottom: 10px; }
          p { color: #666; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="success">
          <div class="checkmark">✓</div>
          <h1>Gmail Connected!</h1>
          <p>Your Gmail account has been successfully connected to the email server.</p>
          <p>This window will close automatically...</p>
        </div>
        <script>
          // Store result in localStorage for parent window to read
          try {
            localStorage.setItem('oauth_result', JSON.stringify({
              type: 'oauth_success', 
              provider: 'gmail',
              timestamp: Date.now()
            }));
          } catch (e) {
            console.log('localStorage not available', e);
          }

          setTimeout(() => {
            try {
              // Try multiple communication methods
              const message = {type: 'oauth_success', provider: 'gmail'};
              
              // Method 1: postMessage to opener
              if (window.opener && !window.opener.closed) {
                window.opener.postMessage(message, '*');
                setTimeout(() => window.close(), 500);
                return;
              }
              
              // Method 2: postMessage to parent
              if (window.parent && window.parent !== window) {
                window.parent.postMessage(message, '*');
                return;
              }
              
              // Method 3: Close and let parent poll localStorage
              window.close();
              
            } catch (e) {
              console.log('All popup communication methods failed, redirecting...', e);
              // Fallback: redirect to main app
              window.location.href = '${process.env.FRONTEND_URL}/settings/email?connected=gmail';
            }
          }, 1500);
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Gmail callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/settings/email?error=connection_failed`);
  }
});

// Outlook OAuth Routes
router.get('/auth/outlook', async (req, res) => {
  try {
    const state = jwt.sign(
      { userId: req.user?.id, timestamp: Date.now() },
      process.env.JWT_SECRET,
      { expiresIn: '10m' }
    );
    
    const authUrl = await oauthService.getOutlookAuthUrl(state);
    res.json({ authUrl });
  } catch (error) {
    console.error('Outlook auth error:', error);
    res.status(500).json({ error: error.message });
  }
});

router.get('/auth/outlook/callback', async (req, res) => {
  try {
    const { code, state } = req.query;
    
    // Verify state token
    const decoded = jwt.verify(state, process.env.JWT_SECRET);
    
    // Exchange code for tokens
    const tokens = await oauthService.getOutlookTokens(code);
    
    // Save to database
    const { data, error } = await supabase
      .from('email_accounts')
      .upsert({
        user_id: decoded.userId,
        provider: 'outlook',
        email_address: tokens.email,
        access_token: tokens.accessToken,
        refresh_token: tokens.refreshToken,
        token_expiry: new Date(tokens.expiry).toISOString(),
        connected_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Show success page and close popup
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Outlook Connected Successfully</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
          .success { background: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 400px; margin: 0 auto; }
          .checkmark { color: #0078d4; font-size: 48px; margin-bottom: 20px; }
          h1 { color: #333; margin-bottom: 10px; }
          p { color: #666; margin-bottom: 20px; }
        </style>
      </head>
      <body>
        <div class="success">
          <div class="checkmark">✓</div>
          <h1>Outlook Connected!</h1>
          <p>Your Outlook account has been successfully connected to the email server.</p>
          <p>This window will close automatically...</p>
        </div>
        <script>
          // Store result in localStorage for parent window to read
          try {
            localStorage.setItem('oauth_result', JSON.stringify({
              type: 'oauth_success', 
              provider: 'outlook',
              timestamp: Date.now()
            }));
          } catch (e) {
            console.log('localStorage not available', e);
          }

          setTimeout(() => {
            try {
              // Try multiple communication methods
              const message = {type: 'oauth_success', provider: 'outlook'};
              
              // Method 1: postMessage to opener
              if (window.opener && !window.opener.closed) {
                window.opener.postMessage(message, '*');
                setTimeout(() => window.close(), 500);
                return;
              }
              
              // Method 2: postMessage to parent
              if (window.parent && window.parent !== window) {
                window.parent.postMessage(message, '*');
                return;
              }
              
              // Method 3: Close and let parent poll localStorage
              window.close();
              
            } catch (e) {
              console.log('All popup communication methods failed, redirecting...', e);
              // Fallback: redirect to main app
              window.location.href = '${process.env.FRONTEND_URL}/settings/email?connected=outlook';
            }
          }, 1500);
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('Outlook callback error:', error);
    res.redirect(`${process.env.FRONTEND_URL}/settings/email?error=connection_failed`);
  }
});

// Sync emails endpoint
router.post('/sync/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    
    // Get account details
    const { data: account, error } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('id', accountId)
      .single();

    if (error || !account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Check if token needs refresh
    const now = new Date();
    const expiry = new Date(account.token_expiry);
    
    if (expiry <= now) {
      // Refresh token
      let newTokens;
      if (account.provider === 'gmail') {
        newTokens = await oauthService.refreshGmailToken(account.refresh_token);
      } else {
        newTokens = await oauthService.refreshOutlookToken(account.refresh_token);
      }
      
      // Update tokens in database
      await supabase
        .from('email_accounts')
        .update({
          access_token: newTokens.accessToken,
          token_expiry: new Date(newTokens.expiry).toISOString()
        })
        .eq('id', accountId);
      
      account.access_token = newTokens.accessToken;
    }

    // Fetch emails
    let emails;
    if (account.provider === 'gmail') {
      emails = await oauthService.fetchGmailMessages(account.access_token);
    } else {
      emails = await oauthService.fetchOutlookMessages(account.access_token);
    }

    // Store emails in database
    for (const email of emails) {
      await supabase
        .from('emails')
        .upsert({
          account_id: accountId,
          message_id: email.id,
          thread_id: email.threadId || email.conversationId,
          from_email: email.from,
          to_emails: email.to,
          subject: email.subject,
          body_text: email.snippet,
          body_html: email.body,
          received_date: email.date,
          status: 'unread'
        });
    }

    // Update last sync
    await supabase
      .from('email_accounts')
      .update({ last_sync: new Date().toISOString() })
      .eq('id', accountId);

    res.json({ 
      success: true, 
      synced: emails.length,
      lastSync: new Date().toISOString()
    });
  } catch (error) {
    console.error('Sync error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Send email endpoint
router.post('/send', async (req, res) => {
  try {
    const { accountId, to, subject, body, attachments } = req.body;
    
    // Get account details
    const { data: account, error } = await supabase
      .from('email_accounts')
      .select('*')
      .eq('id', accountId)
      .single();

    if (error || !account) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Send email
    let result;
    if (account.provider === 'gmail') {
      result = await oauthService.sendGmailMessage(
        account.access_token,
        to,
        subject,
        body,
        attachments
      );
    } else {
      result = await oauthService.sendOutlookMessage(
        account.access_token,
        to,
        subject,
        body,
        attachments
      );
    }

    // Store sent email
    await supabase
      .from('emails')
      .insert({
        account_id: accountId,
        message_id: result.id || `sent_${Date.now()}`,
        from_email: account.email_address,
        to_emails: Array.isArray(to) ? to : [to],
        subject,
        body_text: body,
        body_html: body,
        status: 'sent',
        sent_date: new Date().toISOString()
      });

    res.json({ success: true, messageId: result.id });
  } catch (error) {
    console.error('Send email error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Disconnect account
router.delete('/account/:accountId', async (req, res) => {
  try {
    const { accountId } = req.params;
    
    const { error } = await supabase
      .from('email_accounts')
      .delete()
      .eq('id', accountId);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error('Disconnect error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;