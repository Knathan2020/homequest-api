const twilio = require('twilio');
require('dotenv').config();

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function checkAreaCodes() {
  const atlantaAreaCodes = ['404', '678', '470', '770'];
  
  for (const areaCode of atlantaAreaCodes) {
    try {
      console.log(`\n🔍 Checking ${areaCode} (Atlanta)...`);
      
      const numbers = await client.availablePhoneNumbers('US')
        .local
        .list({
          areaCode,
          capabilities: { voice: true, sms: true },
          limit: 3
        });

      if (numbers.length > 0) {
        console.log(`✅ Found ${numbers.length} available numbers in ${areaCode}:`);
        numbers.forEach((num, i) => {
          console.log(`  ${i+1}. ${num.phoneNumber} (${num.locality})`);
        });
      } else {
        console.log(`❌ No numbers available in ${areaCode}`);
      }
    } catch (error) {
      console.error(`Error checking ${areaCode}:`, error.message);
    }
  }
}

checkAreaCodes();
