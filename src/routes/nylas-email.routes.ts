/**
 * Nylas Email Routes - Clean API for email operations
 * Replaces scattered email OAuth endpoints
 */

import express, { Request, Response } from 'express';
import nylasEmailService from '../services/nylas-email.service';

const router = express.Router();

// Interface for requests
interface AuthRequest extends Request {
  query: {
    userId: string;
    provider: 'gmail' | 'outlook';
  };
}

interface CallbackRequest extends Request {
  query: {
    code: string;
    state: string;
  };
}

interface SendDocumentRequest extends Request {
  body: {
    userId: string;
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    message: string;
    documentId?: string;
    documentPath?: string;
    documentName?: string;
    preferredProvider?: 'gmail' | 'outlook';
  };
}

/**
 * @route   GET /api/nylas/accounts/:userId
 * @desc    Get connected email accounts for user
 * @access  Public
 */
router.get('/accounts/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const accounts = await nylasEmailService.getUserAccounts(userId);

    res.json({
      success: true,
      accounts,
      count: accounts.length
    });
  } catch (error) {
    console.error('Get accounts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get email accounts'
    });
  }
});

/**
 * @route   GET /api/nylas/auth/:provider
 * @desc    Get OAuth URL for connecting email account
 * @access  Public
 */
router.get('/auth/:provider', async (req: AuthRequest, res: Response) => {
  try {
    const { provider } = req.params as { provider: 'gmail' | 'outlook' };
    const { userId } = req.query;

    console.log('🔥 OAUTH REQUEST:', { provider, userId, query: req.query });

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const authUrl = await nylasEmailService.getAuthUrl(provider, userId);
    console.log('🔥 OAUTH URL GENERATED:', authUrl);

    res.json({
      success: true,
      authUrl,
      provider
    });
  } catch (error) {
    console.error('Auth URL error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate authentication URL'
    });
  }
});

/**
 * @route   GET /api/nylas/callback
 * @desc    Handle OAuth callback from Gmail/Outlook
 * @access  Public
 */
