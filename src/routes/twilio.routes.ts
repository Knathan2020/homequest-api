// Twilio API Routes for HomeQuest
// Handles voice calls, SMS, and webhooks

import express, { Request, Response } from 'express';
import twilioAIService from '../services/twilioAI.service';
import twilio from 'twilio';

const router = express.Router();

// Twilio webhook validation middleware
const validateTwilioWebhook = (req: Request, res: Response, next: Function) => {
  const twilioSignature = req.headers['x-twilio-signature'] as string;
  const url = `${req.protocol}://${req.get('host')}${req.originalUrl}`;
  const authToken = process.env.TWILIO_AUTH_TOKEN || '';
  
  if (process.env.NODE_ENV === 'production') {
    const isValid = twilio.validateRequest(
      authToken,
      twilioSignature,
      url,
      req.body
    );
    
    if (!isValid) {
      return res.status(403).send('Forbidden');
    }
  }
  
  next();
};

// Make an AI-powered call to vendor
router.post('/call/vendor', async (req: Request, res: Response) => {
  try {
    const {
      phoneNumber,
      vendorName,
      purpose,
      projectDetails,
      language = 'en'
    } = req.body;

    // Validate required fields
    if (!phoneNumber || !vendorName || !purpose) {
      return res.status(400).json({
        error: 'Missing required fields: phoneNumber, vendorName, purpose'
      });
    }

    // Validate phone number format
    const phoneRegex = /^\+?[1-9]\d{1,14}$/;
    if (!phoneRegex.test(phoneNumber)) {
      return res.status(400).json({
        error: 'Invalid phone number format'
      });
    }

    // Make the call
    const result = await twilioAIService.makeCall({
      to: phoneNumber,
      vendorName,
      purpose,
      projectDetails,
      language
    });

    res.json({
      success: true,
      callSid: result.callSid,
      status: result.status,
      message: `Call initiated to ${vendorName} at ${phoneNumber}`
    });
  } catch (error: any) {
    console.error('Error making vendor call:', error);
    res.status(500).json({
      error: 'Failed to initiate call',
      message: error.message
    });
  }
});

// Send SMS to vendor
router.post('/sms/send', async (req: Request, res: Response) => {
  try {
    const { to, message } = req.body;

    if (!to || !message) {
      return res.status(400).json({
        error: 'Missing required fields: to, message'
      });
    }

    const result = await twilioAIService.sendSMS(to, message);

    res.json({
      success: true,
      messageSid: result.sid,
      status: result.status
    });
  } catch (error: any) {
    console.error('Error sending SMS:', error);
    res.status(500).json({
      error: 'Failed to send SMS',
      message: error.message
    });
  }
});

// Get call status
router.get('/call/status/:callSid', async (req: Request, res: Response) => {
  try {
    const { callSid } = req.params;
    const status = await twilioAIService.getCallStatus(callSid);
    
    res.json({
      success: true,
      ...status
    });
  } catch (error: any) {
    console.error('Error getting call status:', error);
    res.status(500).json({
      error: 'Failed to get call status',
      message: error.message
    });
  }
});

// List recent calls
router.get('/calls/recent', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20;
    const calls = await twilioAIService.listRecentCalls(limit);
    
    res.json({
      success: true,
      calls,
      count: calls.length
    });
  } catch (error: any) {
    console.error('Error listing calls:', error);
    res.status(500).json({
      error: 'Failed to list calls',
      message: error.message
    });
  }
});

// === TWILIO WEBHOOKS ===

