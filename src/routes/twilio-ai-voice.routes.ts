/**
 * Twilio AI Voice Routes
 * Using Twilio's AI Voice capabilities for natural conversations
 */

import express from 'express';
import twilio from 'twilio';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse';
import OpenAI from 'openai';

const router = express.Router();

// Initialize Twilio
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

// Initialize OpenAI for script generation
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// AI Voice call using Twilio's advanced TTS
router.post('/twilio-ai-voice', async (req, res) => {
  try {
    const {
      to,
      vendorName = 'there',
      vendorCompany = 'your company',
      projectDetails = { 
        address: '1234 Main Street', 
        budget: '$2 million',
        type: 'luxury home',
        timeline: '6 months'
      },
      builderName = 'John',
      companyName = 'HomeQuest'
    } = req.body;

    if (!to) {
      return res.status(400).json({
        success: false,
        error: 'Phone number is required'
      });
    }

    console.log('🤖 Generating AI voice call for:', vendorName);

    // Generate dynamic script using OpenAI
    let aiScript = '';
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          {
            role: 'system',
            content: `You are ${builderName} from ${companyName}, calling ${vendorName} from ${vendorCompany}. 
            Create a warm, natural phone greeting that:
            1. Introduces yourself
            2. Mentions the project briefly
            3. Asks if they have a moment to discuss
            Keep it under 60 words, conversational and professional.`
          },
          {
            role: 'user',
            content: `Project: ${projectDetails.type} at ${projectDetails.address}, budget ${projectDetails.budget}`
          }
        ],
        max_tokens: 150,
        temperature: 0.8
      });
      
      aiScript = completion.choices[0]?.message?.content || '';
      console.log('Generated script:', aiScript);
    } catch (error) {
      console.error('OpenAI error, using fallback');
      aiScript = `Hi ${vendorName}, this is ${builderName} from ${companyName}. 
                 We have an exciting ${projectDetails.type} project at ${projectDetails.address} 
                 with a ${projectDetails.budget} budget. I'd love to discuss bringing ${vendorCompany} 
                 on board. Do you have a quick moment?`;
    }

    // Create TwiML with AI-enhanced voice
    const twiml = new VoiceResponse();
    
    // Use Polly Neural voice for more natural speech
    twiml.say({
      voice: 'Polly.Matthew-Neural', // Neural voice for better quality
      language: 'en-US'
    }, aiScript);
    
    // Brief pause for response
    twiml.pause({ length: 3 });
    
    // Gather response with speech recognition
    const gather = twiml.gather({
      input: ['speech', 'dtmf'],
      speechTimeout: 'auto',
      speechModel: 'experimental_conversations', // Better conversation model
      action: `${process.env.WEBHOOK_BASE_URL}/api/twilio-ai-voice/response`,
      method: 'POST'
    });
    
    gather.say({
      voice: 'Polly.Matthew-Neural'
    }, 'Are you interested in learning more about this opportunity?');
    
    // No input fallback
    twiml.say({
      voice: 'Polly.Matthew-Neural'
    }, 'I\'ll send you the details via text. Thank you for your time!');

    // Make the call
    const call = await twilioClient.calls.create({
      to,
      from: process.env.TWILIO_PHONE_NUMBER || '+16783253060',
      twiml: twiml.toString(),
      machineDetection: 'DetectMessageEnd',
      asyncAmd: 'true',
      asyncAmdStatusCallback: `${process.env.WEBHOOK_BASE_URL}/api/twilio-ai-voice/amd`,
      statusCallback: `${process.env.WEBHOOK_BASE_URL}/api/twilio-ai-voice/status`,
      statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      timeout: 60,
      record: true,
      recordingStatusCallback: `${process.env.WEBHOOK_BASE_URL}/api/twilio-ai-voice/recording`
    });
    
    res.json({
      success: true,
      message: '🎙️ AI Voice call initiated with Twilio Neural TTS',
      callSid: call.sid,
      to: call.to,
      features: [
        'Neural voice (Matthew-Neural) for natural speech',
        'Speech recognition for vendor responses',
        'Machine detection to handle voicemail',
        'Dynamic script generation with GPT-4'
      ],
      script: aiScript
    });
    
  } catch (error: any) {
    console.error('Twilio AI Voice error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error
    });
  }
});

// Handle speech/DTMF response
router.post('/twilio-ai-voice/response', async (req, res) => {
  const { SpeechResult, Digits, Confidence } = req.body;
  const twiml = new VoiceResponse();
  
  console.log('Speech result:', SpeechResult, 'Confidence:', Confidence);
  
  // Analyze response sentiment
  const positiveKeywords = ['yes', 'sure', 'interested', 'okay', 'great', 'good', 'absolutely', 'definitely'];
  const negativeKeywords = ['no', 'not', 'busy', 'later', 'callback', "can't", 'unable'];
  
  const response = (SpeechResult || '').toLowerCase();
  const isPositive = positiveKeywords.some(word => response.includes(word));
  const isNegative = negativeKeywords.some(word => response.includes(word));
  
  if (Digits === '1' || isPositive) {
    twiml.say({
      voice: 'Polly.Matthew-Neural'
    }, 'Fantastic! I\'ll send you all the project details right away. We\'re really excited about the possibility of working together. Have a great day!');
    
    // Could trigger SMS here
  } else if (Digits === '2' || response.includes('callback')) {
    twiml.say({
      voice: 'Polly.Matthew-Neural'
    }, 'No problem at all! I\'ll reach out again in a couple of days. Thank you for your time!');
  } else if (isNegative) {
    twiml.say({
      voice: 'Polly.Matthew-Neural'
    }, 'I understand. If anything changes, please don\'t hesitate to reach out. Have a wonderful day!');
  } else {
    // Unclear response
    twiml.say({
      voice: 'Polly.Matthew-Neural'
    }, 'Thank you for your time. I\'ll send you the information for your review. Feel free to reach out if you have any questions!');
  }
  
  res.type('text/xml');
  res.send(twiml.toString());
});

// Handle answering machine detection
router.post('/twilio-ai-voice/amd', (req, res) => {
  const { AnsweredBy, CallSid } = req.body;
  
  console.log(`Call ${CallSid} answered by: ${AnsweredBy}`);
  
  if (AnsweredBy === 'machine_start' || AnsweredBy === 'fax') {
    // It's a machine/voicemail
    console.log('📧 Voicemail detected, will leave message');
  }
  
  res.sendStatus(200);
});

// Handle call status
router.post('/twilio-ai-voice/status', (req, res) => {
  const { CallSid, CallStatus, CallDuration, AnsweredBy } = req.body;
  console.log(`📞 Call ${CallSid}: ${CallStatus} (${CallDuration}s) - ${AnsweredBy || 'human'}`);
  res.sendStatus(200);
});

// Handle recording callback
router.post('/twilio-ai-voice/recording', (req, res) => {
  const { CallSid, RecordingUrl, RecordingDuration } = req.body;
  console.log(`🎙️ Recording saved: ${RecordingUrl} (${RecordingDuration}s)`);
  res.sendStatus(200);
});

export default router;