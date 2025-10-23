const twilio = require('twilio');
require('dotenv').config();

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function provisionNumber() {
  try {
    const numberToPurchase = '+16783943659';
    console.log(`💳 Purchasing: ${numberToPurchase}`);

    // Purchase the number
    const purchasedNumber = await client.incomingPhoneNumbers.create({
      phoneNumber: numberToPurchase,
      friendlyName: 'HomeQuest Business Line'
    });

    console.log('\n✅ SUCCESS! New number purchased:');
    console.log(`   Number: ${purchasedNumber.phoneNumber}`);
    console.log(`   SID: ${purchasedNumber.sid}`);
    console.log(`   Friendly Name: ${purchasedNumber.friendlyName}`);
    console.log(`   Created: ${purchasedNumber.dateCreated}`);
    
    return purchasedNumber;
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

provisionNumber();
