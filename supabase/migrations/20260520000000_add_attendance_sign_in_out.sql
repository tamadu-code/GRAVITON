-- Migration: Add Biometric Sign-in/out and Lateness fields to daily attendance table
-- Description: Ensures the daily attendance table supports biometric sign-in, sign-out, and lateness tracking.

ALTER TABLE attendance 
ADD COLUMN IF NOT EXISTS sign_in TEXT,
ADD COLUMN IF NOT EXISTS sign_out TEXT,
ADD COLUMN IF NOT EXISTS is_late BOOLEAN DEFAULT FALSE;
