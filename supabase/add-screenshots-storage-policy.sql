-- Add Storage Policies for screenshots folder
-- Run this in Supabase SQL Editor

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Authenticated users can upload screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Public can read screenshots" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete screenshots" ON storage.objects;

-- 1. Allow authenticated users to upload files to screenshots folder
CREATE POLICY "Authenticated users can upload screenshots"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'dtlabs' 
  AND (storage.foldername(name))[1] = 'screenshots'
);

-- 2. Allow authenticated users to read screenshots
CREATE POLICY "Authenticated users can read screenshots"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'dtlabs' 
  AND (storage.foldername(name))[1] = 'screenshots'
);

-- 3. Allow public to read screenshots (optional - remove if you want private)
CREATE POLICY "Public can read screenshots"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'dtlabs' AND (storage.foldername(name))[1] = 'screenshots');

-- 4. Allow authenticated users to delete screenshots (optional)
CREATE POLICY "Authenticated users can delete screenshots"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'dtlabs' 
  AND (storage.foldername(name))[1] = 'screenshots'
);

-- Note: 
-- - Make sure the bucket 'dtlabs' exists
-- - If you want screenshots to be private, remove policy #3 (Public can read screenshots)
-- - These policies require users to be authenticated to upload
