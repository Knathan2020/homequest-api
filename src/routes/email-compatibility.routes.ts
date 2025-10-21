/**
 * Email Compatibility Routes
 * Redirects old email API calls to new Nylas endpoints
 */

import express, { Request, Response } from 'express';
import nylasEmailService from '../services/nylas-email.service';

const router = express.Router();

/**
 * @route   GET /api/emails
 * @desc    Compatibility route - redirects to Nylas emails
 * @access  Public
 */
router.get('/emails', async (req: Request, res: Response) => {
  try {
    const { folder, limit = 200, userId } = req.query;

    if (!userId) {
      console.log('⚠️ Legacy emails endpoint called without userId - returning empty');
      return res.json({
        success: true,
        emails: [],
        count: 0
      });
    }

    console.log('📧 Legacy emails endpoint called for user:', userId);

    const emails = await nylasEmailService.getEmails(userId as string, parseInt(limit as string));

    res.json({
      success: true,
      emails,
      count: emails.length
    });
  } catch (error) {
    console.error('Compatibility emails error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get emails'
    });
  }
});

/**
 * @route   GET /api/accounts
 * @desc    Compatibility route - redirects to Nylas accounts
 * @access  Public
 */
router.get('/accounts', async (req: Request, res: Response) => {
  try {
    const { userId } = req.query;

    if (!userId) {
      console.log('⚠️ Legacy accounts endpoint called without userId - returning empty');
      return res.json({
        success: true,
        accounts: [],
        count: 0
      });
    }

    console.log('📧 Legacy accounts endpoint called for user:', userId);

    const accounts = await nylasEmailService.getUserAccounts(userId as string);

    res.json({
      success: true,
      accounts,
      count: accounts.length
    });
  } catch (error) {
    console.error('Compatibility accounts error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get accounts'
    });
  }
});

/**
 * @route   PUT /api/emails/:messageId/read
 * @desc    Compatibility route for marking emails as read
 * @access  Public
 */
router.put('/emails/:messageId/read', async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const userId = 'demo-user';

    console.log('📧 Legacy mark as read endpoint called, redirecting to Nylas');

    const success = await nylasEmailService.markAsRead(messageId, userId);

    res.json({
      success,
      message: success ? 'Email marked as read' : 'Failed to mark as read'
    });
  } catch (error) {
    console.error('Compatibility mark as read error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark email as read'
    });
  }
});

/**
 * @route   PUT /api/emails/:messageId/unread
 * @desc    Compatibility route for marking emails as unread
 * @access  Public
 */
router.put('/emails/:messageId/unread', async (req: Request, res: Response) => {
  try {
    const { messageId } = req.params;
    const userId = 'demo-user';

    console.log('📧 Legacy mark as unread endpoint called, redirecting to Nylas');

    const success = await nylasEmailService.markAsUnread(messageId, userId);

    res.json({
      success,
      message: success ? 'Email marked as unread' : 'Failed to mark as unread'
    });
  } catch (error) {
    console.error('Compatibility mark as unread error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to mark email as unread'
    });
  }
});

export default router;