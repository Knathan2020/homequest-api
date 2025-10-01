/**
 * Update VAPI phone number webhook URL to correct API endpoint
 */
import axios from 'axios';

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const PHONE_NUMBER = '+18142610584';
const CORRECT_WEBHOOK_URL = 'https://homequest-api-1.onrender.com/api/vapi/webhook';

async function updateWebhookUrl() {
  try {
    console.log('🔍 Finding VAPI phone ID for', PHONE_NUMBER);
    
    // Get all phone numbers
    const listResponse = await axios.get('https://api.vapi.ai/phone-number', {
      headers: {
        'Authorization': `Bearer ${VAPI_API_KEY}`
      }
    });
    
    const phoneRecord = listResponse.data.find((p: any) => 
      p.number === PHONE_NUMBER || p.number?.includes('8142610584')
    );
    
    if (!phoneRecord) {
      console.error('❌ Phone number not found in VAPI');
      return;
    }
    
    console.log('✅ Found phone with ID:', phoneRecord.id);
    console.log('📡 Current webhook:', phoneRecord.serverUrl);
    
    // Update webhook URL
    console.log('🔄 Updating webhook to:', CORRECT_WEBHOOK_URL);
    
    const updateResponse = await axios.patch(
      `https://api.vapi.ai/phone-number/${phoneRecord.id}`,
      {
        serverUrl: CORRECT_WEBHOOK_URL
      },
      {
        headers: {
          'Authorization': `Bearer ${VAPI_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    console.log('✅ Webhook URL updated successfully!');
    console.log('📞 Phone:', updateResponse.data.number);
    console.log('🌐 New webhook:', updateResponse.data.serverUrl);
    
  } catch (error: any) {
    console.error('❌ Error:', error.response?.data || error.message);
  }
}

updateWebhookUrl();
