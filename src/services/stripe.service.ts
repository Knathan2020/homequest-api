import Stripe from 'stripe';
import { loggers } from '../utils/logger';

const logger = loggers.system;

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is required');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-08-27.basil',
});

// Tier configuration with actual Stripe Price IDs
export const PRICING_TIERS = {
  starter: {
    name: 'Starter',
    price: 299,
    priceId: process.env.STRIPE_STARTER_PRICE_ID || 'price_1SIXUT2Kl52GSEUg38EyHy3A',
    maxProjects: 2,
    maxUsers: 2,
    features: [
      '2 Active Projects',
      '2 Team Members',
      'All Premium Features',
      'AI Floor Plan Processing',
      'Email Support'
    ]
  },
  professional: {
    name: 'Professional',
    price: 599,
    priceId: process.env.STRIPE_PROFESSIONAL_PRICE_ID || 'price_1SIXV02Kl52GSEUgtqGRoKnK',
    maxProjects: 6,
    maxUsers: 6,
    features: [
      '6 Active Projects',
      '6 Team Members',
      'All Premium Features',
      'AI Floor Plan Processing',
      'Priority Support',
      'Advanced Analytics'
    ]
  },
  enterprise: {
    name: 'Enterprise',
    price: 999,
    priceId: process.env.STRIPE_ENTERPRISE_PRICE_ID || 'price_1SIXVQ2Kl52GSEUggBy1dJjY',
    maxProjects: -1, // -1 means unlimited
    maxUsers: -1, // -1 means unlimited
    features: [
      'Unlimited Projects',
      'Unlimited Team Members',
      'All Premium Features',
      'AI Floor Plan Processing',
      '24/7 Priority Support',
      'Advanced Analytics',
      'Custom Integrations',
      'Dedicated Account Manager'
    ]
  }
};

export type TierType = keyof typeof PRICING_TIERS;

export class StripeService {
  /**
   * Create a checkout session for tier subscription
   */
  static async createCheckoutSession(params: {
    tier: TierType;
    customerEmail: string;
    userId?: string;
    successUrl: string;
    cancelUrl: string;
  }): Promise<Stripe.Checkout.Session> {
    try {
      const { tier, customerEmail, userId, successUrl, cancelUrl } = params;
      const tierInfo = PRICING_TIERS[tier];

      if (!tierInfo) {
        throw new Error(`Invalid tier: ${tier}`);
      }

      const sessionParams: Stripe.Checkout.SessionCreateParams = {
        mode: 'subscription',
        customer_email: customerEmail,
        line_items: [
          {
            price: tierInfo.priceId,
            quantity: 1,
          },
        ],
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          tier,
          userId: userId || '',
        },
        subscription_data: {
          metadata: {
            tier,
            userId: userId || '',
          },
        },
      };

      const session = await stripe.checkout.sessions.create(sessionParams);
      logger.info(`Checkout session created for ${tier} tier: ${session.id}`);

      return session;
    } catch (error) {
      logger.error('Error creating checkout session:', error);
      throw error;
    }
  }

  /**
   * Create or retrieve a customer
   */
  static async createOrGetCustomer(email: string, name?: string, userId?: string): Promise<Stripe.Customer> {
    try {
      // Check if customer already exists
      const existingCustomers = await stripe.customers.list({
        email,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        logger.info(`Customer found: ${existingCustomers.data[0].id}`);
        return existingCustomers.data[0];
      }

      // Create new customer
      const customer = await stripe.customers.create({
        email,
        name,
        metadata: {
          userId: userId || '',
        },
      });

      logger.info(`Customer created: ${customer.id}`);
      return customer;
    } catch (error) {
      logger.error('Error creating/getting customer:', error);
      throw error;
    }
  }

  /**
   * Get customer's active subscriptions
   */
  static async getCustomerSubscriptions(customerId: string): Promise<Stripe.Subscription[]> {
    try {
      const subscriptions = await stripe.subscriptions.list({
        customer: customerId,
        status: 'active',
      });

      return subscriptions.data;
    } catch (error) {
      logger.error('Error getting customer subscriptions:', error);
      throw error;
    }
  }

  /**
   * Get subscription details
   */
  static async getSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      return await stripe.subscriptions.retrieve(subscriptionId);
    } catch (error) {
      logger.error('Error retrieving subscription:', error);
      throw error;
    }
  }

  /**
   * Cancel a subscription
   */
  static async cancelSubscription(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      const subscription = await stripe.subscriptions.cancel(subscriptionId);
      logger.info(`Subscription canceled: ${subscription.id}`);
      return subscription;
    } catch (error) {
      logger.error('Error canceling subscription:', error);
      throw error;
    }
  }

  /**
   * Update subscription tier
   */
  static async updateSubscriptionTier(
    subscriptionId: string,
    newTier: TierType
  ): Promise<Stripe.Subscription> {
    try {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      const newTierInfo = PRICING_TIERS[newTier];

      if (!newTierInfo) {
        throw new Error(`Invalid tier: ${newTier}`);
      }

      const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
        items: [
          {
            id: subscription.items.data[0].id,
            price: newTierInfo.priceId,
          },
        ],
        metadata: {
          ...subscription.metadata,
          tier: newTier,
        },
        proration_behavior: 'always_invoice',
      });

      logger.info(`Subscription updated to ${newTier} tier: ${subscriptionId}`);
      return updatedSubscription;
    } catch (error) {
      logger.error('Error updating subscription:', error);
      throw error;
    }
  }

  /**
   * Construct webhook event from raw body and signature
   */
  static constructWebhookEvent(
    payload: string | Buffer,
    signature: string
  ): Stripe.Event {
    try {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
      if (!webhookSecret) {
        throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
      }

      return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    } catch (error) {
      logger.error('Error constructing webhook event:', error);
      throw error;
    }
  }

  /**
   * Get all available tiers
   */
  static getTiers() {
    return Object.entries(PRICING_TIERS).map(([key, value]) => ({
      id: key,
      ...value,
    }));
  }

  /**
   * Get tier limits for a given tier
   */
  static getTierLimits(tier: TierType) {
    const tierInfo = PRICING_TIERS[tier];
    if (!tierInfo) {
      throw new Error(`Invalid tier: ${tier}`);
    }

    return {
      maxProjects: tierInfo.maxProjects,
      maxUsers: tierInfo.maxUsers,
    };
  }

  /**
   * Check if user can add more projects
   */
  static canAddProject(tier: TierType, currentProjectCount: number): boolean {
    const limits = this.getTierLimits(tier);
    if (limits.maxProjects === -1) return true; // Unlimited
    return currentProjectCount < limits.maxProjects;
  }

  /**
   * Check if user can add more team members
   */
  static canAddUser(tier: TierType, currentUserCount: number): boolean {
    const limits = this.getTierLimits(tier);
    if (limits.maxUsers === -1) return true; // Unlimited
    return currentUserCount < limits.maxUsers;
  }
}

export default StripeService;
