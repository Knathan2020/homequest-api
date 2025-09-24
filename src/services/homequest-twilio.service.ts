// HomeQuest Master Twilio Service
// All teams use HomeQuest's Twilio account - we pay for everything

import twilio from 'twilio';
import { createClient } from '@supabase/supabase-js';

// HomeQuest's Master Twilio Account
const HOMEQUEST_TWILIO_SID = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
const HOMEQUEST_TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN;
const HOMEQUEST_PHONE = process.env.TWILIO_PHONE_NUMBER || process.env.TWILIO_PHONE_NUMBER;

// Supabase
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://fbwmkkskdrvaipmkddwm.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || ''
);

class HomeQuestTwilioService {
  private twilioClient: any;
  
  constructor() {
    // Single Twilio client for ALL teams
    this.twilioClient = twilio(HOMEQUEST_TWILIO_SID, HOMEQUEST_TWILIO_TOKEN);
    console.log('✅ HomeQuest Twilio Service initialized - All teams use our account');
  }

  // Check if team can make calls (within their plan limits)
  async canMakeCall(teamId: string, estimatedMinutes: number = 1): Promise<boolean> {
    try {
      const { data: team } = await supabase
        .from('teams')
        .select('subscription_tier, current_month_minutes, monthly_minutes_limit')
        .eq('id', teamId)
        .single();

      // Temporarily bypass check for testing
      if (teamId === '11111111-1111-1111-1111-111111111111') {
        console.log('✅ Bypassing usage check for test team');
        return true;
      }

      if (!team) return false;
      
      // Enterprise = unlimited
      if (team.subscription_tier === 'enterprise') return true;
      
      // Check if within limits
      return (team.current_month_minutes + estimatedMinutes) <= team.monthly_minutes_limit;
    } catch (error) {
      console.error('Error checking call limits:', error);
      return true; // Allow calls if database check fails
    }
  }

  // Make a call (HomeQuest pays)
  async makeCall(params: {
    teamId: string;
    to: string;
    callerName: string;
    vendorName: string;
    purpose: string;
  }): Promise<any> {
    try {
      // Check if team has minutes available
      const canCall = await this.canMakeCall(params.teamId);
      if (!canCall) {
        throw new Error('Monthly calling limit reached. Upgrade your plan for more minutes.');
      }

      // Create TwiML with best available Polly Neural voice
      const twimlUrl = `http://twimlets.com/echo?Twiml=${encodeURIComponent(`
        <Response>
          <Say voice="Polly.Matthew">
            <prosody rate="medium">
              <emphasis level="moderate">Hello ${params.vendorName},</emphasis> this is ${params.callerName} from HomeQuest Construction.
            </prosody>
          </Say>
          <Pause length="1"/>
          <Say voice="Polly.Matthew">
            <prosody rate="95%">
              I'm calling about ${params.purpose}. We have an upcoming project that requires your expertise.
            </prosody>
          </Say>
          <Pause length="1"/>
          <Say voice="Polly.Matthew">
            <prosody rate="95%">
              I'll send you the project details via text message shortly. Please review them and let me know your availability.
            </prosody>
          </Say>
          <Pause length="1"/>
          <Say voice="Polly.Matthew">
            <prosody rate="medium">
              Thank you for your time, and I look forward to working with you. <emphasis level="moderate">Have a great day!</emphasis>
            </prosody>
          </Say>
        </Response>
      `)}`;

      // Make the call using HomeQuest's Twilio account
      const call = await this.twilioClient.calls.create({
        to: params.to,
        from: HOMEQUEST_PHONE, // Always use HomeQuest's number
        url: twimlUrl,
        statusCallback: `${process.env.WEBHOOK_BASE_URL}/api/twilio/status/${params.teamId}`,
        statusCallbackEvent: ['completed'],
        timeout: 60
      });

      console.log(`📞 Call initiated for team ${params.teamId} to ${params.vendorName}`);
      console.log(`   HomeQuest paying for this call (SID: ${call.sid})`);

      return {
        success: true,
        callSid: call.sid,
        from: HOMEQUEST_PHONE,
        to: params.to,
        status: call.status,
        message: 'Call initiated (covered by HomeQuest)'
      };
    } catch (error: any) {
      console.error('Error making HomeQuest call:', error);
      throw error;
    }
  }

