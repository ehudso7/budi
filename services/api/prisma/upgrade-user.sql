-- Upgrade user to ENTERPRISE plan
-- Run this in your Supabase SQL Editor

-- Upgrade user evertonhudson@icloud.com to ENTERPRISE plan
UPDATE "User"
SET
  plan = 'ENTERPRISE',
  "subscriptionStatus" = 'ACTIVE',
  "currentPeriodEnd" = NOW() + INTERVAL '1 year'
WHERE email = 'evertonhudson@icloud.com';

-- Verify the update
SELECT
  id,
  email,
  name,
  plan,
  "subscriptionStatus",
  "currentPeriodEnd"
FROM "User"
WHERE email = 'evertonhudson@icloud.com';
