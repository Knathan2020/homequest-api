const axios = require('axios');

async function checkPhone() {
  try {
    const response = await axios.get(
      'https://api.vapi.ai/phone-number/86d21bb9-4562-4fcf-a834-cbfdccc0de5f',
      { headers: { 'Authorization': 'Bearer 867b5449-8493-4373-840e-2cd1d4a21a7b' } }
    );

    const phone = response.data;
    console.log('Current Vapi Configuration:');
    console.log('Number:', phone.number);
    console.log('ServerUrl:', phone.serverUrl);
    console.log('Server.url:', phone.server ? phone.server.url : 'None');
    console.log('AssistantId:', phone.assistantId || 'None (using dynamic)');
    console.log('');

    const serverUrl = phone.serverUrl;
    const serverObjUrl = phone.server ? phone.server.url : null;

    if (serverUrl !== serverObjUrl) {
      console.log('⚠️  MISMATCH DETECTED!');
      console.log('serverUrl:', serverUrl);
      console.log('server.url:', serverObjUrl);
    } else {
      console.log('✅ Both URLs match:', serverUrl);
    }

  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
  }
}

checkPhone();
