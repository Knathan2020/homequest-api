import { Router, Request, Response } from 'express';
import Stripe from 'stripe';

const router = Router();

// Initialize Stripe (you'll need to add STRIPE_SECRET_KEY to your environment variables)
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-08-27.basil',
});

// Pricing tiers configuration
const PRICING_TIERS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 299,
    priceId: process.env.STRIPE_PRICE_STARTER || 'price_starter',
    maxProjects: 2,
    maxUsers: 2,
    features: [
      'AI Blueprint Processing - Automatic wall & room detection from any plan',
      '3D Floor Plans & Site Visualization - See your project before you build',
      'Smart Vendor Bidding - Send requests, track responses, compare quotes',
      'Auto-Vendor Messaging - AI texts & emails vendors, or calls them for you',
      'Real-Time Team Collaboration - Keep your crew and subs in sync',
      'Construction Phase Tracking - Monitor progress from foundation to finish',
      'Smart Document Management - All plans, permits & contracts organized',
      'AI Phone System - Automated vendor scheduling and follow-ups',
      'GIS & Terrain Analysis - Site planning with real elevation data',
      'Email Integration - Gmail & Outlook with smart inbox management',
      'Mobile Access - Run your jobs from the field',
      'Cost & Usage Analytics - Track spending and project performance',
      'Unlimited Project Archive - Keep every job for future reference'
    ]
  },
  {
    id: 'professional',
    name: 'Professional',
    price: 599,
    priceId: process.env.STRIPE_PRICE_PROFESSIONAL || 'price_professional',
    maxProjects: 6,
    maxUsers: 6,
    features: [
      'AI Blueprint Processing - Automatic wall & room detection from any plan',
      '3D Floor Plans & Site Visualization - See your project before you build',
      'Smart Vendor Bidding - Send requests, track responses, compare quotes',
      'Auto-Vendor Messaging - AI texts & emails vendors, or calls them for you',
      'Real-Time Team Collaboration - Keep your crew and subs in sync',
      'Construction Phase Tracking - Monitor progress from foundation to finish',
      'Smart Document Management - All plans, permits & contracts organized',
      'AI Phone System - Automated vendor scheduling and follow-ups',
      'GIS & Terrain Analysis - Site planning with real elevation data',
      'Email Integration - Gmail & Outlook with smart inbox management',
      'Mobile Access - Run your jobs from the field',
      'Cost & Usage Analytics - Track spending and project performance',
      'Unlimited Project Archive - Keep every job for future reference'
    ]
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: 999,
    priceId: process.env.STRIPE_PRICE_ENTERPRISE || 'price_enterprise',
    maxProjects: -1, // Unlimited
    maxUsers: -1, // Unlimited
    features: [
      'AI Blueprint Processing - Automatic wall & room detection from any plan',
      '3D Floor Plans & Site Visualization - See your project before you build',
      'Smart Vendor Bidding - Send requests, track responses, compare quotes',
      'Auto-Vendor Messaging - AI texts & emails vendors, or calls them for you',
      'Real-Time Team Collaboration - Keep your crew and subs in sync',
      'Construction Phase Tracking - Monitor progress from foundation to finish',
      'Smart Document Management - All plans, permits & contracts organized',
      'AI Phone System - Automated vendor scheduling and follow-ups',
      'GIS & Terrain Analysis - Site planning with real elevation data',
      'Email Integration - Gmail & Outlook with smart inbox management',
      'Mobile Access - Run your jobs from the field',
      'Cost & Usage Analytics - Track spending and project performance',
      'Unlimited Project Archive - Keep every job for future reference'
    ]
  }
];

/**
 * GET /api/payments/tiers
 * Get all pricing tiers
 */
router.get('/tiers', async (req: Request, res: Response) => {
  try {
    res.json({
      success: true,
      data: PRICING_TIERS,
      message: 'Pricing tiers retrieved successfully'
    });
  } catch (error) {
    console.error('Error fetching tiers:', error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to fetch pricing tiers',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/payments/checkout
 * Create a Stripe Checkout session
 */
router.post('/checkout', async (req: Request, res: Response) => {
  try {
    const { tier, billingCycle, email, userId } = req.body;

    // Find the selected tier
    const selectedTier = PRICING_TIERS.find(t => t.id === tier);
    if (!selectedTier) {
      return res.status(400).json({
        success: false,
        data: null,
        message: 'Invalid pricing tier selected'
      });
    }

    // Determine the price based on billing cycle
    let priceId = selectedTier.priceId;

    // If you have separate price IDs for annual/monthly, handle that here
    // For now, we'll use the monthly price ID
    if (billingCycle === 'annual') {
      // You would need to create annual price IDs in Stripe
      // For now, we'll use the monthly one
      priceId = selectedTier.priceId;
    }

    // Get the success and cancel URLs from environment or use defaults
    const successUrl = process.env.STRIPE_SUCCESS_URL || `${req.headers.origin}/payment/success?session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = process.env.STRIPE_CANCEL_URL || `${req.headers.origin}/pricing`;

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      customer_email: email || undefined,
      client_reference_id: userId || undefined,
      subscription_data: {
        trial_period_days: 14, // 2-week free trial
        metadata: {
          tier,
          userId: userId || 'guest',
          billingCycle
        }
      },
      metadata: {
        tier,
        userId: userId || 'guest',
        billingCycle
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      allow_promotion_codes: true, // Allow discount codes
    });

    res.json({
      success: true,
      data: {
        sessionId: session.id,
        url: session.url
      },
      message: 'Checkout session created successfully'
    });
  } catch (error) {
    console.error('Error creating checkout session:', error);
    res.status(500).json({
      success: false,
      data: null,
      message: 'Failed to create checkout session',
      error: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/payments/webhook
 * Handle Stripe webhook events
 */
router.post('/webhook', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    return res.status(400).send('Webhook secret not configured');
  }

  try {
    // Verify the webhook signature
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      webhookSecret
    );

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed':
        const session = event.data.object as Stripe.Checkout.Session;
        console.log('Payment successful:', session.id);
        // TODO: Update user subscription status in database
        break;

      case 'customer.subscription.updated':
        const subscription = event.data.object as Stripe.Subscription;
        console.log('Subscription updated:', subscription.id);
        // TODO: Update subscription status in database
        break;

      case 'customer.subscription.deleted':
        const deletedSubscription = event.data.object as Stripe.Subscription;
        console.log('Subscription cancelled:', deletedSubscription.id);
        // TODO: Handle subscription cancellation in database
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(400).send(`Webhook Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

export default router;