// Voice webhook - handles call flow
router.post('/webhook/voice/:phoneNumber', validateTwilioWebhook, (req: Request, res: Response) => {
  const { phoneNumber } = req.params;
  
  // Retrieve stored TwiML for this call
  const callData = global.twilioCallData?.[phoneNumber];
  
  if (callData && callData.twiml) {
    res.type('text/xml');
    res.send(callData.twiml);
  } else {
    // Default TwiML if no data found
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>Thank you for calling HomeQuest. Please leave a message after the beep.</Say>
    <Record maxLength="60" />
</Response>`;
    res.type('text/xml');
    res.send(twiml);
  }
});

// Gather webhook - handles keypad input
router.post('/webhook/gather/:phoneNumber', validateTwilioWebhook, async (req: Request, res: Response) => {
  const { Digits, CallSid } = req.body;
  const { phoneNumber } = req.params;
  
  // Process the digit input
  let responseMessage = '';
  let nextAction = '';
  
  switch(Digits) {
    case '1':
      responseMessage = 'Great! We will send you the bid details via email shortly.';
      nextAction = 'send_bid_email';
      break;
    case '2':
      responseMessage = 'Perfect! Someone from our team will contact you within 24 hours to schedule a site visit.';
      nextAction = 'schedule_visit';
      break;
    case '3':
      responseMessage = 'We understand. We will keep you in mind for future projects. Thank you.';
      nextAction = 'mark_unavailable';
      break;
    default:
      responseMessage = 'Thank you for your response. We will review and get back to you.';
      nextAction = 'review_response';
  }
  
  // Store the response
  if (global.twilioCallData?.[phoneNumber]) {
    global.twilioCallData[phoneNumber].vendorResponse = {
      digits: Digits,
      action: nextAction,
      timestamp: new Date()
    };
  }
  
  // Send TwiML response
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>${responseMessage}</Say>
    <Pause length="1"/>
    <Say>Have a great day!</Say>
</Response>`;
  
  res.type('text/xml');
  res.send(twiml);
  
  // Emit event for further processing
  twilioAIService.emit('gatherResponse', {
    callSid: CallSid,
    phoneNumber,
    digits: Digits,
    action: nextAction
  });
});

// Status callback webhook
router.post('/webhook/status', validateTwilioWebhook, (req: Request, res: Response) => {
  const { CallSid, CallStatus, To, From, Duration } = req.body;
  
  console.log(`Call ${CallSid} status: ${CallStatus}`);
  
  // Emit status update event
  twilioAIService.emit('callStatusUpdate', {
    callSid: CallSid,
    status: CallStatus,
    to: To,
    from: From,
    duration: Duration
  });
  
  res.sendStatus(200);
});

// Recording webhook
router.post('/webhook/recording/:phoneNumber', validateTwilioWebhook, async (req: Request, res: Response) => {
  const { RecordingUrl, RecordingSid, CallSid } = req.body;
  const { phoneNumber } = req.params;
  
  console.log(`Recording received for call ${CallSid}: ${RecordingUrl}`);
  
  // Process the recording with AI
  try {
    const analysis = await twilioAIService.processRecording(RecordingUrl, CallSid);
    
    // Store analysis
    if (global.twilioCallData?.[phoneNumber]) {
      global.twilioCallData[phoneNumber].recording = {
        url: RecordingUrl,
        sid: RecordingSid,
        analysis,
        timestamp: new Date()
      };
    }
  } catch (error) {
    console.error('Error processing recording:', error);
  }
  
  // Send TwiML response to end the call
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say>Thank you for your message. We will review it and get back to you soon.</Say>
    <Hangup/>
</Response>`;
  
  res.type('text/xml');
  res.send(twiml);
});

// Transcription webhook
router.post('/webhook/transcription/:phoneNumber', validateTwilioWebhook, (req: Request, res: Response) => {
  const { TranscriptionText, RecordingSid, CallSid } = req.body;
  const { phoneNumber } = req.params;
  
  console.log(`Transcription for call ${CallSid}: ${TranscriptionText}`);
  
  // Store transcription
  if (global.twilioCallData?.[phoneNumber]) {
    global.twilioCallData[phoneNumber].transcription = {
      text: TranscriptionText,
      recordingSid: RecordingSid,
      timestamp: new Date()
    };
  }
  
  // Emit transcription event
  twilioAIService.emit('transcriptionReceived', {
    callSid: CallSid,
    phoneNumber,
    transcription: TranscriptionText
  });
  
  res.sendStatus(200);
});

// AMD (Answering Machine Detection) webhook
router.post('/webhook/amd', validateTwilioWebhook, (req: Request, res: Response) => {
  const { CallSid, MachineDetectionResult } = req.body;
  
  console.log(`AMD result for call ${CallSid}: ${MachineDetectionResult}`);
  
  // Handle based on detection result
  if (MachineDetectionResult === 'machine_end_beep' || MachineDetectionResult === 'machine_end_silence') {
    // Leave a voicemail
    console.log('Leaving voicemail...');
  }
  
  res.sendStatus(200);
});

// SMS webhook - incoming messages
router.post('/webhook/sms', validateTwilioWebhook, (req: Request, res: Response) => {
  const { From, To, Body, MessageSid } = req.body;
  
  console.log(`SMS received from ${From}: ${Body}`);
  
  // Emit SMS received event
  twilioAIService.emit('smsReceived', {
    from: From,
    to: To,
    message: Body,
    messageSid: MessageSid
  });
  
  // Auto-reply based on content
  let reply = 'Thank you for your message. A HomeQuest team member will respond shortly.';
  
  // Check for specific keywords
  if (Body.toLowerCase().includes('yes') || Body.toLowerCase().includes('confirm')) {
    reply = 'Thank you for confirming. We have updated our records.';
  } else if (Body.toLowerCase().includes('reschedule')) {
    reply = 'We understand you need to reschedule. Please call us at 1-800-HOME-QST or reply with your preferred dates.';
  }
  
  // Send TwiML response
  const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Message>${reply}</Message>
</Response>`;
  
  res.type('text/xml');
  res.send(twiml);
});

// Test endpoint
router.get('/test', (req: Request, res: Response) => {
  res.json({
    success: true,
    message: 'Twilio AI service is running',
    configured: !!process.env.TWILIO_ACCOUNT_SID
  });
});

// Declare global type for TypeScript
declare global {
  var twilioCallData: any;
}

export default router;