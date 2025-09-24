/**
 * Webhook URLs Configuration
 * Centralized configuration for all webhook URLs
 * 
 * TO DEPLOY TO PRODUCTION:
 * Just change API_BASE_URL in .env from:
 *   https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev
 * to:
 *   https://api.homequesttech.com
 */

export class WebhookConfig {
  private static instance: WebhookConfig;
  private baseUrl: string;

  constructor() {
    // Use API_BASE_URL from environment
    // In production, this will be: https://api.homequesttech.com
    // In development, this is your GitHub Codespaces URL
    this.baseUrl = process.env.API_BASE_URL || 'https://cuddly-giggle-69p59v4xv5gw2rvw7-4000.app.github.dev';
    
    console.log(`📡 Webhook Base URL configured: ${this.baseUrl}`);
  }

  static getInstance(): WebhookConfig {
    if (!WebhookConfig.instance) {
      WebhookConfig.instance = new WebhookConfig();
    }
    return WebhookConfig.instance;
  }

  /**
   * Get the base API URL
   */
  getBaseUrl(): string {
    return this.baseUrl;
  }

  /**
   * Get WebSocket URL (for realtime connections)
   */
  getWebSocketUrl(path: string): string {
    const wsUrl = this.baseUrl.replace('https://', 'wss://').replace('http://', 'ws://');
    return `${wsUrl}${path}`;
  }

  /**
   * VAPI Webhooks
   */
  getVapiWebhooks() {
    return {
      voice: `${this.baseUrl}/api/vapi/webhook`,
      status: `${this.baseUrl}/api/vapi/status`,
      fallback: `${this.baseUrl}/api/vapi/fallback`
    };
  }

  /**
   * Twilio Webhooks (for phone provisioning)
   */
  getTwilioWebhooks() {
    return {
      voice: `${this.baseUrl}/api/vapi/webhook`,  // VAPI handles voice
      sms: `${this.baseUrl}/api/messaging/webhook`,
      status: `${this.baseUrl}/api/vapi/status`,
      fallback: `${this.baseUrl}/api/vapi/fallback`
    };
  }

  /**
   * OpenAI Realtime Webhooks
   */
  getRealtimeWebhooks() {
    return {
      inbound: `${this.baseUrl}/api/realtime/inbound`,
      status: `${this.baseUrl}/api/realtime/status`,
      stream: this.getWebSocketUrl('/api/realtime/websocket')
    };
  }

  /**
   * Check if running in production
   */
  isProduction(): boolean {
    return this.baseUrl.includes('homequesttech.com');
  }

  /**
   * Get webhook URL for a specific team
   * This can be used to add team-specific parameters
   */
  getTeamWebhook(teamId: string, type: 'voice' | 'sms' = 'voice'): string {
    const baseWebhook = type === 'voice' 
      ? this.getVapiWebhooks().voice 
      : this.getTwilioWebhooks().sms;
    
    // You can add team ID as a parameter if needed
    // return `${baseWebhook}?teamId=${teamId}`;
    
    // For now, we use the same webhook for all teams
    // The system identifies the team by the phone number
    return baseWebhook;
  }
}

// Export singleton instance
export default WebhookConfig.getInstance();