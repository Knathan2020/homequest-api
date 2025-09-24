/**
 * Personal Calls via Vapi
 * For non-business, personal messages
 */

import express from 'express';
import axios from 'axios';

const router = express.Router();

const VAPI_API_KEY = process.env.VAPI_API_KEY || '';
const VAPI_BASE_URL = 'https://api.vapi.ai';
const VAPI_PHONE_NUMBER = process.env.VAPI_PHONE_NUMBER || '';

// Personal call endpoint
router.post('/personal-call', async (req, res) => {
  try {
    const {
      to,
      recipientName,
      fromName = "your child",
      message,
      voiceId = "pFZP5JQG7iQjIQuC4Bku" // Lily - warm female voice
    } = req.body;

    console.log(`📞 Initiating personal call to ${recipientName} at ${to}`);

    // Create a friendly personal assistant
    const assistant = {
      model: {
        provider: "openai",
        model: "gpt-4-turbo",
        messages: [
          {
            role: "system",
            content: `You are calling ${recipientName} with a personal message from ${fromName}.

PERSONALITY:
- Be warm, friendly, and natural
- Sound like a caring family member or friend
- Use their name naturally in conversation
- Keep it personal and genuine

YOUR MESSAGE:
${message || `Hi ${recipientName}! This is an AI assistant calling on behalf of ${fromName}. They wanted me to check in with you and see how you're doing. They've been learning about AI technology and wanted to share this cool new way to stay in touch. How have you been?`}

CONVERSATION STYLE:
- Be conversational and warm
- Ask how they're doing
- Share that this is a demonstration of new AI technology
- Let them know their child is thinking of them
- Be ready to have a brief friendly chat
- If they ask questions about AI, explain it's a new technology for making natural phone calls

End the call naturally after a brief conversation.`
          }
        ]
      },
      voice: {
        provider: "11labs",
        voiceId: voiceId,
        stability: 0.6,
        similarityBoost: 0.8,
        style: 0.3,
        useSpeakerBoost: true
      },
      transcriber: {
        provider: "deepgram",
        model: "nova-2",
        language: "en-US"
      },
      recordingEnabled: true,
      endCallMessage: `It was lovely talking with you ${recipientName}! Take care and have a wonderful day!`,
      endCallPhrases: ["goodbye", "bye", "talk to you later", "take care"],
      maxDurationSeconds: 300, // 5 minute max for personal calls
      silenceTimeoutSeconds: 20
    };

    // Make the call
    const callPayload = {
      assistant,
      phoneNumberId: VAPI_PHONE_NUMBER,
      customer: {
        number: to
      },
      metadata: {
        type: "personal",
        recipientName,
        fromName,
        timestamp: new Date().toISOString()
      }
    };

    const response = await axios.post(
      `${VAPI_BASE_URL}/call/phone`,
      callPayload,
      {
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ Personal call initiated to ${recipientName}`);

    res.json({
      success: true,
      callId: response.data.id,
      message: `Personal call initiated to ${recipientName}!`,
      recipient: recipientName,
      phoneNumber: to
    });

  } catch (error: any) {
    console.error('Error initiating personal call:', error.response?.data || error);
    res.status(500).json({
      success: false,
      error: error.response?.data?.message || error.message
    });
  }
});

// Call multiple people at once
router.post('/multi-call', async (req, res) => {
  try {
    const { recipients, message, fromName = "your family member", voiceId } = req.body;
    
    if (!recipients || !Array.isArray(recipients)) {
      return res.status(400).json({
        success: false,
        error: 'Recipients array is required'
      });
    }

    console.log(`📞 Initiating ${recipients.length} personal calls`);

    // Initiate all calls in parallel
    const callPromises = recipients.map(recipient => {
      return axios.post(
        `${VAPI_BASE_URL}/call/phone`,
        {
          assistant: {
            model: {
              provider: "openai",
              model: "gpt-4-turbo",
              messages: [
                {
                  role: "system",
                  content: `You are calling ${recipient.name} with a personal message from ${fromName}.

PERSONALITY:
- Be warm, friendly, and natural
- Sound like a caring family member
- Use their name naturally

YOUR MESSAGE:
${message || `Hi ${recipient.name}! This is an AI assistant calling on behalf of ${fromName}. They're testing out some new AI technology and wanted to share it with you by having me give you a call. They wanted me to check in and see how you're doing!`}

Be conversational, ask how they are, and have a brief friendly chat. Let them know this is a demonstration of AI technology that ${fromName} is learning about.`
                }
              ]
            },
            voice: {
              provider: "11labs",
              voiceId: voiceId || "pFZP5JQG7iQjIQuC4Bku",
              stability: 0.6,
              similarityBoost: 0.8,
              style: 0.3,
              useSpeakerBoost: true
            },
            transcriber: {
              provider: "deepgram",
              model: "nova-2",
              language: "en-US"
            },
            recordingEnabled: true,
            endCallMessage: `It was great talking with you ${recipient.name}! Take care!`,
            endCallPhrases: ["goodbye", "bye", "talk to you later"],
            maxDurationSeconds: 300,
            silenceTimeoutSeconds: 20
          },
          phoneNumberId: VAPI_PHONE_NUMBER,
          customer: {
            number: recipient.phone
          },
          metadata: {
            type: "personal",
            recipientName: recipient.name,
            fromName,
            timestamp: new Date().toISOString()
          }
        },
        {
          headers: {
            'Authorization': `Bearer ${VAPI_API_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      ).then(response => ({
        success: true,
        recipient: recipient.name,
        phone: recipient.phone,
        callId: response.data.id
      })).catch(error => ({
        success: false,
        recipient: recipient.name,
        phone: recipient.phone,
        error: error.response?.data?.message || error.message
      }));
    });

    const results = await Promise.all(callPromises);
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    console.log(`✅ Initiated ${successful.length} calls, ${failed.length} failed`);

    res.json({
      success: true,
      message: `Initiated ${successful.length} personal calls`,
      successful,
      failed,
      total: recipients.length
    });

  } catch (error: any) {
    console.error('Error initiating multi-call:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

export default router;