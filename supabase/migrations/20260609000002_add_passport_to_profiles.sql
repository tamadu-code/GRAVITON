-- Migration: Add passport to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS passport TEXT;
