/**
 * Update VAPI Assistants with Project Info, Transfer, and Message Functions
 */

import axios from 'axios';
import { VAPI_ASSISTANTS } from '../config/vapi-assistants.config';

const VAPI_API_KEY = process.env.VAPI_API_KEY || '31344c5e-a977-4438-ad39-0e1c245be45f';
const API_BASE_URL = process.env.API_BASE_URL || 'https://homequest-api-1.onrender.com';

const assistantConfig = {
  model: {
    provider: 'openai',
    model: 'gpt-4',
    temperature: 0.7,
    messages: [
      {
        role: 'system',
        content: `You are an AI receptionist for a construction company.

Your job:
- Answer questions about ongoing projects and schedules
- Transfer calls to the builder or staff when requested
- Take messages when people are unavailable
- Be professional, friendly, and helpful

When someone asks about a project, use getProjectInfo to fetch details.
When they want to speak with someone, confirm who they want and use transferCall.
VAPI automatically records and transcripts all calls.`
      }
    ]
  },
  voice: {
    provider: 'elevenlabs'
  },
  functions: [
    {
      name: 'getProjectInfo',
      description: 'Get information about projects, vendors, and schedule for this team',
      parameters: {
        type: 'object',
        properties: {
          projectName: {
            type: 'string',
            description: 'Name of the project to look up (optional)'
          },
          projectId: {
            type: 'string',
            description: 'ID of specific project (optional)'
          }
        }
      }
    },
    {
      name: 'transferCall',
      description: 'Transfer the call to the builder or a staff member',
      parameters: {
        type: 'object',
        properties: {
          phoneNumber: {
            type: 'string',
            description: 'Phone number to transfer to (E.164 format)'
          },
          memberName: {
            type: 'string',
            description: 'Name of person being transferred to'
          },
          reason: {
            type: 'string',
            description: 'Why the call is being transferred'
          }
        },
        required: ['phoneNumber']
      }
    },
    {
      name: 'takeMessage',
      description: 'Take a message when the builder is unavailable',
      parameters: {
        type: 'object',
        properties: {
          callerName: {
            type: 'string',
            description: 'Name of the caller'
          },
          callerPhone: {
            type: 'string',
            description: 'Phone number of the caller'
          },
          message: {
            type: 'string',
            description: 'The message content'
          },
          forPerson: {
            type: 'string',
            description: 'Who the message is for'
          },
          urgency: {
            type: 'string',
            enum: ['low', 'normal', 'high', 'urgent'],
            description: 'Message urgency'
          }
        },
        required: ['callerName', 'message']
      }
    }
  ],
  serverUrl: `${API_BASE_URL}/api/vapi/webhook`,
  serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET || null
};

async function updateAssistant(voiceId: string, assistantId: string, elevenLabsVoiceId: string) {
  try {
    console.log(`\n📝 Updating ${voiceId} assistant...`);

    const config = {
      ...assistantConfig,
      voice: {
        ...assistantConfig.voice,
        voiceId: elevenLabsVoiceId
      }
    };

    const response = await axios.patch(
      `https://api.vapi.ai/assistant/${assistantId}`,
      config,
      {
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ ${voiceId} updated`);
    return response.data;
  } catch (error: any) {
    console.error(`❌ ${voiceId} failed:`, error.response?.data || error.message);
    throw error;
  }
}

async function updateAllAssistants() {
  console.log('🚀 Updating VAPI Assistants\n');

  for (const [voiceId, mapping] of Object.entries(VAPI_ASSISTANTS)) {
    try {
      await updateAssistant(mapping.voiceId, mapping.assistantId, mapping.elevenLabsVoiceId);
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error(`Failed to update ${voiceId}`);
    }
  }

  console.log('\n✅ Done!');
}

updateAllAssistants()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Error:', error);
    process.exit(1);
  });
