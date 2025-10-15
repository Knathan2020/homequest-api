import { Router } from 'express';
import { PaymentController } from '../controllers/payment.controller';
import express from 'express';

const router = Router();

// Get all pricing tiers
router.get('/tiers', PaymentController.getTiers);

// Create checkout session
router.post('/checkout', PaymentController.createCheckoutSession);

// Get subscription details
router.get('/subscription/:subscriptionId', PaymentController.getSubscription);

// Cancel subscription
router.delete('/subscription/:subscriptionId', PaymentController.cancelSubscription);

// Update subscription tier
router.put('/subscription/:subscriptionId/tier', PaymentController.updateSubscriptionTier);

// Check project limit
router.get('/limits/projects', PaymentController.checkProjectLimit);

// Check user limit
router.get('/limits/users', PaymentController.checkUserLimit);

// Stripe webhook endpoint (needs raw body)
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  PaymentController.handleWebhook
);

export default router;
