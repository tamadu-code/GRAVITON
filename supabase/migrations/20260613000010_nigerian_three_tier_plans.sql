-- Migration: Restructure plans to three-tier Nigerian pricing model
-- Description: Renames existing plans and updates to Naira-based pricing with descriptions
-- and per-student rates for the hybrid billing model.

-- Add new columns for the Nigerian market pricing model
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '';
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS per_student_rate NUMERIC(10,2) NOT NULL DEFAULT 0.00;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS target_audience VARCHAR(200) NOT NULL DEFAULT '';

-- Delete old plans and re-seed with Nigerian three-tier model
DELETE FROM public.plans;

INSERT INTO public.plans (name, price, duration, student_limit, per_student_rate, target_audience, description, features) VALUES
(
  'Starter Plan',
  25000.00,
  'Year',
  50,
  0.00,
  'Micro-schools & Tutoring Centers (< 50 students)',
  'Low-cost entry for nursery schools and small tutoring centers. Core SIS features with basic attendance and manual grading.',
  '{"sms": false, "cbt": false, "push_notifications": true, "offline_access": true}'::jsonb
),
(
  'Professional Plan',
  60000.00,
  'Term',
  500,
  200.00,
  'Small to Medium K-12 Schools (100-500 students)',
  'The sweet spot: hybrid pricing with base fee + per-student rate. Includes fully integrated LMS, online payments (Paystack/USSD), parent portal, automated WAEC/NECO reports, and dedicated support.',
  '{"sms": true, "cbt": true, "push_notifications": true, "offline_access": true, "advanced_analytics": true, "parent_portal": true, "online_payments": true, "automated_reports": true}'::jsonb
),
(
  'Enterprise Plan',
  0.00,
  'Year',
  99999,
  350.00,
  'Large Schools & Multi-Campus Groups (500+ students)',
  'Custom per-student pricing with volume discounts. Includes API access, advanced HR/payroll, white-labeling, dedicated account manager, and custom SLAs.',
  '{"sms": true, "cbt": true, "push_notifications": true, "offline_access": true, "advanced_analytics": true, "parent_portal": true, "online_payments": true, "automated_reports": true, "api_access": true, "white_labeling": true, "dedicated_support": true}'::jsonb
);
