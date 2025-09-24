/**
 * Test Call Routes
 * For testing Twilio call functionality
 */

import express from 'express';
import twilio from 'twilio';

const router = express.Router();

// Test call endpoint
router.post('/test-call', async (req, res) => {
  try {
    const { to, message = 'Hello! This is a test call from HomeQuest.' } = req.body;
    
    if (!to) {
      return res.status(400).json({ 
        success: false, 
        error: 'Phone number is required' 
      });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER || '+16783253060';
    
    const client = twilio(accountSid, authToken);
    
    // Create TwiML for the call
    const twiml = `
      <Response>
        <Say voice="alice">
          ${message}
          This is a test to ensure our calling system is working properly.
          If you're hearing this message, the call was successful.
          Thank you for your time. Goodbye!
        </Say>
      </Response>
    `;
    
    // Make the call with enhanced settings
    const call = await client.calls.create({
      to,
      from: fromNumber,
      twiml,
      // Enhanced settings to avoid voicemail
      timeout: 60, // Wait 60 seconds for answer
      record: false, // Don't record test calls
      // Try without machine detection for test
      // machineDetection: 'Enable',
      // machineDetectionTimeout: 5000
    });
    
    res.json({
      success: true,
      message: 'Test call initiated',
      callSid: call.sid,
      status: call.status,
      to: call.to,
      from: call.from,
      direction: call.direction,
      tips: [
        'Make sure the recipient phone is not on Do Not Disturb',
        'Add +16783253060 to contacts to avoid spam filtering',
        'Answer the call within 60 seconds',
        'Check if your carrier is blocking the number'
      ]
    });
    
  } catch (error: any) {
    console.error('Test call error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code,
      moreInfo: error.moreInfo
    });
  }
});

// Get call status
router.get('/test-call/status/:callSid', async (req, res) => {
  try {
    const { callSid } = req.params;
    
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    const client = twilio(accountSid, authToken);
    const call = await client.calls(callSid).fetch();
    
    res.json({
      success: true,
      call: {
        sid: call.sid,
        status: call.status,
        duration: call.duration,
        startTime: call.startTime,
        endTime: call.endTime,
        answeredBy: call.answeredBy,
        to: call.to,
        from: call.from
      },
      statusExplanation: {
        'queued': 'Call is waiting to be placed',
        'initiated': 'Call has been initiated',
        'ringing': 'Phone is ringing',
        'in-progress': 'Call is connected and active',
        'completed': 'Call has ended',
        'busy': 'Phone was busy',
        'no-answer': 'No one answered',
        'failed': 'Call failed to connect',
        'canceled': 'Call was canceled'
      }[call.status] || 'Unknown status'
    });
    
  } catch (error: any) {
    console.error('Error fetching call status:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;