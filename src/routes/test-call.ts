// QUICK TEST - Make a call RIGHT NOW
import express from 'express';
import twilio from 'twilio';

const router = express.Router();

// Your Twilio credentials
const accountSid = 'ACdced5b7ba48a5d47222ee6c2fe041419';
const authToken = 'b744e1efe1c156fd8f391be7785aa4a1';
const fromNumber = '+16783253060';

const client = twilio(accountSid, authToken);

// Test call endpoint
router.post('/test-call', async (req, res) => {
  try {
    const { to, vendorName = 'Vendor', callerName = 'John', purpose = 'getting a quote' } = req.body;
    
    // Create TwiML
    const twimlUrl = `http://twimlets.com/echo?Twiml=${encodeURIComponent(`
      <Response>
        <Say voice="alice">
          Hello ${vendorName}, this is ${callerName} calling about ${purpose}.
          I'm reaching out regarding a construction project.
          I'll send you the details via text message.
          Thank you!
        </Say>
      </Response>
    `)}`;

    // Make the call
    const call = await client.calls.create({
      to: to || '+16783253060', // Default to your number for testing
      from: fromNumber,
      url: twimlUrl
    });

    res.json({ 
      success: true, 
      callSid: call.sid,
      message: 'Call initiated!'
    });
  } catch (error: any) {
    console.error('Call error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Test SMS endpoint
router.post('/test-sms', async (req, res) => {
  try {
    const { to, message = 'Hello from HomeQuest!' } = req.body;
    
    const sms = await client.messages.create({
      to: to || '+16783253060',
      from: fromNumber,
      body: message
    });

    res.json({ 
      success: true, 
      messageSid: sms.sid,
      message: 'SMS sent!'
    });
  } catch (error: any) {
    console.error('SMS error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;