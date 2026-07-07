-- ----------------------------------------------------------------
-- ADD AI DETECTION COLUMNS TO E-LEARNING SUBMISSIONS
-- ----------------------------------------------------------------

-- ai_scan_local: stores client-side heuristic analysis result (JSONB)
-- ai_scan_result: stores external ML API (GPTZero) deep scan result (JSONB)

ALTER TABLE public.elearning_submissions
  ADD COLUMN IF NOT EXISTS ai_scan_local JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_scan_result JSONB DEFAULT NULL;

-- Index for quick filtering of AI-flagged submissions
CREATE INDEX IF NOT EXISTS idx_elearning_submissions_ai_scan
  ON public.elearning_submissions USING GIN (ai_scan_local);
