import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import vapiAssistantService from '../services/vapi-assistant.service';
import twilioDirectService from '../services/twilio-direct.service';

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

const router = Router();

/**
 * TEST ENDPOINT - Complete phone system provisioning test
 * This will actually provision a real phone number and VAPI assistant
 */
router.post('/test/provision-phone-system', async (req: Request, res: Response) => {
  try {
    const { 
      companyName = 'Test Construction Co',
      areaCode = '404',  // Atlanta area code
      testMode = true
    } = req.body;

    console.log(`🧪 TESTING PHONE PROVISIONING FOR: ${companyName}`);
    
    // Create a test team ID
    const testTeamId = `test-${Date.now()}`;
    
    const results = {
      companyName,
      teamId: testTeamId,
      twilioNumber: null as string | null,
      vapiAssistantId: null as string | null,
      errors: [] as string[],
      success: false
    };

    // Step 1: Test Twilio number purchase
    console.log('📞 Step 1: Searching for available Twilio numbers...');
    try {
      const availableNumbers = await twilioDirectService.client.availablePhoneNumbers('US')
        .local
        .list({
          areaCode,
          capabilities: {
            voice: true,
            sms: true
          },
          limit: 5
        });

      if (availableNumbers.length === 0) {
        results.errors.push(`No numbers available in area code ${areaCode}`);
        return res.status(400).json(results);
      }

      console.log(`Found ${availableNumbers.length} available numbers:`);
      availableNumbers.forEach(num => {
        console.log(`  - ${num.phoneNumber} (${num.locality}, ${num.region})`);
      });

      // Purchase the first available number
      const numberToPurchase = availableNumbers[0].phoneNumber;
      console.log(`\n💳 Purchasing number: ${numberToPurchase}`);
      
      const purchasedNumber = await twilioDirectService.client.incomingPhoneNumbers.create({
        phoneNumber: numberToPurchase,
        voiceUrl: `${process.env.WEBHOOK_BASE_URL}/api/twilio/voice/${testTeamId}`,
        voiceMethod: 'POST',
        smsUrl: `${process.env.WEBHOOK_BASE_URL}/api/twilio/sms/${testTeamId}`,
        smsMethod: 'POST',
        statusCallback: `${process.env.WEBHOOK_BASE_URL}/api/twilio/status/${testTeamId}`,
        statusCallbackMethod: 'POST',
        friendlyName: `${companyName} - Test`
      });

      results.twilioNumber = purchasedNumber.phoneNumber;
      console.log(`✅ Successfully purchased: ${purchasedNumber.phoneNumber}`);
      console.log(`   SID: ${purchasedNumber.sid}`);
      console.log(`   Voice URL: ${purchasedNumber.voiceUrl}`);

    } catch (error: any) {
      console.error('❌ Twilio Error:', error);
      results.errors.push(`Twilio: ${error.message}`);
      return res.status(500).json(results);
    }

    // Step 2: Create VAPI Assistant
    console.log('\n🤖 Step 2: Creating VAPI Assistant...');
    try {
      const assistant = await vapiAssistantService.createCompanyAssistant(
        companyName,
        testTeamId
      );
      
      results.vapiAssistantId = assistant.id;
      console.log(`✅ Created VAPI Assistant:`);
      console.log(`   ID: ${assistant.id}`);
      console.log(`   Name: ${assistant.name}`);
      console.log(`   First Message: ${assistant.firstMessage}`);

    } catch (error: any) {
      console.error('❌ VAPI Error:', error);
      results.errors.push(`VAPI: ${error.message}`);
      
      // Cleanup: Release the Twilio number if VAPI fails
      if (results.twilioNumber) {
        console.log('🧹 Cleaning up Twilio number...');
        try {
          const numbers = await twilioDirectService.client.incomingPhoneNumbers
            .list({ phoneNumber: results.twilioNumber });
          if (numbers.length > 0) {
            await numbers[0].remove();
            console.log('✅ Twilio number released');
          }
        } catch (cleanupError) {
          console.error('Failed to cleanup Twilio number:', cleanupError);
        }
      }
      
      return res.status(500).json(results);
    }

    // Step 3: Save to database (optional in test mode)
    if (!testMode) {
      console.log('\n💾 Step 3: Saving to database...');
      try {
        // Create test team record
        const { error: teamError } = await supabase
          .from('teams')
          .insert({
            id: testTeamId,
            company_name: companyName,
            vapi_assistant_id: results.vapiAssistantId,
            vapi_assistant_name: `${companyName} Receptionist`,
            twilio_phone_number: results.twilioNumber,
            phone_system_active: true,
            phone_system_created_at: new Date().toISOString(),
            monthly_call_limit: 100,
            calls_this_month: 0
          });

        if (teamError) {
          console.error('Database error:', teamError);
          results.errors.push(`Database: ${teamError.message}`);
        } else {
          console.log('✅ Saved to database');
        }
      } catch (dbError: any) {
        console.error('Database error:', dbError);
        results.errors.push(`Database: ${dbError.message}`);
      }
    }

    // Step 4: Test the system
    console.log('\n🧪 Step 4: System Test Results:');
    console.log('================================');
    console.log(`Company: ${companyName}`);
    console.log(`Phone Number: ${results.twilioNumber}`);
    console.log(`VAPI Assistant ID: ${results.vapiAssistantId}`);
    console.log(`Webhook URL: ${process.env.WEBHOOK_BASE_URL}/api/twilio/voice/${testTeamId}`);
    console.log('================================');
    console.log('\n📱 You can now test by:');
    console.log(`1. Calling ${results.twilioNumber}`);
    console.log(`2. The call will be routed to VAPI assistant: ${results.vapiAssistantId}`);
    console.log(`3. The assistant will greet callers as "${companyName}"`);

    results.success = true;

    res.json({
      ...results,
      testInstructions: {
        phoneNumber: results.twilioNumber,
        expectedGreeting: `Good ${getTimeOfDay()}, ${companyName}. How may I assist you today?`,
        webhookUrl: `${process.env.WEBHOOK_BASE_URL}/api/twilio/voice/${testTeamId}`,
        cleanupInstructions: testMode ? 
          'Call DELETE /api/test/cleanup-phone-system with the teamId to cleanup' : 
          'Resources saved to database'
      }
    });

  } catch (error: any) {
    console.error('❌ Unexpected error:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

/**
 * TEST ENDPOINT - Cleanup test resources
 */
router.delete('/test/cleanup-phone-system', async (req: Request, res: Response) => {
  try {
    const { teamId, phoneNumber, assistantId } = req.body;

    console.log(`🧹 Cleaning up test resources for team: ${teamId}`);
    
    const results = {
      twilioCleanup: false,
      vapiCleanup: false,
      databaseCleanup: false,
      errors: [] as string[]
    };

    // Cleanup Twilio number
    if (phoneNumber) {
      try {
        const numbers = await twilioDirectService.client.incomingPhoneNumbers
          .list({ phoneNumber });
        if (numbers.length > 0) {
          await numbers[0].remove();
          results.twilioCleanup = true;
          console.log(`✅ Released Twilio number: ${phoneNumber}`);
        }
      } catch (error: any) {
        console.error('Twilio cleanup error:', error);
        results.errors.push(`Twilio: ${error.message}`);
      }
    }

    // Cleanup VAPI assistant
    if (assistantId) {
      try {
        await vapiAssistantService.deleteAssistant(assistantId);
        results.vapiCleanup = true;
        console.log(`✅ Deleted VAPI assistant: ${assistantId}`);
      } catch (error: any) {
        console.error('VAPI cleanup error:', error);
        results.errors.push(`VAPI: ${error.message}`);
      }
    }

    // Cleanup database
    if (teamId) {
      try {
        const { error } = await supabase
          .from('teams')
          .delete()
          .eq('id', teamId);
        
        if (!error) {
          results.databaseCleanup = true;
          console.log(`✅ Cleaned database records for team: ${teamId}`);
        } else {
          results.errors.push(`Database: ${error.message}`);
        }
      } catch (error: any) {
        console.error('Database cleanup error:', error);
        results.errors.push(`Database: ${error.message}`);
      }
    }

    res.json({
      success: results.errors.length === 0,
      ...results
    });

  } catch (error: any) {
    console.error('Cleanup error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * TEST ENDPOINT - Check Twilio account balance and capabilities
 */
router.get('/test/twilio-account-info', async (req: Request, res: Response) => {
  try {
    console.log('📊 Fetching Twilio account information...');
    
    // Get account info
    const account = await twilioDirectService.client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
    
    // Get balance (if available)
    let balance = null;
    try {
      const balanceData = await twilioDirectService.client.balance.fetch();
      balance = balanceData.balance;
    } catch (error) {
      console.log('Could not fetch balance (might need different permissions)');
    }

    // Count existing phone numbers
    const phoneNumbers = await twilioDirectService.client.incomingPhoneNumbers.list();
    
    // Get usage for current month
    const usage = await twilioDirectService.client.usage.records.list({
      category: 'calls',
      startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    });

    res.json({
      account: {
        sid: account.sid,
        friendlyName: account.friendlyName,
        status: account.status,
        type: account.type,
        dateCreated: account.dateCreated
      },
      balance: balance,
      phoneNumbers: {
        count: phoneNumbers.length,
        numbers: phoneNumbers.map(p => ({
          number: p.phoneNumber,
          friendlyName: p.friendlyName,
          capabilities: p.capabilities,
          dateCreated: p.dateCreated
        }))
      },
      monthlyUsage: usage.map(u => ({
        category: u.category,
        usage: u.usage,
        unit: u.usageUnit,
        price: u.price,
        priceUnit: u.priceUnit
      }))
    });

  } catch (error: any) {
    console.error('Error fetching Twilio info:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

function getTimeOfDay(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'morning';
  if (hour < 17) return 'afternoon';
  return 'evening';
}

export default router;