  // Send SMS (HomeQuest pays)
  async sendSMS(params: {
    teamId: string;
    to: string;
    message: string;
  }): Promise<any> {
    try {
      console.log(`📱 Attempting to send SMS for team: ${params.teamId} to: ${params.to}`);
      
      // Check SMS limits
      const { data: team, error: teamError } = await supabase
        .from('teams')
        .select('subscription_tier, current_month_sms, monthly_sms_limit')
        .eq('id', params.teamId)
        .single();
      
      console.log('Team query result:', { team, error: teamError });

      // If team doesn't exist, create a default entry or use default limits
      let teamData = team;
      if (!team) {
        console.log(`Team ${params.teamId} not found in database. Using default limits.`);
        // For development/testing, proceed with default limits
        teamData = {
          subscription_tier: 'free',
          current_month_sms: 0,
          monthly_sms_limit: 100
        };
        
        // Try to create the team entry for future use
        try {
          const { data: newTeam, error: insertError } = await supabase
            .from('teams')
            .insert({
              id: params.teamId,
              name: 'Default Team',
              subscription_tier: 'free',
              current_month_sms: 0,
              monthly_sms_limit: 100,
              created_at: new Date().toISOString()
            })
            .select()
            .single();
          
          if (insertError) {
            console.log('Could not create team entry:', insertError.message);
          } else {
            console.log('Created default team entry for:', params.teamId);
          }
        } catch (err: any) {
          console.log('Error creating team:', err.message);
        }
      }
      
      if (teamData && teamData.subscription_tier !== 'enterprise' && 
          teamData.current_month_sms >= teamData.monthly_sms_limit) {
        throw new Error('Monthly SMS limit reached. Upgrade your plan for more messages.');
      }

      // Send SMS using HomeQuest's account
      const message = await this.twilioClient.messages.create({
        body: params.message,
        to: params.to,
        from: HOMEQUEST_PHONE
      });

      // Track usage (only if team exists in database)
      if (team) {
        await supabase
          .from('teams')
          .update({ current_month_sms: team.current_month_sms + 1 })
          .eq('id', params.teamId);
      }

      // Log to usage_tracking (with error handling)
      try {
        const { error: usageError } = await supabase
          .from('usage_tracking')
          .insert({
            team_id: params.teamId,
            usage_type: 'sms',
            cost: 0.0079, // Twilio SMS cost
            metadata: { to: params.to, message_sid: message.sid }
          });
        
        if (usageError) {
          console.log('Could not log usage tracking:', usageError.message);
        }
      } catch (err: any) {
        console.log('Error logging usage:', err.message);
      }

      console.log(`💬 SMS sent for team ${params.teamId}`);
      console.log(`   HomeQuest paying for this SMS (SID: ${message.sid})`);

      return {
        success: true,
        messageSid: message.sid,
        from: HOMEQUEST_PHONE,
        to: params.to,
        status: message.status,
        message: 'SMS sent (covered by HomeQuest)'
      };
    } catch (error: any) {
      console.error('Error sending HomeQuest SMS:', error);
      
      // Handle specific Twilio errors
      if (error.code === 30034) {
        throw new Error('Phone number not registered for A2P 10DLC. Please complete A2P registration in Twilio Console or use a test number.');
      } else if (error.code === 21211) {
        throw new Error('Invalid phone number format. Please use E.164 format (e.g., +1234567890)');
      } else if (error.code === 21610) {
        throw new Error('Recipient has opted out of messages. Cannot send SMS to this number.');
      } else if (error.code === 21408) {
        throw new Error('Permission denied. Check Twilio account permissions.');
      }
      
      throw error;
    }
  }

