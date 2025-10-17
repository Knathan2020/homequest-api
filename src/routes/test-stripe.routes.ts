import { Router } from 'express';

const router = Router();

router.get('/test-stripe-key', (req, res) => {
  const hasKey = !!process.env.STRIPE_SECRET_KEY;
  const keyPrefix = process.env.STRIPE_SECRET_KEY?.substring(0, 7) || 'none';
  
  res.json({
    hasStripeKey: hasKey,
    keyPrefix: keyPrefix,
    allEnvKeys: Object.keys(process.env).filter(k => k.includes('STRIPE'))
  });
});

export default router;
