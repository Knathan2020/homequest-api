// Twilio Webhook Routes for Conversational AI
import express from 'express';
import conversationalAI from '../services/conversational-ai.service';

const router = express.Router();

// Handle voice responses during calls
router.post('/twilio/voice-response', async (req, res) => {
  try {
    const { CallSid, SpeechResult, Digits } = req.body;
    
    console.log(`📞 Voice input from call ${CallSid}: "${SpeechResult || Digits}"`);
    
    // Check for end-of-conversation keywords
    const input = (SpeechResult || '').toLowerCase();
    if (input.includes('goodbye') || input.includes('bye') || input.includes('talk later')) {
      res.type('text/xml');
      res.send(`
        <Response>
          <Say voice="Polly.Matthew">
            Great talking with you! I'll send you all the details via text. Have a wonderful day!
          </Say>
          <Hangup/>
        </Response>
      `);
      conversationalAI.cleanupConversation(CallSid);
      return;
    }
    
    // Generate and send AI response
    const twimlResponse = await conversationalAI.handleVoiceResponse(CallSid, SpeechResult || Digits || '');
    res.type('text/xml');
    res.send(twimlResponse);
  } catch (error) {
    console.error('Error handling voice response:', error);
    res.type('text/xml');
    res.send(`
      <Response>
        <Say voice="Polly.Matthew">
          I'll send you all the project details via text message. Thank you for your time!
        </Say>
        <Hangup/>
      </Response>
    `);
  }
});

// Handle call status updates
router.post('/twilio/status/:teamId', async (req, res) => {
  try {
    const { CallSid, CallDuration, CallStatus } = req.body;
    const { teamId } = req.params;
    
    console.log(`📊 Call ${CallSid} status: ${CallStatus}, duration: ${CallDuration}s`);
    
    if (CallStatus === 'completed') {
      // Clean up conversation context
      conversationalAI.cleanupConversation(CallSid);
      
      // Log to database (you can add this)
      // await trackCallUsage(teamId, CallDuration);
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Error handling status callback:', error);
    res.status(200).send('OK');
  }
});

export default router;