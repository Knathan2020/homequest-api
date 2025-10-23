const twilio = require('twilio');
require('dotenv').config();

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

async function provisionNumber() {
  try {
    console.log('🔍 Searching for available 404 numbers...');
    
    // Search for available numbers
    const availableNumbers = await client.availablePhoneNumbers('US')
      .local
      .list({
        areaCode: '404',
        capabilities: { voice: true, sms: true },
        limit: 5
      });

    if (availableNumbers.length === 0) {
      console.log('❌ No numbers available in 404 area code');
      process.exit(1);
    }

    console.log(`Found ${availableNumbers.length} available numbers:`);
    availableNumbers.forEach((num, i) => {
      console.log(`  ${i+1}. ${num.phoneNumber} (${num.locality}, ${num.region})`);
    });

    const numberToPurchase = availableNumbers[0].phoneNumber;
    console.log(`\n💳 Purchasing: ${numberToPurchase}`);

    // Purchase the number
    const purchasedNumber = await client.incomingPhoneNumbers.create({
      phoneNumber: numberToPurchase,
      friendlyName: 'HomeQuest Business Line'
    });

    console.log('\n✅ SUCCESS! New number purchased:');
    console.log(`   Number: ${purchasedNumber.phoneNumber}`);
    console.log(`   SID: ${purchasedNumber.sid}`);
    console.log(`   Created: ${purchasedNumber.dateCreated}`);

    return purchasedNumber;
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

provisionNumber();
