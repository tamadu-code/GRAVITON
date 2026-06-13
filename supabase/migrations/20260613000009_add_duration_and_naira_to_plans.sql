-- Migration: Add duration to plans and update rates to Naira
-- Description: Alters plans table to include billing duration, and updates prices to Naira.

ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS duration VARCHAR(50) NOT NULL DEFAULT 'Term';

-- Update existing seeded plans to Naira pricing and correct durations
UPDATE public.plans SET price = 0.00, duration = 'Month' WHERE name = 'Free Trial';
UPDATE public.plans SET price = 75000.00, duration = 'Term' WHERE name = 'Standard Plan';
UPDATE public.plans SET price = 150000.00, duration = 'Term' WHERE name = 'Premium Plan';
UPDATE public.plans SET price = 350000.00, duration = 'Term' WHERE name = 'Custom Enterprise';
