/**
 * Simple Call Routes - Fallback without OpenAI Realtime API
 * Uses basic TwiML for testing
 */

import express from 'express';
import twilio from 'twilio';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse';

const router = express.Router();

// Simple call with basic TwiML
router.post('/simple-call', async (req, res) => {
  try {
    const {
      to,
      vendorName = 'Vendor',
      vendorCompany = 'Company',
      projectDetails = { address: '123 Main St', budget: '$500k' },
      builderName = 'Builder',
      companyName = 'HomeQuest'
    } = req.body;

    if (!to) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER;
    
    const client = twilio(accountSid, authToken);
    
    // Create a simple TwiML response
    const twiml = new VoiceResponse();
    
    // Initial greeting
    twiml.say({
      voice: 'Polly.Joanna',
      rate: '95%'
    }, `Hello ${vendorName}! This is ${builderName} from ${companyName}.`);
    
    twiml.pause({ length: 1 });
    
    // Main message
    twiml.say({
      voice: 'Polly.Joanna',
      rate: '95%'
    }, `I'm calling about a potential project at ${projectDetails.address}. 
        We have a budget of ${projectDetails.budget} and we're looking for quality ${vendorCompany} services.`);
    
    twiml.pause({ length: 1 });
    
    // Gather input
    const gather = twiml.gather({
      numDigits: 1,
      timeout: 5,
      action: `${process.env.WEBHOOK_BASE_URL}/api/simple-call/response`
    });
    
    gather.say({
      voice: 'Polly.Joanna',
      rate: '95%'
    }, 'If you are interested in learning more, press 1. If you would like us to call back later, press 2.');
    
    // If no input, say goodbye
    twiml.say({
      voice: 'Polly.Joanna'
    }, 'Thank you for your time. Have a great day!');
    
    // Make the call
    const call = await client.calls.create({
      to,
      from: fromNumber,
      twiml: twiml.toString(),
      // Don't use machine detection for now
      timeout: 60,
      record: true,
      recordingStatusCallback: `${process.env.WEBHOOK_BASE_URL}/api/simple-call/recording`,
      statusCallback: `${process.env.WEBHOOK_BASE_URL}/api/simple-call/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed']
    });
    
    res.json({
      success: true,
      message: 'Simple call initiated successfully',
      callSid: call.sid,
      to: call.to,
      from: call.from,
      tips: [
        'This is a simple TwiML call without OpenAI',
        'The call will play a pre-recorded message',
        'User can press 1 for interest or 2 for callback',
        'Make sure to answer within 60 seconds'
      ]
    });
    
  } catch (error: any) {
    console.error('Simple call error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error
    });
  }
});

// Handle user response
router.post('/simple-call/response', (req, res) => {
  const { Digits } = req.body;
  const twiml = new VoiceResponse();
  
  if (Digits === '1') {
    twiml.say({
      voice: 'Polly.Joanna'
    }, 'Great! We\'ll send you more information via text message. Thank you for your interest!');
  } else if (Digits === '2') {
    twiml.say({
      voice: 'Polly.Joanna'
    }, 'No problem! We\'ll try calling you back in a few days. Have a great day!');
  } else {
    twiml.say({
      voice: 'Polly.Joanna'
    }, 'Thank you for your time. Goodbye!');
  }
  
  res.type('text/xml');
  res.send(twiml.toString());
});

// Handle call status
router.post('/simple-call/status', (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body;
  console.log(`Call ${CallSid} status: ${CallStatus}, duration: ${CallDuration}s`);
  res.sendStatus(200);
});

// Handle recording
router.post('/simple-call/recording', (req, res) => {
  const { CallSid, RecordingUrl, RecordingDuration } = req.body;
  console.log(`Call ${CallSid} recording: ${RecordingUrl} (${RecordingDuration}s)`);
  res.sendStatus(200);
});

export default router;