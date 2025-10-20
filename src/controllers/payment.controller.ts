import { Request, Response } from 'express';
import StripeService, { TierType, PRICING_TIERS } from '../services/stripe.service';
import { loggers } from '../utils/logger';

const logger = loggers.system;

export class PaymentController {
  /**
   * Get all available pricing tiers
   */
  static async getTiers(req: Request, res: Response): Promise<void> {
    try {
      const tiers = StripeService.getTiers();
      res.json({
        success: true,
        data: tiers,
      });
    } catch (error) {
      logger.error('Error getting tiers:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve pricing tiers',
      });
    }
  }

  /**
   * Create a checkout session for a specific tier
   */
  static async createCheckoutSession(req: Request, res: Response): Promise<void> {
    try {
      const { tier, email, userId } = req.body;

      if (!tier || !email) {
        res.status(400).json({
          success: false,
          error: 'Tier and email are required',
        });
        return;
      }

      if (!PRICING_TIERS[tier as TierType]) {
        res.status(400).json({
          success: false,
          error: 'Invalid tier selected',
        });
        return;
      }

      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const session = await StripeService.createCheckoutSession({
        tier: tier as TierType,
        customerEmail: email,
        userId,
        successUrl: `${baseUrl}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
        cancelUrl: `${baseUrl}/pricing?canceled=true`,
      });

      res.json({
        success: true,
        data: {
          sessionId: session.id,
          url: session.url,
        },
      });
    } catch (error) {
      logger.error('Error creating checkout session:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create checkout session',
      });
    }
  }

  /**
   * Get subscription details
   */
  static async getSubscription(req: Request, res: Response): Promise<void> {
    try {
      const { subscriptionId } = req.params;

      if (!subscriptionId) {
        res.status(400).json({
          success: false,
          error: 'Subscription ID is required',
        });
        return;
      }

      const subscription = await StripeService.getSubscription(subscriptionId);

      res.json({
        success: true,
        data: {
          id: subscription.id,
          status: subscription.status,
          currentPeriodEnd: subscription.current_period_end,
          cancelAtPeriodEnd: subscription.cancel_at_period_end,
          tier: subscription.metadata.tier,
        },
      });
    } catch (error) {
      logger.error('Error getting subscription:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retrieve subscription',
      });
    }
  }

  /**
   * Cancel a subscription
   */
  static async cancelSubscription(req: Request, res: Response): Promise<void> {
    try {
      const { subscriptionId } = req.params;

      if (!subscriptionId) {
        res.status(400).json({
          success: false,
          error: 'Subscription ID is required',
        });
        return;
      }

      const subscription = await StripeService.cancelSubscription(subscriptionId);

      res.json({
        success: true,
        data: {
          id: subscription.id,
          status: subscription.status,
        },
      });
    } catch (error) {
      logger.error('Error canceling subscription:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to cancel subscription',
      });
    }
  }

  /**
   * Update subscription tier
   */
  static async updateSubscriptionTier(req: Request, res: Response): Promise<void> {
    try {
      const { subscriptionId } = req.params;
      const { newTier } = req.body;

      if (!subscriptionId || !newTier) {
        res.status(400).json({
          success: false,
          error: 'Subscription ID and new tier are required',
        });
        return;
      }

      if (!PRICING_TIERS[newTier as TierType]) {
        res.status(400).json({
          success: false,
          error: 'Invalid tier selected',
        });
        return;
      }

      const subscription = await StripeService.updateSubscriptionTier(
        subscriptionId,
        newTier as TierType
      );

      res.json({
        success: true,
        data: {
          id: subscription.id,
          tier: subscription.metadata.tier,
          status: subscription.status,
        },
      });
    } catch (error) {
      logger.error('Error updating subscription tier:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update subscription tier',
      });
    }
  }

  /**
   * Check if user can add more projects
   */
  static async checkProjectLimit(req: Request, res: Response): Promise<void> {
    try {
      const { tier, currentProjectCount } = req.query;

      if (!tier || currentProjectCount === undefined) {
        res.status(400).json({
          success: false,
          error: 'Tier and current project count are required',
        });
        return;
      }

      const canAdd = StripeService.canAddProject(
        tier as TierType,
        parseInt(currentProjectCount as string, 10)
      );

      const limits = StripeService.getTierLimits(tier as TierType);

      res.json({
        success: true,
        data: {
          canAdd,
          maxProjects: limits.maxProjects,
          currentCount: parseInt(currentProjectCount as string, 10),
        },
      });
    } catch (error) {
      logger.error('Error checking project limit:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check project limit',
      });
    }
  }

  /**
   * Check if user can add more team members
   */
  static async checkUserLimit(req: Request, res: Response): Promise<void> {
    try {
      const { tier, currentUserCount } = req.query;

      if (!tier || currentUserCount === undefined) {
        res.status(400).json({
          success: false,
          error: 'Tier and current user count are required',
        });
        return;
      }

      const canAdd = StripeService.canAddUser(
        tier as TierType,
        parseInt(currentUserCount as string, 10)
      );

      const limits = StripeService.getTierLimits(tier as TierType);

      res.json({
        success: true,
        data: {
          canAdd,
          maxUsers: limits.maxUsers,
          currentCount: parseInt(currentUserCount as string, 10),
        },
      });
    } catch (error) {
      logger.error('Error checking user limit:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to check user limit',
      });
    }
  }

  /**
   * Handle Stripe webhooks
   */
  static async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      const signature = req.headers['stripe-signature'];

      if (!signature) {
        res.status(400).json({
          success: false,
          error: 'Missing stripe-signature header',
        });
        return;
      }

      const event = StripeService.constructWebhookEvent(
        req.body,
        signature as string
      );

      logger.info(`Webhook received: ${event.type}`);

      // Handle different event types
      switch (event.type) {
        case 'checkout.session.completed':
          await PaymentController.handleCheckoutSessionCompleted(event);
          break;

        case 'customer.subscription.updated':
          await PaymentController.handleSubscriptionUpdated(event);
          break;

        case 'customer.subscription.deleted':
          await PaymentController.handleSubscriptionDeleted(event);
          break;

        case 'invoice.payment_succeeded':
          await PaymentController.handlePaymentSucceeded(event);
          break;

        case 'invoice.payment_failed':
          await PaymentController.handlePaymentFailed(event);
          break;

        default:
          logger.info(`Unhandled event type: ${event.type}`);
      }

      res.json({ received: true });
    } catch (error) {
      logger.error('Error handling webhook:', error);
      res.status(400).json({
        success: false,
        error: 'Webhook error',
      });
    }
  }

  /**
   * Handle checkout session completed
   */
  private static async handleCheckoutSessionCompleted(event: any): Promise<void> {
    const session = event.data.object;
    logger.info(`Checkout completed for customer: ${session.customer}`);

    try {
      const { tier, userId } = session.metadata;

      if (!userId || !tier) {
        logger.error('Missing userId or tier in session metadata');
        return;
      }

      logger.info(`User ${userId} subscribed to ${tier} tier`);

      // Import supabase here to avoid circular dependency
      const { createClient } = require('@supabase/supabase-js');
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

      if (!supabaseUrl || !supabaseKey) {
        logger.error('Supabase credentials not configured');
        return;
      }

      const supabase = createClient(supabaseUrl, supabaseKey);

      // Get user's team_id from profiles
      const { data: profile } = await supabase
        .from('profiles')
        .select('team_id')
        .eq('id', userId)
        .single();

      if (!profile?.team_id) {
        logger.error(`No team found for user ${userId}`);
        return;
      }

      // Create subscription record
      const { data, error } = await supabase
        .from('subscriptions')
        .upsert({
          team_id: profile.team_id,
          tier: tier,
          status: 'active',
          stripe_customer_id: session.customer,
          stripe_subscription_id: session.subscription,
          current_period_end: new Date(session.subscription ? Date.now() + 30 * 24 * 60 * 60 * 1000 : Date.now()).toISOString(),
          trial_end: session.subscription_data?.trial_end ? new Date(session.subscription_data.trial_end * 1000).toISOString() : null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'team_id'
        });

      if (error) {
        logger.error('Error creating subscription:', error);
      } else {
        logger.info(`✅ Subscription created for team ${profile.team_id}`);

        // Sync tier to teams table for immediate limit enforcement
        const { error: tierError } = await supabase
          .from('teams')
          .update({ subscription_tier: tier })
          .eq('id', profile.team_id);

        if (tierError) {
          logger.error('Error updating team tier:', tierError);
        } else {
          logger.info(`✅ Team tier updated to ${tier}`);
        }
      }
    } catch (error) {
      logger.error('Error in handleCheckoutSessionCompleted:', error);
    }
  }

  /**
   * Handle subscription updated
   */
  private static async handleSubscriptionUpdated(event: any): Promise<void> {
    const subscription = event.data.object;
    logger.info(`Subscription updated: ${subscription.id}`);

    // TODO: Update user's subscription status in database
  }

  /**
   * Handle subscription deleted/canceled
   */
  private static async handleSubscriptionDeleted(event: any): Promise<void> {
    const subscription = event.data.object;
    logger.info(`Subscription canceled: ${subscription.id}`);

    // TODO: Update user's subscription status in database
  }

  /**
   * Handle payment succeeded
   */
  private static async handlePaymentSucceeded(event: any): Promise<void> {
    const invoice = event.data.object;
    logger.info(`Payment succeeded for invoice: ${invoice.id}`);

    // TODO: Update payment records in database
  }

  /**
   * Handle payment failed
   */
  private static async handlePaymentFailed(event: any): Promise<void> {
    const invoice = event.data.object;
    logger.error(`Payment failed for invoice: ${invoice.id}`);

    // TODO: Notify user and update database
  }
}

export default PaymentController;
