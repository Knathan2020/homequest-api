/**
 * VAPI Assistant Configuration Template
 * Used when creating new assistants for phone provisioning
 */

export function getAssistantConfig(teamName: string, voiceId: string) {
  const API_BASE_URL = process.env.API_BASE_URL || 'https://homequest-api-1.onrender.com';

  return {
    name: `${teamName} AI Receptionist`,
    model: {
      provider: 'openai',
      model: 'gpt-4',
      temperature: 0.7,
      messages: [
        {
          role: 'system',
          content: `You are an AI receptionist for ${teamName}, a construction company.

Your responsibilities:
- Answer questions about ongoing projects, schedules, and vendors
- Transfer calls to the builder or staff members when requested
- Take messages when people are unavailable
- Be professional, friendly, and helpful

When someone asks about a project, use getProjectInfo to look up details.
When they want to speak with someone, confirm who they need and use transferCall.
All calls are automatically recorded and transcribed by VAPI.`
        }
      ]
    },
    voice: {
      provider: 'elevenlabs',
      voiceId: voiceId
    },
    functions: [
      {
        name: 'getProjectInfo',
        description: 'Get information about projects, vendors, and schedule',
        parameters: {
          type: 'object',
          properties: {
            projectName: { type: 'string', description: 'Name of project (optional)' },
            projectId: { type: 'string', description: 'ID of project (optional)' }
          }
        }
      },
      {
        name: 'transferCall',
        description: 'Transfer call to builder or staff',
        parameters: {
          type: 'object',
          properties: {
            phoneNumber: { type: 'string', description: 'Phone number (E.164 format)' },
            memberName: { type: 'string', description: 'Name of person' },
            reason: { type: 'string', description: 'Reason for transfer' }
          },
          required: ['phoneNumber']
        }
      },
      {
        name: 'takeMessage',
        description: 'Take a message when unavailable',
        parameters: {
          type: 'object',
          properties: {
            callerName: { type: 'string', description: 'Caller name' },
            callerPhone: { type: 'string', description: 'Caller phone' },
            message: { type: 'string', description: 'Message content' },
            forPerson: { type: 'string', description: 'Who message is for' },
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
    serverUrl: `${API_BASE_URL}/api/vapi/webhooks/function-call`,
    serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET || null
  };
}
