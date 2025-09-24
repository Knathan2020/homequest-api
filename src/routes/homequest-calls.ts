// HomeQuest-Paid Calling Routes
// All teams use HomeQuest's Twilio account

import express from 'express';
import homeQuestTwilio from '../services/homequest-twilio.service';
import conversationalAI from '../services/conversational-ai.service';

const router = express.Router();

// Make a call (HomeQuest pays)
router.post('/homequest/call', async (req, res) => {
  try {
    const { teamId = '11111111-1111-1111-1111-111111111111', to, callerName, vendorName, purpose } = req.body;
    
    const result = await homeQuestTwilio.makeCall({
      teamId,
      to,
      callerName: callerName || 'Team Member',
      vendorName: vendorName || 'Vendor',
      purpose: purpose || 'discussing a project'
    });
    
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Send SMS (HomeQuest pays)
router.post('/homequest/sms', async (req, res) => {
  try {
    const { teamId = '11111111-1111-1111-1111-111111111111', to, message } = req.body;
    
    const result = await homeQuestTwilio.sendSMS({
      teamId,
      to,
      message
    });
    
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Get team usage
router.get('/homequest/usage/:teamId', async (req, res) => {
  try {
    const usage = await homeQuestTwilio.getTeamUsage(req.params.teamId);
    res.json(usage);
  } catch (error: any) {
    res.status(500).json({ 
      error: error.message 
    });
  }
});

// Twilio status callback
router.post('/homequest/status/:teamId', async (req, res) => {
  try {
    const { CallSid, CallDuration } = req.body;
    await homeQuestTwilio.handleCallStatus(req.params.teamId, CallSid, CallDuration);
    res.status(200).send('OK');
  } catch (error) {
    res.status(200).send('OK'); // Always return OK to Twilio
  }
});

// Admin: Get all teams usage (HomeQuest only)
router.get('/homequest/admin/usage', async (req, res) => {
  try {
    const usage = await homeQuestTwilio.getAllTeamsUsage();
    res.json(usage);
  } catch (error: any) {
    res.status(500).json({ 
      error: error.message 
    });
  }
});

export default router;