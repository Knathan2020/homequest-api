/**
 * Stripe Billing Service
 * Handles subscription management, trials, and payment processing
 */

import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2024-12-18.acacia' as any
});

const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

// Pricing Configuration
const PRICING = {
  BUILDER: {
    price: 29900, // $299 in cents
    priceId: process.env.STRIPE_BUILDER_PRICE_ID || 'price_builder_299',
    maxUsers: 5,
    includedUsers: 2,
    maxActiveProjects: 2,
    additionalUserPrice: 5000 // $50 in cents
  },
  BUILDER_PRO: {
    price: 79900, // $799 in cents
    priceId: process.env.STRIPE_PRO_PRICE_ID || 'price_builder_pro_799',
    maxUsers: 10,
    includedUsers: 5,
    maxActiveProjects: 7,
    additionalUserPrice: 5000 // $50 in cents
  },
  ELITE: {
    price: 0, // Custom pricing
    priceId: 'price_elite_custom',
    maxUsers: -1, // Unlimited
    includedUsers: -1,
    maxActiveProjects: -1,
    additionalUserPrice: 0
  }
};

class StripeBillingService {
  /**
   * Create a new customer with trial subscription
   */
  async createCustomerWithTrial(userData: {
    email: string;
    name: string;
    teamId: string;
    companyName: string;
  }) {
    try {
      console.log('💳 Creating Stripe customer for:', userData.email);

      // Create Stripe customer
      const customer = await stripe.customers.create({
        email: userData.email,
        name: userData.name,
        metadata: {
          team_id: userData.teamId,
          company_name: userData.companyName
        }
      });

      console.log('✅ Stripe customer created:', customer.id);

      // Create subscription with 14-day trial
      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{
          price: PRICING.BUILDER.priceId
        }],
        trial_period_days: 14,
        payment_behavior: 'default_incomplete',
        payment_settings: {
          save_default_payment_method: 'on_subscription'
        },
        metadata: {
          team_id: userData.teamId
        },
        expand: ['latest_invoice.payment_intent']
      });

      console.log('✅ Trial subscription created:', subscription.id);

      // Save to database
      await supabase
        .from('team_billing')
        .insert({
          team_id: userData.teamId,
          stripe_customer_id: customer.id,
          stripe_subscription_id: subscription.id,
          subscription_tier: 'builder',
          subscription_status: 'trialing',
          trial_ends_at: new Date(subscription.trial_end! * 1000).toISOString(),
          current_users: 1,
          max_users: PRICING.BUILDER.maxUsers,
          included_users: PRICING.BUILDER.includedUsers,
          max_active_projects: PRICING.BUILDER.maxActiveProjects,
          created_at: new Date().toISOString()
        });

      // Get the client secret for payment method collection
      const invoice = subscription.latest_invoice as Stripe.Invoice;
      const paymentIntent = (invoice as any).payment_intent as Stripe.PaymentIntent;

      return {
        success: true,
        customerId: customer.id,
        subscriptionId: subscription.id,
        clientSecret: paymentIntent?.client_secret,
        trialEndsAt: new Date(subscription.trial_end! * 1000)
      };

    } catch (error: any) {
      console.error('Stripe error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Add payment method to customer
   */
  async attachPaymentMethod(customerId: string, paymentMethodId: string) {
    try {
      // Attach payment method to customer
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId
      });

      // Set as default payment method
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });

      return { success: true };
    } catch (error: any) {
      console.error('Error attaching payment method:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Handle team member additions (charge extra users)
   */
  async handleTeamMemberAddition(teamId: string) {
    try {
      // Get team billing info
      const { data: billing } = await supabase
        .from('team_billing')
        .select('*')
        .eq('team_id', teamId)
        .single();

      if (!billing) {
        throw new Error('No billing info found');
      }

      const currentUsers = billing.current_users + 1;

      // Check if we need to charge for additional users
      if (currentUsers > billing.included_users) {
        const additionalUsers = currentUsers - billing.included_users;

        // Add usage-based charge for extra users
        await (stripe.subscriptionItems as any).createUsageRecord(
          billing.stripe_subscription_item_id,
          {
            quantity: additionalUsers,
            timestamp: 'now',
            action: 'set'
          }
        );
      }

      // Update user count
      await supabase
        .from('team_billing')
        .update({ current_users: currentUsers })
        .eq('team_id', teamId);

      // Check if upgrade needed (more than 5 users on Builder)
      if (billing.subscription_tier === 'builder' && currentUsers > PRICING.BUILDER.maxUsers) {
        return {
          success: false,
          upgradeRequired: true,
          message: 'Upgrade to Builder Pro required for more than 5 users'
        };
      }

      return { success: true, currentUsers };

    } catch (error: any) {
      console.error('Error handling team member addition:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Upgrade subscription tier
   */
  async upgradeTier(teamId: string, newTier: 'builder_pro' | 'elite') {
    try {
      const { data: billing } = await supabase
        .from('team_billing')
        .select('*')
        .eq('team_id', teamId)
        .single();

      if (!billing) {
        throw new Error('No billing info found');
      }

      const newPrice = newTier === 'builder_pro' ? PRICING.BUILDER_PRO : PRICING.ELITE;

      // Update subscription
      const subscription = await stripe.subscriptions.update(billing.stripe_subscription_id, {
        items: [{
          id: billing.stripe_subscription_item_id,
          price: newPrice.priceId
        }],
        proration_behavior: 'create_prorations'
      });

      // Update database
      await supabase
        .from('team_billing')
        .update({
          subscription_tier: newTier,
          max_users: newPrice.maxUsers,
          included_users: newPrice.includedUsers,
          max_active_projects: newPrice.maxActiveProjects
        })
        .eq('team_id', teamId);

      return { success: true, subscription };

    } catch (error: any) {
      console.error('Error upgrading tier:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(teamId: string) {
    try {
      const { data: billing } = await supabase
        .from('team_billing')
        .select('stripe_subscription_id')
        .eq('team_id', teamId)
        .single();

      if (!billing) {
        throw new Error('No billing info found');
      }

      // Cancel at period end
      const subscription = await stripe.subscriptions.update(
        billing.stripe_subscription_id,
        { cancel_at_period_end: true }
      );

      // Update database
      await supabase
        .from('team_billing')
        .update({
          subscription_status: 'canceling',
          cancels_at: new Date(subscription.current_period_end * 1000).toISOString()
        })
        .eq('team_id', teamId);

      return { success: true, cancelsAt: subscription.current_period_end };

    } catch (error: any) {
      console.error('Error canceling subscription:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if team can create more projects
   */
  async canCreateProject(teamId: string): Promise<boolean> {
    try {
      const { data: billing } = await supabase
        .from('team_billing')
        .select('max_active_projects, subscription_tier')
        .eq('team_id', teamId)
        .single();

      if (!billing) return false;

      // Count active projects
      const { count } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId)
        .eq('status', 'active');

      return (count || 0) < billing.max_active_projects;

    } catch (error) {
      console.error('Error checking project limit:', error);
      return false;
    }
  }

  /**
   * Handle webhook events from Stripe
   */
  async handleWebhook(event: Stripe.Event) {
    switch (event.type) {
      case 'customer.subscription.trial_will_end':
        // Send reminder email 3 days before trial ends
        await this.handleTrialEndingSoon(event.data.object as Stripe.Subscription);
        break;

      case 'customer.subscription.updated':
        // Update subscription status
        await this.updateSubscriptionStatus(event.data.object as Stripe.Subscription);
        break;

      case 'invoice.payment_failed':
        // Handle failed payment
        await this.handleFailedPayment(event.data.object as Stripe.Invoice);
        break;

      case 'customer.subscription.deleted':
        // Handle subscription cancellation
        await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
    }
  }

  private async handleTrialEndingSoon(subscription: Stripe.Subscription) {
    // Send email notification
    console.log('Trial ending soon for:', subscription.id);
  }

  private async updateSubscriptionStatus(subscription: Stripe.Subscription) {
    await supabase
      .from('team_billing')
      .update({ subscription_status: subscription.status })
      .eq('stripe_subscription_id', subscription.id);
  }

  private async handleFailedPayment(invoice: Stripe.Invoice) {
    console.log('Payment failed for invoice:', invoice.id);
    // Could disable team features here
  }

  private async handleSubscriptionDeleted(subscription: Stripe.Subscription) {
    await supabase
      .from('team_billing')
      .update({
        subscription_status: 'canceled',
        canceled_at: new Date().toISOString()
      })
      .eq('stripe_subscription_id', subscription.id);
  }
}

export default new StripeBillingService();