/**
 * AI Call Routes - Using OpenAI Chat (not Realtime API)
 * Fallback for when Realtime API is not available
 */

import express from 'express';
import twilio from 'twilio';
import VoiceResponse from 'twilio/lib/twiml/VoiceResponse';
import OpenAI from 'openai';

const router = express.Router();

// Initialize OpenAI (regular chat, not realtime)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'YOUR_NEW_OPENAI_API_KEY_HERE'
});

// AI-powered call with fallback
router.post('/ai-call', async (req, res) => {
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

    // Generate AI script using regular OpenAI
    let script = '';
    try {
      const completion = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          {
            role: 'system',
            content: `You are ${builderName} from ${companyName}, calling ${vendorName} from ${vendorCompany} about a construction project. Be professional and concise.`
          },
          {
            role: 'user',
            content: `Generate a brief phone script for calling about a project at ${projectDetails.address} with budget ${projectDetails.budget}. Keep it under 100 words.`
          }
        ],
        max_tokens: 150,
        temperature: 0.7
      });
      
      script = completion.choices[0]?.message?.content || '';
    } catch (aiError) {
      console.error('OpenAI error, using fallback script:', aiError);
      // Fallback script if OpenAI fails
      script = `Hello ${vendorName}, this is ${builderName} from ${companyName}. I'm calling about a project at ${projectDetails.address}. We have a budget of ${projectDetails.budget} and would love to discuss your ${vendorCompany} services.`;
    }

    // Create TwiML with AI-generated or fallback script
    const twiml = new VoiceResponse();
    
    twiml.say({
      voice: 'Polly.Matthew'
    } as any, script);
    
    twiml.pause({ length: 2 });
    
    // Gather input
    const gather = twiml.gather({
      numDigits: 1,
      timeout: 5,
      action: `${process.env.WEBHOOK_BASE_URL}/api/ai-call/response`
    });
    
    gather.say({
      voice: 'Polly.Matthew'
    } as any, 'If you are interested, press 1. To schedule a callback, press 2.');
    
    // Make the call
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    const fromNumber = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER;
    
    const client = twilio(accountSid, authToken);
    
    const call = await client.calls.create({
      to,
      from: fromNumber,
      twiml: twiml.toString(),
      timeout: 60,
      record: true
    });
    
    res.json({
      success: true,
      message: 'AI-powered call initiated',
      callSid: call.sid,
      scriptUsed: script,
      usingOpenAI: script !== '' && !script.includes('fallback'),
      tips: [
        'This uses OpenAI Chat API (not Realtime)',
        'Script is generated before the call',
        'Works with standard OpenAI API keys'
      ]
    });
    
  } catch (error: any) {
    console.error('AI call error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      suggestion: 'Check your OpenAI API key and Twilio credentials'
    });
  }
});

// Handle user response
router.post('/ai-call/response', (req, res) => {
  const { Digits } = req.body;
  const twiml = new VoiceResponse();
  
  if (Digits === '1') {
    twiml.say({
      voice: 'Polly.Matthew'
    }, 'Excellent! We will send you project details via text message. Thank you!');
  } else if (Digits === '2') {
    twiml.say({
      voice: 'Polly.Matthew'
    }, 'Understood. We will call you back tomorrow. Have a great day!');
  }
  
  res.type('text/xml');
  res.send(twiml.toString());
});

export default router;