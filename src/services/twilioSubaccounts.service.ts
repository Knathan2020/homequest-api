// Twilio Subaccounts Management Service
// Each builder gets their own subaccount and phone number

import twilio from 'twilio';
import { Twilio } from 'twilio';
import { createClient } from '@supabase/supabase-js';
import axios from 'axios';

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

interface TeamAccount {
  teamId: string;
  teamName: string;
  ownerEmail: string;
  companyName?: string;
  contactPhone?: string; // Team contact phone
  location?: {
    city?: string;
    state?: string;
    areaCode?: string;
  };
}

interface TwilioTeamAccount {
  id?: string;
  team_id: string;
  team_name: string;
  owner_email: string;
  company_name?: string;
  subaccount_sid: string;
  subaccount_auth_token: string;
  twilio_phone_number: string;
  phone_number_sid: string;
  friendly_name: string;
  status: 'active' | 'suspended' | 'closed';
  monthly_cost: number;
  created_at?: string;
  last_used?: string;
  call_count: number;
  sms_count: number;
  total_spent: number;
}

class TwilioSubaccountsService {
  private masterClient: Twilio;
  private isInitialized: boolean = false;

  constructor() {
    // Initialize master account client
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    
    // Check if credentials are properly formatted
    if (accountSid && authToken && accountSid.startsWith('AC')) {
      this.masterClient = twilio(accountSid, authToken);
      this.isInitialized = true;
      console.log('✅ Twilio Subaccounts Service initialized');
    } else if (accountSid && accountSid.startsWith('SK')) {
      console.warn('⚠️ Twilio API Key provided instead of Account SID. Please use Account SID (starts with AC)');
      this.isInitialized = false;
    } else {
      console.warn('⚠️ Twilio credentials not found or invalid. Phone features disabled.');
      this.isInitialized = false;
    }
  }

  // Create a new subaccount for a team
  async createTeamAccount(team: TeamAccount): Promise<TwilioTeamAccount | null> {
    if (!this.isInitialized) {
      throw new Error('Twilio service not initialized');
    }

    try {
      // Step 1: Create Twilio subaccount
      const friendlyName = `${team.teamName} - ${team.companyName || 'Team'}`;
      
      const subaccount = await this.masterClient.api.v2010
        .accounts
        .create({ friendlyName });

      console.log(`📱 Created subaccount for ${team.teamName}: ${subaccount.sid}`);

      // Step 2: Get auth token for the subaccount
      const subaccountAuthToken = subaccount.authToken;

      // Step 3: Create a client for the subaccount
      const subaccountClient = twilio(subaccount.sid, subaccountAuthToken);

      // Step 4: Buy a phone number for the subaccount
      // Use team's location area code if provided, otherwise search for any available number
      const searchParams: any = {
        limit: 1,
        voiceEnabled: true,
        smsEnabled: true
      };

      // Add area code if provided in team location
      if (team.location?.areaCode) {
        searchParams.areaCode = team.location.areaCode;
      } else if (team.location?.state) {
        searchParams.inRegion = team.location.state;
      }

      const availableNumbers = await this.masterClient
        .availablePhoneNumbers('US')
        .local
        .list(searchParams);

      if (availableNumbers.length === 0) {
        throw new Error('No phone numbers available in the requested area');
      }

      // Purchase phone number and configure webhooks
      const phoneNumber = await subaccountClient.incomingPhoneNumbers.create({
        phoneNumber: availableNumbers[0].phoneNumber,
        friendlyName: `${team.teamName}'s Business Line`
      });

      console.log(`📞 Assigned phone number ${phoneNumber.phoneNumber} to ${team.teamName}`);

      // Step 5: Import to VAPI and configure AI assistant
      let vapiPhoneId = null;
      try {
        vapiPhoneId = await this.importPhoneToVAPI(
          phoneNumber.phoneNumber,
          team.teamName,
          team.teamId
        );
        console.log(`✅ Phone imported to VAPI with ID: ${vapiPhoneId}`);
      } catch (vapiError) {
        console.error('⚠️ Failed to import to VAPI:', vapiError);
        // Continue even if VAPI import fails
      }

      // Step 6: Store in database
      const accountData: TwilioTeamAccount = {
        team_id: team.teamId,
        team_name: team.teamName,
        owner_email: team.ownerEmail,
        company_name: team.companyName,
        subaccount_sid: subaccount.sid,
        subaccount_auth_token: subaccountAuthToken,
        twilio_phone_number: phoneNumber.phoneNumber,
        phone_number_sid: phoneNumber.sid,
        friendly_name: friendlyName,
        status: 'active',
        monthly_cost: 1.15, // Twilio phone number cost
        call_count: 0,
        sms_count: 0,
        total_spent: 0
      };

      const { data, error } = await supabase
        .from('teams')
        .update({
          twilio_phone_number: phoneNumber.phoneNumber,
          twilio_subaccount_sid: subaccount.sid,
          twilio_subaccount_token: subaccountAuthToken,
          twilio_phone_sid: phoneNumber.sid,
          vapi_phone_id: vapiPhoneId,
          phone_system_active: true
        })
        .eq('id', team.teamId)
        .select()
        .single();

      if (error) {
        console.error('Error storing account:', error);
        // Still return the account data even if DB save fails
        return accountData;
      }

      // Step 6: Send welcome SMS to team
      await this.sendWelcomeSMS(phoneNumber.phoneNumber, team.contactPhone || team.ownerEmail);

      return data;
    } catch (error) {
      console.error('Error creating team account:', error);
      throw error;
    }
  }

