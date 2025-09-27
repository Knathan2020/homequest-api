-- Create team_billing table for Stripe integration
CREATE TABLE IF NOT EXISTS team_billing (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

  -- Stripe IDs
  stripe_customer_id TEXT UNIQUE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_subscription_item_id TEXT,
  stripe_payment_method_id TEXT,

  -- Subscription details
  subscription_tier TEXT DEFAULT 'builder' CHECK (subscription_tier IN ('trial', 'builder', 'builder_pro', 'elite')),
  subscription_status TEXT DEFAULT 'trialing' CHECK (subscription_status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'canceling')),

  -- Trial info
  trial_ends_at TIMESTAMP WITH TIME ZONE,
  trial_started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- User limits
  current_users INTEGER DEFAULT 1,
  max_users INTEGER DEFAULT 5,
  included_users INTEGER DEFAULT 2,
  additional_user_price INTEGER DEFAULT 5000, -- $50 in cents

  -- Project limits
  max_active_projects INTEGER DEFAULT 2,

  -- Billing dates
  current_period_start TIMESTAMP WITH TIME ZONE,
  current_period_end TIMESTAMP WITH TIME ZONE,
  canceled_at TIMESTAMP WITH TIME ZONE,
  cancels_at TIMESTAMP WITH TIME ZONE,

  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for faster lookups
CREATE INDEX idx_team_billing_team_id ON team_billing(team_id);
CREATE INDEX idx_team_billing_stripe_customer ON team_billing(stripe_customer_id);
CREATE INDEX idx_team_billing_status ON team_billing(subscription_status);

-- Add billing fields to teams table if not exists
ALTER TABLE teams
ADD COLUMN IF NOT EXISTS subscription_tier TEXT DEFAULT 'trial',
ADD COLUMN IF NOT EXISTS billing_email TEXT,
ADD COLUMN IF NOT EXISTS has_payment_method BOOLEAN DEFAULT FALSE;

-- Create payment history table
CREATE TABLE IF NOT EXISTS payment_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT,
  stripe_payment_intent_id TEXT,
  amount INTEGER NOT NULL, -- Amount in cents
  currency TEXT DEFAULT 'usd',
  status TEXT NOT NULL,
  description TEXT,
  invoice_pdf TEXT,
  paid_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create usage tracking table for overages
CREATE TABLE IF NOT EXISTS team_usage (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  month DATE NOT NULL,
  additional_users INTEGER DEFAULT 0,
  additional_user_charges INTEGER DEFAULT 0, -- in cents
  overage_minutes INTEGER DEFAULT 0,
  overage_charges INTEGER DEFAULT 0, -- in cents
  total_charges INTEGER DEFAULT 0, -- in cents
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(team_id, month)
);

-- Grant permissions
GRANT ALL ON team_billing TO anon, authenticated;
GRANT ALL ON payment_history TO anon, authenticated;
GRANT ALL ON team_usage TO anon, authenticated;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for team_billing
CREATE TRIGGER update_team_billing_updated_at BEFORE UPDATE ON team_billing
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();