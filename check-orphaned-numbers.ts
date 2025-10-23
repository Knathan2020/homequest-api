import twilio from 'twilio';
import dotenv from 'dotenv';

dotenv.config();

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function checkOrphaned() {
  console.log('📞 Checking all Twilio numbers...\n');
  
  const numbers = await twilioClient.incomingPhoneNumbers.list();
  
  const recentNumbers = [
    '+19786849778',  // Massachusetts (from earlier failed attempt)
    '+16782470772'   // Atlanta (just provisioned)
  ];
  
  for (const num of numbers) {
    if (recentNumbers.includes(num.phoneNumber)) {
      console.log(`${num.phoneNumber} - Created: ${num.dateCreated}`);
    }
  }
  
  process.exit(0);
}

checkOrphaned();
