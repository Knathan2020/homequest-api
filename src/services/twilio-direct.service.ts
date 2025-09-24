/**
 * Direct Twilio Service
 * Provides direct access to Twilio client for phone provisioning
 */

import twilio from 'twilio';

// Use HomeQuest's Twilio credentials
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || process.env.TWILIO_ACCOUNT_SID;
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || process.env.TWILIO_AUTH_TOKEN;

class TwilioDirectService {
  public client: any;
  
  constructor() {
    this.client = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
    console.log('✅ Twilio Direct Service initialized');
  }

  /**
   * Get the Twilio client instance
   */
  getClient() {
    return this.client;
  }
}

// Export singleton instance
export default new TwilioDirectService();