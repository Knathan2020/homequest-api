/**
 * VAPI Voice Configuration
 * ElevenLabs voices for VAPI AI calls
 */

export interface VoiceOption {
  id: string;
  name: string;
  elevenLabsVoiceId: string;  // ElevenLabs Voice ID
  description: string;
  gender: 'male' | 'female';
  ethnicity: string;
}

export const VAPI_VOICES: VoiceOption[] = [
  {
    id: 'kentrill',
    name: 'Kentrill',
    elevenLabsVoiceId: 'ewxUvnyvvOehYjKjUVKC',
    description: 'Professional Black male voice',
    gender: 'male',
    ethnicity: 'Black'
  },
  {
    id: 'kyrsten',
    name: 'Kyrsten', 
    elevenLabsVoiceId: 'aVR2rUXJY4MTezzJjPyQ',
    description: 'Professional Black female voice',
    gender: 'female',
    ethnicity: 'Black'
  },
  {
    id: 'jesus',
    name: 'Jesus',
    elevenLabsVoiceId: '5IDdqnXnlsZ1FCxoOFYg',
    description: 'Professional Spanish male voice',
    gender: 'male',
    ethnicity: 'Spanish'
  },
  {
    id: 'cristina',
    name: 'Cristina',
    elevenLabsVoiceId: '2VUqK4PEdMj16L6xTN4J',
    description: 'Professional Spanish female voice',
    gender: 'female',
    ethnicity: 'Spanish'
  },
  {
    id: 'nathaniel',
    name: 'Nathaniel',
    elevenLabsVoiceId: 'wsHauqjSkdBeAvdbUFmR',
    description: 'Professional White male voice',
    gender: 'male',
    ethnicity: 'White'
  },
  {
    id: 'hope',
    name: 'Hope',
    elevenLabsVoiceId: 'OYTbf65OHHFELVut7v2H',
    description: 'Professional White female voice',
    gender: 'female',
    ethnicity: 'White'
  }
];

// Helper functions
export const getVoiceById = (id: string): VoiceOption | undefined => {
  return VAPI_VOICES.find(voice => voice.id === id);
};

export const getVoiceByElevenLabsId = (elevenLabsVoiceId: string): VoiceOption | undefined => {
  return VAPI_VOICES.find(voice => voice.elevenLabsVoiceId === elevenLabsVoiceId);
};

export const getVoicesByGender = (gender: 'male' | 'female'): VoiceOption[] => {
  return VAPI_VOICES.filter(voice => voice.gender === gender);
};

export const getVoicesByEthnicity = (ethnicity: string): VoiceOption[] => {
  return VAPI_VOICES.filter(voice => voice.ethnicity === ethnicity);
};

// Default voices
export const DEFAULT_VOICES = {
  male: 'nathaniel',
  female: 'hope'
};

// Get all voices for selection dropdown
export const getAllVoices = () => {
  return VAPI_VOICES.map(voice => ({
    value: voice.id,
    label: voice.name,
    elevenLabsVoiceId: voice.elevenLabsVoiceId,
    description: voice.description
  }));
};