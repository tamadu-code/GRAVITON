-- Migration: Add employment_type to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'Full-Time';
