/**
 * VAPI Assistant Configuration
 * Maps voice IDs to their corresponding VAPI assistant IDs
 */

export interface AssistantMapping {
  voiceId: string;
  voiceName: string;
  assistantId: string;
  elevenLabsVoiceId: string;
}

export const VAPI_ASSISTANTS: Record<string, AssistantMapping> = {
  kentrill: {
    voiceId: 'kentrill',
    voiceName: 'Kentrill',
    assistantId: 'c67618eb-59b6-4cdd-8a3a-c8149c2d9d45',
    elevenLabsVoiceId: 'ewxUvnyvvOehYjKjUVKC'
  },
  kyrsten: {
    voiceId: 'kyrsten',
    voiceName: 'Kyrsten',
    assistantId: 'b62e5e9e-4853-4e3c-865a-45b0f6b333e5',
    elevenLabsVoiceId: 'aVR2rUXJY4MTezzJjPyQ'
  },
  nathaniel: {
    voiceId: 'nathaniel',
    voiceName: 'Nathaniel',
    assistantId: 'b6fce082-0481-40e3-aab6-f658325b38ad',
    elevenLabsVoiceId: 'wsHauqjSkdBeAvdbUFmR'
  },
  jesus: {
    voiceId: 'jesus',
    voiceName: 'Jesus',
    assistantId: 'db7dacce-8bb8-46d1-8b71-60bb8cfc6ec3',
    elevenLabsVoiceId: '5IDdqnXnlsZ1FCxoOFYg'
  },
  cristina: {
    voiceId: 'cristina',
    voiceName: 'Cristina',
    assistantId: '8de756b4-38cd-4f54-a298-38638dbcbfcc',
    elevenLabsVoiceId: '2VUqK4PEdMj16L6xTN4J'
  },
  hope: {
    voiceId: 'hope',
    voiceName: 'Hope',
    assistantId: '65c0275d-9dac-4e17-a5f8-bb6215bdcc5f',
    elevenLabsVoiceId: 'OYTbf65OHHFELVut7v2H'
  }
};

export const getAssistantIdByVoice = (voiceId: string): string | null => {
  return VAPI_ASSISTANTS[voiceId]?.assistantId || null;
};

export const getAssistantByVoice = (voiceId: string): AssistantMapping | null => {
  return VAPI_ASSISTANTS[voiceId] || null;
};
