-- Migration: Add missing CBT columns in cloud
-- Run this in the Supabase SQL Editor to synchronize cloud schema with IndexedDB BUILD v229

-- 1. Add missing columns to cbt_question_bank
ALTER TABLE cbt_question_bank ADD COLUMN IF NOT EXISTS class_name TEXT;
ALTER TABLE cbt_question_bank ADD COLUMN IF NOT EXISTS term TEXT;
ALTER TABLE cbt_question_bank ADD COLUMN IF NOT EXISTS session TEXT;
ALTER TABLE cbt_question_bank ADD COLUMN IF NOT EXISTS passage_text TEXT;

-- 2. Add missing columns to cbt_exams
ALTER TABLE cbt_exams ADD COLUMN IF NOT EXISTS specialization TEXT;

-- 3. Add missing columns to cbt_exam_sections
ALTER TABLE cbt_exam_sections ADD COLUMN IF NOT EXISTS specialization TEXT;

-- 4. Add missing columns to cbt_questions (just in case)
ALTER TABLE cbt_questions ADD COLUMN IF NOT EXISTS passage_text TEXT;
