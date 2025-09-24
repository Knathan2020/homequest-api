/**
 * Microsoft Direct Routes - Bypass Nylas for Outlook
 */

import express, { Request, Response } from 'express';
import microsoftGraphService from '../services/microsoft-graph.service';

const router = express.Router();

// Initialize table on startup
microsoftGraphService.initializeTable();

/**
 * @route   GET /api/microsoft/auth
 * @desc    Get direct Microsoft OAuth URL (bypass Nylas)
 * @access  Public
 */
router.get('/auth', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    const authUrl = microsoftGraphService.getAuthUrl(userId as string);

    res.json({
      success: true,
      authUrl,
      provider: 'microsoft-direct'
    });
  } catch (error) {
    console.error('Microsoft Direct auth URL error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate Microsoft authentication URL'
    });
  }
});

/**
 * @route   GET /api/microsoft/callback
 * @desc    Handle direct Microsoft OAuth callback
 * @access  Public
 */
router.get('/callback', async (req: Request, res: Response) => {
  try {
    console.log('🔥 MICROSOFT DIRECT CALLBACK RECEIVED:', {
      query: req.query,
      timestamp: new Date().toISOString()
    });

    const { code, state, error, error_description } = req.query;

    // Handle OAuth errors
    if (error) {
      console.log('❌ Microsoft Direct OAuth Error:', { error, error_description });
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2>❌ Microsoft OAuth Error</h2>
            <p>Error: ${error}</p>
            <p>Description: ${error_description || 'Unknown error'}</p>
            <p><strong>Please close this window and try again.</strong></p>
          </body>
        </html>
      `);
    }

    if (!code || !state) {
      console.log('❌ Missing Microsoft OAuth parameters:', { code: !!code, state: !!state });
      return res.status(400).send(`
        <html>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h2>❌ Authentication Failed</h2>
            <p>Missing required parameters</p>
            <p><strong>Please close this window and try again.</strong></p>
          </body>
        </html>
      `);
    }

    const account = await microsoftGraphService.handleCallback(code as string, state as string);

    // Success page
    res.send(`
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2>✅ Outlook Connected Successfully!</h2>
          <p>Your Outlook account (${account.email}) has been connected via Microsoft Graph API.</p>
          <p><strong>Please close this window.</strong></p>
          <div style="margin-top: 20px; padding: 15px; background: #f0f8ff; border-left: 4px solid #0066cc;">
            <p><strong>✨ Direct Microsoft Integration Features:</strong></p>
            <ul style="text-align: left; display: inline-block;">
              <li>✅ Proper refresh tokens</li>
              <li>✅ No Nylas middleman</li>
              <li>✅ Full Outlook functionality</li>
              <li>✅ Reliable email access</li>
            </ul>
          </div>
          <script>
            console.log('🔥 MICROSOFT DIRECT SUCCESS - Account connected:', ${JSON.stringify(account)});
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
  } catch (error) {
    console.error('Microsoft Direct OAuth callback error:', error);
    res.status(500).send(`
      <html>
        <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
          <h2>❌ Authentication Failed</h2>
          <p>${error instanceof Error ? error.message : 'Unknown error occurred'}</p>
          <p><strong>Please close this window and check the console logs.</strong></p>
          <script>
            console.error('🔥 MICROSOFT DIRECT ERROR:', '${error instanceof Error ? error.message : 'Unknown error'}');
            if (window.opener) {
              window.opener.postMessage({
                type: 'MICROSOFT_DIRECT_AUTH_ERROR',
                error: '${error instanceof Error ? error.message : 'Unknown error'}'
              }, '*');
            }
          </script>
        </body>
      </html>
    `);
  }
});

/**
 * @route   GET /api/microsoft/accounts/:userId
 * @desc    Get connected Microsoft accounts for user
 * @access  Public
 */
router.get('/accounts/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const accounts = await microsoftGraphService.getUserAccounts(userId);

    res.json({
      success: true,
      accounts,
      count: accounts.length,
      provider: 'microsoft-direct'
    });
  } catch (error) {
    console.error('Get Microsoft accounts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get Microsoft accounts'
    });
  }
});

/**
 * @route   GET /api/microsoft/emails/:userId
 * @desc    Get emails via Microsoft Graph API
 * @access  Public
 */
router.get('/emails/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit as string) || 20;

    const emails = await microsoftGraphService.getEmails(userId, limit);

    res.json({
      success: true,
      emails,
      count: emails.length,
      provider: 'microsoft-direct'
    });
  } catch (error) {
    console.error('Get Microsoft emails error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get emails from Microsoft Graph'
    });
  }
});

/**
 * @route   POST /api/microsoft/send-email
 * @desc    Send email via Microsoft Graph API
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

    const success = await microsoftGraphService.sendEmail(userId, to, subject, body, cc, bcc);

    if (success) {
      res.json({
        success: true,
        message: 'Email sent successfully via Microsoft Graph',
        provider: 'microsoft-direct'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to send email via Microsoft Graph'
      });
    }
  } catch (error) {
    console.error('Send Microsoft email error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send email via Microsoft Graph'
    });
  }
});

/**
 * @route   PUT /api/microsoft/emails/:messageId/read
 * @desc    Mark email as read via Microsoft Graph
 * @access  Public
 */
router.put('/emails/:messageId/read', async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const { userId = 'demo-user' } = req.body;

    const success = await microsoftGraphService.markAsRead(userId, messageId);

    if (success) {
      res.json({
        success: true,
        message: 'Email marked as read via Microsoft Graph',
        provider: 'microsoft-direct'
      });
    } else {
      res.status(500).json({
        success: false,
        error: 'Failed to mark email as read'
      });
    }
  } catch (error) {
    console.error('Mark Microsoft email as read error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark email as read via Microsoft Graph'
    });
  }
});

/**
 * @route   GET /api/microsoft/health
 * @desc    Health check for Microsoft Direct integration
 * @access  Public
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'Microsoft Graph Direct Service',
    status: 'running',
    provider: 'microsoft-direct',
    features: ['OAuth2', 'Refresh Tokens', 'Email Read/Send', 'No Nylas Dependency'],
    timestamp: new Date().toISOString()
  });
});

export default router;