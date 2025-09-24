/**
 * Update VAPI assistant with transfer capabilities to team members
 * Run: npx ts-node src/scripts/update-assistant-transfers.ts
 */

import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

async function updateAssistantWithTransfers() {
  const VAPI_API_KEY = process.env.VAPI_API_KEY;
  const ASSISTANT_ID = '29cb6658-7227-4779-b8df-315de7f69c73';
  const WEBHOOK_URL = 'https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev/api/vapi/webhook';
  
  console.log('🔄 Updating VAPI Assistant with Transfer Capabilities...\n');
  
  try {
    // Step 1: Get team members from database
    console.log('1️⃣ Fetching team members from database...');
    
    const { data: teamMembers, error } = await supabase
      .from('team_members')
      .select('*')
      .order('name');
    
    if (error || !teamMembers) {
      console.log('   No team members found in database');
      return;
    }
    
    console.log(`   Found ${teamMembers.length} team members:`);
    teamMembers.forEach(member => {
      console.log(`   • ${member.name} - ${member.role} (${member.phone})`);
    });
    
    // Step 2: Create transfer destinations
    const transferDestinations = teamMembers.map(member => ({
      type: 'phoneNumber',
      number: member.phone,
      description: `Transfer to ${member.name} (${member.role})`,
      message: `Let me transfer you to ${member.name}, our ${member.role}.`
    }));
    
    // Step 3: Update assistant configuration
    console.log('\n2️⃣ Updating assistant configuration...');
    
    const assistantUpdate = {
      name: 'HomeQuest Intelligent Receptionist',
      model: {
        provider: 'openai',
        model: 'gpt-4',
        temperature: 0.7,
        messages: [
          {
            role: 'system',
            content: `You are a professional receptionist for HomeQuest, a construction company. 
            
            Your responsibilities:
            - Greet callers professionally
            - Determine the purpose of their call
            - Ask for their name and company
            - Transfer to the appropriate team member based on their needs
            
            Available team members for transfers:
            ${teamMembers.map(m => `- ${m.name}: ${m.role} in ${m.department}`).join('\n')}
            
            When someone asks to speak to a specific person or department, offer to transfer them.
            Be friendly, professional, and helpful.`
          }
        ]
      },
      voice: {
        provider: '11labs',
        voiceId: 'z9fAnlkpzviPz146aGWa', // Rachel - professional voice
        model: 'eleven_turbo_v2',
        stability: 0.5,
        similarityBoost: 0.75
      },
      firstMessage: 'Thank you for calling HomeQuest. This is Rachel. How may I direct your call today?',
      serverUrl: WEBHOOK_URL,
      forwardingPhoneNumber: teamMembers[0]?.phone, // Default transfer number
      endCallFunctionEnabled: true,
      dialKeypadFunctionEnabled: true,
      maxDurationSeconds: 600,
      silenceTimeoutSeconds: 30,
      responseDelaySeconds: 0.5,
      functions: [
        {
          name: 'transferCall',
          description: 'Transfer the call to a team member',
          parameters: {
            type: 'object',
            properties: {
              destination: {
                type: 'string',
                description: 'The name or role of the person to transfer to'
              },
              reason: {
                type: 'string',
                description: 'The reason for the transfer'
              }
            },
            required: ['destination']
          }
        }
      ]
    };
    
    const response = await axios.patch(
      `https://api.vapi.ai/assistant/${ASSISTANT_ID}`,
      assistantUpdate,
      {
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('   ✅ Assistant updated successfully!');
    console.log('   Voice: Rachel (Professional female)');
    console.log('   Transfer enabled to:', teamMembers.length, 'team members');
    
    // Step 4: Update phone number to use the updated assistant
    console.log('\n3️⃣ Verifying phone configuration...');
    
    const phoneResponse = await axios.get(
      'https://api.vapi.ai/phone-number',
      {
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`
        }
      }
    );
    
    const ourPhone = phoneResponse.data.find((p: any) => p.number === process.env.TWILIO_PHONE_NUMBER);
    if (ourPhone) {
      console.log('   Phone is using assistant:', ourPhone.assistantId === ASSISTANT_ID ? '✅ Correct' : '❌ Wrong');
    }
    
    console.log('\n✅ SUCCESS! Assistant updated with transfer capabilities');
    console.log('\n📞 Test the transfer system:');
    console.log('1. Call +16783253060');
    console.log('2. Ask to speak to one of these team members:');
    teamMembers.forEach(member => {
      console.log(`   • ${member.name} (${member.role})`);
    });
    console.log('3. The AI should offer to transfer you');
    
  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

updateAssistantWithTransfers();