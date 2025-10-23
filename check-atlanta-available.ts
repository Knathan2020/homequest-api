import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function checkAtlanta() {
  const areaCodes = ['404', '678', '770', '470'];
  
  for (const areaCode of areaCodes) {
    console.log(`\nChecking ${areaCode}...`);
    try {
      const numbers = await twilioClient.availablePhoneNumbers('US')
        .local
        .list({ areaCode, limit: 3 });
      
      console.log(`✅ ${numbers.length} available in ${areaCode}`);
      if (numbers.length > 0) {
        console.log('First number:', numbers[0].phoneNumber);
      }
    } catch (err: any) {
      console.log(`❌ Error: ${err.message}`);
    }
  }
  
  process.exit(0);
}

checkAtlanta();