router.get('/callback', async (req: CallbackRequest, res: Response) => {
  try {
    console.log('🔥 OAUTH CALLBACK RECEIVED:', {
      query: req.query,
      headers: req.headers,
      timestamp: new Date().toISOString()
    });

    const { code, state, error, error_description } = req.query;

    // Check if this is a Microsoft Direct OAuth callback
    if (state) {
      try {
        const parsedState = JSON.parse(state as string);
        if (parsedState.provider === 'outlook' && parsedState.isDirect) {
          console.log('🔥 MICROSOFT DIRECT CALLBACK - Redirecting to Microsoft handler');
          // Import and handle with Microsoft service
          const microsoftGraphService = (await import('../services/microsoft-graph.service')).default;
          const account = await microsoftGraphService.handleCallback(code as string, state as string);

          return res.send(`
            <html>
              <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                <h2>✅ Outlook Connected Successfully!</h2>
                <p>Your Outlook account (${account.email}) has been connected via Microsoft Graph Direct.</p>
                <p><strong>Please close this window.</strong></p>
                <script>
                  console.log('🔥 MICROSOFT DIRECT SUCCESS:', ${JSON.stringify(account)});
                  if (window.opener) {
                    window.opener.postMessage({
                      type: 'MICROSOFT_DIRECT_AUTH_SUCCESS',
                      account: ${JSON.stringify(account)}
                    }, '*');
                  }
                </script>
              </body>
            </html>
          `);
        }
      } catch (parseError) {
        console.log('State parsing failed, continuing with Nylas flow');
      }
    }

    // Handle OAuth errors
    if (error) {
      console.log('❌ OAuth Error:', { error, error_description, state });
      return res.status(400).send(`
        <html>
          <body>
            <h2>❌ OAuth Error</h2>
            <p>Error: ${error}</p>
            <p>Description: ${error_description || 'Unknown error'}</p>
            <script>window.close();</script>
          </body>
        </html>
      `);
    }

    if (!code || !state) {
      console.log('❌ Missing OAuth parameters:', { code: !!code, state: !!state });
      return res.status(400).send(`
        <html>
          <body>
            <h2>❌ Authentication Failed</h2>
            <p>Missing required parameters</p>
            <script>window.close();</script>
          </body>
        </html>
      `);
    }

    const account = await nylasEmailService.handleCallback(code, state);

    // Success page that DOES NOT auto-close
    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2>✅ Email Connected Successfully!</h2>
          <p>Your ${account.provider} account (${account.email}) has been connected.</p>
          <p><strong>Please manually close this window.</strong></p>
          <div style="margin-top: 20px; padding: 15px; background: #f0f8ff; border-left: 4px solid #0066cc;">
            <p><strong>Debug Info:</strong></p>
            <pre style="text-align: left; font-size: 12px;">${JSON.stringify(account, null, 2)}</pre>
          </div>
          <script>
            console.log('🔥 OAUTH SUCCESS - Account connected:', ${JSON.stringify(account)});
            // Notify parent window but DO NOT auto-close
            if (window.opener) {
              window.opener.postMessage({
                type: 'NYLAS_AUTH_SUCCESS',
                account: ${JSON.stringify(account)}
              }, '*');
            }
            // Remove auto-close so we can see what happened
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error('OAuth callback error:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2>❌ Authentication Failed</h2>
          <p>${error instanceof Error ? error.message : 'Unknown error occurred'}</p>
          <div style="margin-top: 20px; padding: 15px; background: #ffe6e6; border-left: 4px solid #cc0000;">
            <p><strong>Error Details:</strong></p>
            <pre style="text-align: left; font-size: 12px;">${error instanceof Error ? error.stack : 'No stack trace'}</pre>
          </div>
          <p><strong>Please manually close this window and check the console logs.</strong></p>
          <script>
            console.error('🔥 OAUTH ERROR:', '${error instanceof Error ? error.message : 'Unknown error'}');
            if (window.opener) {
              window.opener.postMessage({
                type: 'NYLAS_AUTH_ERROR',
                error: '${error instanceof Error ? error.message : 'Unknown error'}'
              }, '*');
            }
            // Remove auto-close to see error details
          </script>
        </body>
      </html>
    `);
  }
});

/**
 * @route   POST /api/nylas/send-document
 * @desc    Send document via email (AI can use this)
 * @access  Public
 */
router.post('/send-document', async (req: SendDocumentRequest, res: Response) => {
  try {
    const {
      userId,
      to,
      cc,
      bcc,
      subject,
      message,
      documentId,
      documentPath,
      documentName,
      preferredProvider
    } = req.body;

    // Validate required fields
    if (!userId || !to || to.length === 0 || !subject || !message) {
      return res.status(400).json({
        success: false,
        error: 'userId, to, subject, and message are required'
      });
    }

    if (!documentId && !documentPath) {
      return res.status(400).json({
        success: false,
        error: 'Either documentId or documentPath is required'
      });
    }

    const success = await nylasEmailService.sendDocument({
      to,
      cc,
      bcc,
      subject,
      message,
      documentId,
      documentPath,
      documentName
    }, userId, preferredProvider);

    if (success) {
      res.json({
        success: true,
        message: 'Document sent successfully',
        sentTo: to
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to send document'
      });
    }
  } catch (error) {
    console.error('Send document error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to send document'
    });
  }
});

/**
 * @route   GET /api/nylas/emails/:userId
 * @desc    Get recent emails for user
 * @access  Public
 */
router.get('/emails/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;

    const emails = await nylasEmailService.getEmails(userId, limit);

    res.json({
      success: true,
      emails,
      count: emails.length
    });
  } catch (error) {
    console.error('Get emails error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get emails'
    });
  }
});

/**
 * @route   POST /api/nylas/send-email
 * @desc    Send regular email (no attachments)
 * @access  Public
 */
router.post('/send-email', async (req: Request, res: Response) => {
  try {
    const { userId, to, subject, body, cc, bcc } = req.body;

    if (!userId || !to || !subject || !body) {
      return res.status(400).json({
        success: false,
        error: 'userId, to, subject, and body are required'
      });
    }

    const success = await nylasEmailService.sendEmail(to, subject, body, userId, cc, bcc);

    if (success) {
      res.json({
        success: true,
        message: 'Email sent successfully'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to send email'
      });
    }
  } catch (error) {
    console.error('Send email error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send email'
    });
  }
});

/**
 * @route   PUT /api/nylas/emails/:messageId/read
 * @desc    Mark email as read
 * @access  Public
 */
router.put('/emails/:messageId/read', async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const { userId = 'demo-user' } = req.body;

    const success = await nylasEmailService.markAsRead(messageId, userId);

    if (success) {
      res.json({
        success: true,
        message: 'Email marked as read'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to mark email as read'
      });
    }
  } catch (error) {
    console.error('Mark as read error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mark email as read'
    });
  }
});

/**
 * @route   PUT /api/nylas/emails/:messageId/unread
 * @desc    Mark email as unread
 * @access  Public
 */
router.put('/emails/:messageId/unread', async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const { userId = 'demo-user' } = req.body;

    const success = await nylasEmailService.markAsUnread(messageId, userId);

    if (success) {
      res.json({
        success: true,
        message: 'Email marked as unread'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to mark email as unread'
      });
    }
  } catch (error) {
    console.error('Mark as unread error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mark email as unread'
    });
  }
});

/**
 * @route   GET /api/nylas/health
 * @desc    Health check for Nylas integration
 * @access  Public
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'Nylas Email Service',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

export default router;