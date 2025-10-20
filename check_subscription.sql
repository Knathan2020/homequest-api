-- Check if teams have subscriptions
SELECT 
  t.id as team_id,
  t.name as team_name,
  t.subscription_tier,
  s.tier as subscription_tier_from_subscriptions,
  s.status,
  s.stripe_subscription_id
FROM teams t
LEFT JOIN subscriptions s ON t.id = s.team_id
LIMIT 10;