  // Get team's Twilio client
  async getTeamClient(teamId: string): Promise<Twilio | null> {
    try {
      // Fetch team's account from database
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single();

      if (error || !data || !data.twilio_subaccount_sid) {
        console.error('No Twilio account found for team:', teamId);
        return null;
      }

      // Create and return client for this subaccount
      return twilio(data.twilio_subaccount_sid, data.twilio_subaccount_token);
    } catch (error) {
      console.error('Error getting team client:', error);
      return null;
    }
  }

  // Make a call from team's account
  async makeTeamCall(
    teamId: string,
    to: string,
    callerName: string,
    vendorName: string,
    purpose: string,
    projectDetails?: any
  ): Promise<any> {
    try {
      // Get team's account
      const { data: account } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single();

      if (!account || !account.twilio_phone_number) {
        throw new Error('No phone number assigned to this team');
      }

      // Create client for team's subaccount
      const teamClient = twilio(account.twilio_subaccount_sid, account.twilio_subaccount_token);

      // Create TwiML for the call
      const twimlUrl = `http://twimlets.com/echo?Twiml=${encodeURIComponent(`
        <Response>
          <Say voice="alice">
            Hello ${vendorName}, this is ${callerName} calling about ${purpose}.
            I'm reaching out regarding a construction project. 
            Is this a good time to talk?
          </Say>
          <Pause length="2"/>
          <Say voice="alice">
            Great! I wanted to discuss getting a quote for some work we have coming up.
            I'll send you the details via text message after this call.
            Thank you for your time!
          </Say>
        </Response>
      `)}`;

      // Make the call with TwiML
      const call = await teamClient.calls.create({
        to,
        from: account.twilio_phone_number,
        url: twimlUrl,
        record: true
      });

      // Update usage stats
      await supabase
        .from('teams')
        .update({ 
          updated_at: new Date().toISOString()
        })
        .eq('id', teamId);

      console.log(`📞 ${callerName} calling ${vendorName} from ${account.twilio_phone_number}`);

      return {
        success: true,
        callSid: call.sid,
        from: account.twilio_phone_number,
        to,
        status: call.status
      };
    } catch (error) {
      console.error('Error making team call:', error);
      throw error;
    }
  }

  // Send SMS from team's account
  async sendTeamSMS(teamId: string, to: string, message: string): Promise<any> {
    try {
      const { data: account } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single();

      if (!account || !account.twilio_phone_number) {
        throw new Error('No phone number assigned to this team');
      }

      const teamClient = twilio(account.twilio_subaccount_sid, account.twilio_subaccount_token);

      const sms = await teamClient.messages.create({
        body: message,
        to,
        from: account.twilio_phone_number
      });

      // Update usage stats
      await supabase
        .from('teams')
        .update({ 
          updated_at: new Date().toISOString()
        })
        .eq('id', teamId);

      return {
        success: true,
        messageSid: sms.sid,
        from: account.twilio_phone_number,
        to,
        status: sms.status
      };
    } catch (error) {
      console.error('Error sending team SMS:', error);
      throw error;
    }
  }

