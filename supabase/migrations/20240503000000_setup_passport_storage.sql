-- ----------------------------------------------------------------
-- SETUP PASSPORT STORAGE BUCKET
-- ----------------------------------------------------------------

-- 1. Create the bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('passports', 'passports', true)
ON CONFLICT (id) DO NOTHING;

-- 2. Allow Public Read Access
-- This allows anyone to view the passport images via public URL
CREATE POLICY "Public Read Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'passports');

-- 3. Allow Authenticated Uploads
-- Allows any authenticated user to upload to the passports bucket
-- Note: In a production environment, you might restrict this further by path
CREATE POLICY "Authenticated Upload Access"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'passports');

-- 4. Allow Authenticated Updates/Deletions
CREATE POLICY "Authenticated Update Access"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'passports');

CREATE POLICY "Authenticated Delete Access"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'passports');