  // Track call completion and duration
  async handleCallStatus(teamId: string, callSid: string, duration: string): Promise<void> {
    try {
      const durationSeconds = parseInt(duration) || 0;
      const durationMinutes = Math.ceil(durationSeconds / 60);

      // Update team's usage
      const { data: team } = await supabase
        .from('teams')
        .select('current_month_minutes')
        .eq('id', teamId)
        .single();

      if (team) {
        await supabase
          .from('teams')
          .update({ 
            current_month_minutes: team.current_month_minutes + durationMinutes 
          })
          .eq('id', teamId);
      }

      // Log to usage_tracking
      await supabase
        .from('usage_tracking')
        .insert({
          team_id: teamId,
          usage_type: 'call',
          duration_seconds: durationSeconds,
          cost: durationMinutes * 0.013, // Twilio per-minute cost
          metadata: { call_sid: callSid }
        });

      console.log(`📊 Call completed for team ${teamId}: ${durationMinutes} minutes used`);
    } catch (error) {
      console.error('Error tracking call status:', error);
    }
  }

  // Get team's usage stats
  async getTeamUsage(teamId: string): Promise<any> {
    try {
      const { data: team } = await supabase
        .from('teams')
        .select(`
          subscription_tier,
          monthly_minutes_limit,
          monthly_sms_limit,
          current_month_minutes,
          current_month_sms,
          billing_cycle_start,
          subscription_tiers!inner(*)
        `)
        .eq('id', teamId)
        .single();

      if (!team) return null;

      // Calculate costs (what HomeQuest pays)
      const callCost = team.current_month_minutes * 0.013;
      const smsCost = team.current_month_sms * 0.0079;
      const totalCost = callCost + smsCost;

      return {
        tier: team.subscription_tier,
        usage: {
          minutes: {
            used: team.current_month_minutes,
            limit: team.monthly_minutes_limit,
            remaining: Math.max(0, team.monthly_minutes_limit - team.current_month_minutes),
            percentage: (team.current_month_minutes / team.monthly_minutes_limit) * 100
          },
          sms: {
            used: team.current_month_sms,
            limit: team.monthly_sms_limit,
            remaining: Math.max(0, team.monthly_sms_limit - team.current_month_sms),
            percentage: (team.current_month_sms / team.monthly_sms_limit) * 100
          }
        },
        costToHomeQuest: {
          calls: callCost.toFixed(2),
          sms: smsCost.toFixed(2),
          total: totalCost.toFixed(2)
        },
        billingCycleStart: team.billing_cycle_start,
        daysRemaining: 30 - Math.floor((Date.now() - new Date(team.billing_cycle_start).getTime()) / (1000 * 60 * 60 * 24))
      };
    } catch (error) {
      console.error('Error getting team usage:', error);
      return null;
    }
  }

  // Get all teams' usage (for HomeQuest admin)
  async getAllTeamsUsage(): Promise<any> {
    try {
      const { data: teams } = await supabase
        .from('teams')
        .select('*')
        .order('current_month_minutes', { ascending: false });

      if (!teams) return [];

      // Calculate total costs
      let totalMinutes = 0;
      let totalSMS = 0;
      
      teams.forEach(team => {
        totalMinutes += team.current_month_minutes || 0;
        totalSMS += team.current_month_sms || 0;
      });

      const totalCallCost = totalMinutes * 0.013;
      const totalSMSCost = totalSMS * 0.0079;

      return {
        teams: teams.map(team => ({
          name: team.team_name,
          tier: team.subscription_tier,
          minutesUsed: team.current_month_minutes,
          smsUsed: team.current_month_sms,
          cost: ((team.current_month_minutes * 0.013) + (team.current_month_sms * 0.0079)).toFixed(2)
        })),
        totalCosts: {
          calls: totalCallCost.toFixed(2),
          sms: totalSMSCost.toFixed(2),
          total: (totalCallCost + totalSMSCost).toFixed(2),
          monthlyProjected: ((totalCallCost + totalSMSCost) * 30 / new Date().getDate()).toFixed(2)
        },
        summary: {
          totalTeams: teams.length,
          totalMinutes,
          totalSMS,
          averageMinutesPerTeam: Math.round(totalMinutes / teams.length)
        }
      };
    } catch (error) {
      console.error('Error getting all teams usage:', error);
      return null;
    }
  }
}

// Singleton instance
const homeQuestTwilio = new HomeQuestTwilioService();
export default homeQuestTwilio;