  // List all team accounts
  async listTeamAccounts(): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from('teams')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching team accounts:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error listing team accounts:', error);
      return [];
    }
  }

  // Get usage statistics for a team
  async getTeamUsage(teamId: string): Promise<any> {
    try {
      const { data: account } = await supabase
        .from('teams')
        .select('*')
        .eq('id', teamId)
        .single();

      if (!account || !account.twilio_subaccount_sid) {
        return null;
      }

      // Get usage from Twilio
      const teamClient = twilio(account.twilio_subaccount_sid, account.twilio_subaccount_token);
      
      const today = new Date();
      const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
      
      const usage = await teamClient.usage.records.list({
        category: 'totalprice',
        startDate: startOfMonth,
        endDate: today
      });

      const callMinutes = await teamClient.usage.records.list({
        category: 'calls-inbound-local',
        startDate: startOfMonth,
        endDate: today
      });

      const smsCount = await teamClient.usage.records.list({
        category: 'sms-outbound',
        startDate: startOfMonth,
        endDate: today
      });

      return {
        phoneNumber: account.twilio_phone_number,
        monthlyCharge: 1.15,
        currentMonthCost: usage[0]?.price || 0,
        currentMonthMinutes: callMinutes[0]?.usage || 0,
        currentMonthSMS: smsCount[0]?.usage || 0,
        lastUsed: account.updated_at
      };
    } catch (error) {
      console.error('Error getting team usage:', error);
      return null;
    }
  }

  // Suspend a team's account
  async suspendTeamAccount(teamId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('teams')
        .update({ status: 'suspended' })
        .eq('id', teamId);

      return !error;
    } catch (error) {
      console.error('Error suspending account:', error);
      return false;
    }
  }

  // Reactivate a team's account
  async reactivateTeamAccount(teamId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('teams')
        .update({ status: 'active' })
        .eq('id', teamId);

      return !error;
    } catch (error) {
      console.error('Error reactivating account:', error);
      return false;
    }
  }

  // Send welcome SMS
  private async sendWelcomeSMS(twilioNumber: string, teamContact: string): Promise<void> {
    try {
      if (!teamContact || !teamContact.includes('+')) {
        console.log('No valid phone number for welcome SMS');
        return;
      }

      await this.masterClient.messages.create({
        body: `🎉 Your team's business phone number is ready! ${twilioNumber} is now active for calls and texts. You can start calling vendors directly from HomeQuest. - HomeQuest Team`,
        to: teamContact,
        from: process.env.TWILIO_PHONE_NUMBER || twilioNumber
      });
    } catch (error) {
      console.error('Error sending welcome SMS:', error);
    }
  }

  // Check if team has a phone number
  async hasPhoneNumber(teamId: string): Promise<boolean> {
    try {
      const { data } = await supabase
        .from('teams')
        .select('twilio_phone_number')
        .eq('id', teamId)
        .single();

      return !!data?.twilio_phone_number;
    } catch {
      return false;
    }
  }

  // Get builder usage (alias for team usage)
  async getBuilderUsage(teamId: string): Promise<any> {
    return this.getTeamUsage(teamId);
  }

  // List builder accounts (alias for teams)
  async listBuilderAccounts(): Promise<any[]> {
    try {
      const { data } = await supabase
        .from('teams')
        .select('*')
        .not('twilio_subaccount_sid', 'is', null);

      return data || [];
    } catch (error) {
      console.error('Error listing builder accounts:', error);
      return [];
    }
  }

  // Suspend builder account (alias for team)
  async suspendBuilderAccount(teamId: string): Promise<boolean> {
    return this.suspendTeamAccount(teamId);
  }

  // Reactivate builder account (alias for team)
  async reactivateBuilderAccount(teamId: string): Promise<boolean> {
    return this.reactivateTeamAccount(teamId);
  }

  // Import phone number to VAPI
  private async importPhoneToVAPI(
    phoneNumber: string,
    teamName: string,
    _teamId: string
  ): Promise<string | null> {
    try {
      const vapiApiKey = process.env.VAPI_API_KEY || '31344c5e-a977-4438-ad39-0e1c245be45f';

      // Step 1: Import phone number to VAPI
      const response = await axios.post(
        'https://api.vapi.ai/phone-number',
        {
          provider: 'twilio',
          number: phoneNumber,
          name: `${teamName} Business Line`,
          assistantId: null, // Will use default assistant configured in VAPI
          twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
          twilioAuthToken: process.env.TWILIO_AUTH_TOKEN
        },
        {
          headers: {
            'Authorization': `Bearer ${vapiApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const phoneId = response.data.id;
      console.log(`📞 Phone ${phoneNumber} imported to VAPI with ID: ${phoneId}`);

      // Step 2: Configure webhook URL for call events
      const webhookUrl = `${process.env.API_BASE_URL || 'https://homequest-api.onrender.com'}/api/vapi/webhook`;

      try {
        await axios.patch(
          `https://api.vapi.ai/phone-number/${phoneId}`,
          {
            serverUrl: webhookUrl,
            serverUrlSecret: process.env.VAPI_WEBHOOK_SECRET || null
          },
          {
            headers: {
              'Authorization': `Bearer ${vapiApiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );

        console.log(`✅ VAPI webhook configured: ${webhookUrl}`);
      } catch (webhookError: any) {
        console.warn('⚠️ Failed to configure VAPI webhook:', webhookError.response?.data || webhookError.message);
        // Don't fail the import if webhook config fails
      }

      return phoneId;

    } catch (error: any) {
      console.error('Error importing to VAPI:', error.response?.data || error.message);
      throw error;
    }
  }
}

// Create singleton instance
const twilioSubaccountsService = new TwilioSubaccountsService();

export default twilioSubaccountsService;