// Team Provisioning Routes
// Handles automatic Twilio subaccount and phone number provisioning

import { Router } from 'express';
import twilio from 'twilio';
import { supabase } from '../config/supabase';

const router = Router();

// Main Twilio account credentials (YOUR account that pays)
const MAIN_ACCOUNT_SID = process.env.TWILIO_MAIN_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
const MAIN_AUTH_TOKEN = process.env.TWILIO_MAIN_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN;

// Initialize Twilio client with main account
const twilioClient = twilio(MAIN_ACCOUNT_SID, MAIN_AUTH_TOKEN);

/**
 * Provision a new team with Twilio subaccount and phone number
 * This is called automatically when a new company signs up
 */
router.post('/provision-team', async (req, res) => {
  const { teamId, teamName, companyName, areaCode } = req.body;

  try {
    console.log(`📱 Provisioning Twilio setup for new team: ${companyName}`);

    // Step 1: Create a Twilio subaccount under YOUR main account
    const subaccount = await twilioClient.api.accounts.create({
      friendlyName: `${companyName} - HomeQuest Platform`
    });

    console.log(`✅ Created subaccount: ${subaccount.sid}`);

    // Step 2: Create a client for the new subaccount
    const subaccountClient = twilio(subaccount.sid, subaccount.authToken);

    // Step 3: Search for available phone numbers
    const availableNumbers = await twilioClient
      .availablePhoneNumbers('US')
      .local
      .list({
        areaCode: areaCode || '678', // Default to Georgia
        smsEnabled: true,
        voiceEnabled: true,
        limit: 5
      });

    if (availableNumbers.length === 0) {
      throw new Error('No phone numbers available in requested area code');
    }

    // Step 4: Purchase the phone number IN THE SUBACCOUNT
    // But it's billed to YOUR main account
    const purchasedNumber = await subaccountClient.incomingPhoneNumbers.create({
      phoneNumber: availableNumbers[0].phoneNumber,
      friendlyName: `${companyName} Main Line`,
      // Set up webhooks
      voiceUrl: `https://homequest-api.onrender.com/api/twilio/voice/${teamId}`,
      voiceMethod: 'POST',
      smsUrl: `https://homequest-api.onrender.com/api/twilio/sms/${teamId}`,
      smsMethod: 'POST'
    });

    console.log(`✅ Purchased number: ${purchasedNumber.phoneNumber}`);

    // Step 5: Update the team record in database
    const { error: updateError } = await supabase
      .from('teams')
      .update({
        twilio_phone_number: purchasedNumber.phoneNumber,
        twilio_subaccount_sid: subaccount.sid,
        twilio_subaccount_token: subaccount.authToken,
        twilio_phone_sid: purchasedNumber.sid,
        status: 'active',
        billing_status: 'active',
        parent_account_sid: MAIN_ACCOUNT_SID // Track that this is under YOUR account
      })
      .eq('id', teamId);

    if (updateError) {
      throw updateError;
    }

    res.json({
      success: true,
      phoneNumber: purchasedNumber.phoneNumber,
      subaccountSid: subaccount.sid,
      message: `Team provisioned with phone number ${purchasedNumber.phoneNumber}`
    });

  } catch (error) {
    console.error('Error provisioning team:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to provision team'
    });
  }
});

/**
 * Get billing/usage for a team's subaccount
 * This shows what they're costing YOU
 */
router.get('/team-usage/:teamId', async (req, res) => {
  const { teamId } = req.params;

  try {
    // Get team's subaccount info
    const { data: team, error } = await supabase
      .from('teams')
      .select('twilio_subaccount_sid, twilio_subaccount_token, company_name')
      .eq('id', teamId)
      .single();

    if (error || !team?.twilio_subaccount_sid) {
      return res.status(404).json({ error: 'Team not found or not provisioned' });
    }

    // Get usage from the subaccount
    const subaccountClient = twilio(team.twilio_subaccount_sid, team.twilio_subaccount_token);

    // Get today's usage
    const usage = await subaccountClient.usage.records.list({
      category: 'totalprice',
      startDate: new Date().toISOString().split('T')[0]
    });

    // Get this month's usage
    const monthUsage = await subaccountClient.usage.records.list({
      category: 'totalprice',
      startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
    });

    res.json({
      team: team.company_name,
      todaySpend: usage[0]?.price || 0,
      monthSpend: monthUsage[0]?.price || 0,
      subaccountSid: team.twilio_subaccount_sid,
      billedTo: 'Main HomeQuest Account'
    });

  } catch (error) {
    console.error('Error getting team usage:', error);
    res.status(500).json({ error: 'Failed to get usage data' });
  }
});

/**
 * List all teams and their phone numbers
 * Shows all subaccounts under YOUR main account
 */
router.get('/all-teams', async (req, res) => {
  try {
    // Get all teams from database
    const { data: teams, error } = await supabase
      .from('teams')
      .select('id, name, twilio_phone_number, status, created_at')
      .neq('id', '11111111-1111-1111-1111-111111111111'); // Exclude default team

    if (error) {
      throw error;
    }

    // Get subaccounts from Twilio
    const subaccounts = await twilioClient.api.accounts.list();

    // Match teams with their Twilio subaccounts
    const teamsWithBilling = teams?.map(team => {
      const subaccount = subaccounts.find(sa =>
        sa.friendlyName?.includes(team.name)
      );

      return {
        ...team,
        hasSubaccount: !!subaccount,
        subaccountStatus: subaccount?.status || 'not_found'
      };
    });

    res.json({
      mainAccount: MAIN_ACCOUNT_SID,
      totalTeams: teams?.length || 0,
      teams: teamsWithBilling
    });

  } catch (error) {
    console.error('Error listing teams:', error);
    res.status(500).json({ error: 'Failed to list teams' });
  }
});

/**
 * Suspend a team's phone service (but keep the number)
 */
router.post('/suspend-team/:teamId', async (req, res) => {
  const { teamId } = req.params;

  try {
    const { data: team, error } = await supabase
      .from('teams')
      .select('twilio_subaccount_sid, twilio_subaccount_token, twilio_phone_sid')
      .eq('id', teamId)
      .single();

    if (error || !team?.twilio_subaccount_sid) {
      return res.status(404).json({ error: 'Team not found' });
    }

    const subaccountClient = twilio(team.twilio_subaccount_sid, team.twilio_subaccount_token);

    // Disable webhooks to stop service
    await subaccountClient
      .incomingPhoneNumbers(team.twilio_phone_sid)
      .update({
        voiceUrl: '',
        smsUrl: ''
      });

    // Update team status
    await supabase
      .from('teams')
      .update({
        status: 'suspended',
        billing_status: 'suspended'
      })
      .eq('id', teamId);

    res.json({
      success: true,
      message: 'Team phone service suspended'
    });

  } catch (error) {
    console.error('Error suspending team:', error);
    res.status(500).json({ error: 'Failed to suspend team' });
  }
});

export default router;