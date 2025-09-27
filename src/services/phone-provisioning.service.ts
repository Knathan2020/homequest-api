/**
 * Phone Provisioning Service
 * Automatically provisions Twilio numbers and imports them to Vapi for new users
 */

import twilio from 'twilio';
import axios from 'axios';
import { createClient } from '@supabase/supabase-js';
import webhookConfig from '../config/webhook-urls.config';

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

interface PhoneProvisioningResult {
  success: boolean;
  twilioNumber?: string;
  vapiPhoneId?: string;
  error?: string;
}

interface TeamPhoneConfig {
  teamId: string;
  teamName: string;
  ownerEmail: string;
  preferredAreaCode?: string;
}

interface ProjectPhoneConfig {
  projectId: string;
  projectName: string;
  teamId: string;
  preferredAreaCode?: string;
}

class PhoneProvisioningService {
  private twilioClient: any;
  private vapiApiKey: string;
  
  constructor() {
    // Initialize Twilio client
    this.twilioClient = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    
    // Vapi API key (can be shared across all users initially)
    this.vapiApiKey = process.env.VAPI_API_KEY || '';
  }

  /**
   * Complete phone setup for a new team
   */
  async provisionPhoneForTeam(config: TeamPhoneConfig): Promise<PhoneProvisioningResult> {
    try {
      console.log(`📞 Provisioning phone for team: ${config.teamName}`);
      
      // Step 1: Purchase Twilio number
      const twilioNumber = await this.purchaseTwilioNumber(config.preferredAreaCode);
      if (!twilioNumber) {
        throw new Error('Failed to purchase Twilio number');
      }
      
      console.log(`✅ Purchased Twilio number: ${twilioNumber}`);
      
      // Step 2: Import number to Vapi
      const vapiPhoneId = await this.importToVapi(twilioNumber, config.teamName);
      if (!vapiPhoneId) {
        // Rollback - release the Twilio number
        await this.releaseTwilioNumber(twilioNumber);
        throw new Error('Failed to import number to Vapi');
      }
      
      console.log(`✅ Imported to Vapi with ID: ${vapiPhoneId}`);
      
      // Step 3: Save to database
      await this.saveTeamPhoneConfig({
        team_id: config.teamId,
        team_name: config.teamName,
        owner_email: config.ownerEmail,
        twilio_number: twilioNumber,
        vapi_phone_id: vapiPhoneId,
        default_voice_id: 'ewxUvnyvvOehYjKjUVKC', // Your custom voice as default
        status: 'active',
        created_at: new Date().toISOString()
      });
      
      // Step 4: Configure webhooks for call tracking
      await this.configureTwilioWebhooks(twilioNumber, config.teamId);
      
      return {
        success: true,
        twilioNumber,
        vapiPhoneId
      };
      
    } catch (error: any) {
      console.error('Phone provisioning error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Purchase a Twilio phone number
   */
  private async purchaseTwilioNumber(areaCode?: string): Promise<string | null> {
    try {
      // Search for available numbers
      const searchParams: any = {
        country: 'US',
        capabilities: {
          voice: true,
          sms: true
        },
        limit: 1
      };
      
      if (areaCode) {
        searchParams.areaCode = areaCode;
      }
      
      const availableNumbers = await this.twilioClient
        .availablePhoneNumbers('US')
        .local
        .list(searchParams);
      
      if (availableNumbers.length === 0) {
        throw new Error('No phone numbers available in this area code');
      }
      
      // Purchase the first available number
      const numberToPurchase = availableNumbers[0].phoneNumber;
      
      // Get webhook URLs from centralized config
      const webhooks = webhookConfig.getTwilioWebhooks();
      
      const purchasedNumber = await this.twilioClient.incomingPhoneNumbers.create({
        phoneNumber: numberToPurchase,
        voiceUrl: webhooks.voice,  // VAPI handles voice calls
        voiceMethod: 'POST',
        smsUrl: webhooks.sms,  // Messaging system handles SMS
        smsMethod: 'POST',
        statusCallbackUrl: webhooks.status,
        statusCallbackMethod: 'POST'
      });
      
      return purchasedNumber.phoneNumber;
      
    } catch (error: any) {
      console.error('Error purchasing Twilio number:', error);
      return null;
    }
  }

  /**
   * Import Twilio number to Vapi
   */
  private async importToVapi(twilioNumber: string, teamName: string): Promise<string | null> {
    try {
      // Step 1: Import phone number to VAPI
      const response = await axios.post(
        'https://api.vapi.ai/phone-number',
        {
          provider: 'twilio',
          number: twilioNumber,
          name: `${teamName} Phone`,
          assistantId: null, // Will be set up later
          twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
          twilioAuthToken: process.env.TWILIO_AUTH_TOKEN
        },
        {
          headers: {
            'Authorization': `Bearer ${this.vapiApiKey}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const phoneId = response.data.id;
      console.log(`📞 Phone imported to VAPI with ID: ${phoneId}`);

      // Step 2: Configure webhook URL for transcript capture
      const webhookUrl = `${process.env.WEBHOOK_BASE_URL || 'https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev'}/api/vapi/webhook`;

      try {
        await axios.patch(
          `https://api.vapi.ai/phone-number/${phoneId}`,
          {
            serverUrl: webhookUrl,
            serverUrlSecret: null // Add if you want webhook verification
          },
          {
            headers: {
              'Authorization': `Bearer ${this.vapiApiKey}`,
              'Content-Type': 'application/json'
            }
          }
        );

        console.log(`✅ Webhook configured for ${twilioNumber}: ${webhookUrl}`);
      } catch (webhookError: any) {
        console.warn('⚠️ Failed to configure webhook for phone number:', webhookError.response?.data || webhookError.message);
        // Don't fail the import if webhook config fails
      }

      return phoneId;

    } catch (error: any) {
      console.error('Error importing to Vapi:', error.response?.data || error);
      return null;
    }
  }

  /**
   * Save team phone configuration to database
   */
  private async saveTeamPhoneConfig(config: any): Promise<void> {
    const { error } = await supabase
      .from('team_phones')
      .insert(config);
    
    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }
  }

  /**
   * Configure Twilio webhooks for the number
   */
  private async configureTwilioWebhooks(phoneNumber: string, teamId: string): Promise<void> {
    try {
      const phoneNumbers = await this.twilioClient.incomingPhoneNumbers
        .list({ phoneNumber });
      
      if (phoneNumbers.length > 0) {
        await phoneNumbers[0].update({
          voiceUrl: `${process.env.API_BASE_URL}/api/webhooks/twilio/voice/${teamId}`,
          smsUrl: `${process.env.API_BASE_URL}/api/webhooks/twilio/sms/${teamId}`,
          statusCallback: `${process.env.API_BASE_URL}/api/webhooks/twilio/status/${teamId}`
        });
      }
    } catch (error) {
      console.error('Error configuring webhooks:', error);
    }
  }

  /**
   * Release a Twilio number (for rollback)
   */
  private async releaseTwilioNumber(phoneNumber: string): Promise<void> {
    try {
      const phoneNumbers = await this.twilioClient.incomingPhoneNumbers
        .list({ phoneNumber });
      
      if (phoneNumbers.length > 0) {
        await phoneNumbers[0].remove();
      }
    } catch (error) {
      console.error('Error releasing Twilio number:', error);
    }
  }

  /**
   * Get team's phone configuration
   */
  async getTeamPhoneConfig(teamId: string): Promise<any> {
    const { data, error } = await supabase
      .from('team_phones')
      .select('*')
      .eq('team_id', teamId)
      .single();
    
    if (error) {
      return null;
    }
    
    return data;
  }

  /**
   * Update team's default voice
   */
  async updateTeamVoice(teamId: string, voiceId: string): Promise<boolean> {
    const { error } = await supabase
      .from('team_phones')
      .update({ default_voice_id: voiceId })
      .eq('team_id', teamId);
    
    return !error;
  }

  /**
   * Check if team has phone provisioned
   */
  async teamHasPhone(teamId: string): Promise<boolean> {
    const config = await this.getTeamPhoneConfig(teamId);
    return config !== null && config.status === 'active';
  }

  /**
   * Estimate monthly cost for team
   */
  calculateMonthlyCost(estimatedMinutes: number): any {
    const twilioNumberCost = 1.50; // Average US number cost
    const vapiCostPerMinute = 0.08; // Vapi pricing
    const twilioVoiceCostPerMinute = 0.013; // Twilio voice pricing
    
    const totalPerMinute = vapiCostPerMinute + twilioVoiceCostPerMinute;
    const usageCost = estimatedMinutes * totalPerMinute;
    
    return {
      fixedCosts: {
        twilioNumber: twilioNumberCost
      },
      variableCosts: {
        estimatedMinutes,
        costPerMinute: totalPerMinute,
        totalUsage: usageCost
      },
      totalMonthly: twilioNumberCost + usageCost
    };
  }
}

export default new PhoneProvisioningService();