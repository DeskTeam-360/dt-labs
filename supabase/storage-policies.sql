-- Storage Bucket Policies for 'dtlabs' bucket
-- Run this in Supabase SQL Editor after creating the bucket

-- 1. Allow authenticated users to upload files to avatars folder
CREATE POLICY "Authenticated users can upload avatars"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'dtlabs' 
  AND (storage.foldername(name))[1] = 'avatars'
);

-- 2. Allow authenticated users to update their own avatars
CREATE POLICY "Users can update own avatars"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'dtlabs' 
  AND (storage.foldername(name))[1] = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[2]
)
WITH CHECK (
  bucket_id = 'dtlabs' 
  AND (storage.foldername(name))[1] = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[2]
);

-- 3. Allow authenticated users to delete their own avatars
CREATE POLICY "Users can delete own avatars"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'dtlabs' 
  AND (storage.foldername(name))[1] = 'avatars'
  AND auth.uid()::text = (storage.foldername(name))[2]
);

-- 4. Allow public to read avatars (optional - remove if you want private)
CREATE POLICY "Public can read avatars"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'dtlabs' AND (storage.foldername(name))[1] = 'avatars');

-- Alternative: If you want only authenticated users to read
-- CREATE POLICY "Authenticated can read avatars"
-- ON storage.objects FOR SELECT
-- TO authenticated
-- USING (bucket_id = 'dtlabs' AND (storage.foldername(name))[1] = 'avatars');

-- 5. Allow authenticated users to upload files to screenshots folder
CREATE POLICY "Authenticated users can upload screenshots"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'dtlabs' 
  AND (storage.foldername(name))[1] = 'screenshots'
);

-- 6. Allow authenticated users to read screenshots
CREATE POLICY "Authenticated users can read screenshots"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'dtlabs' 
  AND (storage.foldername(name))[1] = 'screenshots'
);

-- 7. Allow public to read screenshots (optional - remove if you want private)
CREATE POLICY "Public can read screenshots"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'dtlabs' AND (storage.foldername(name))[1] = 'screenshots');

-- 8. Allow authenticated users to delete screenshots (optional)
CREATE POLICY "Authenticated users can delete screenshots"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'dtlabs' 
  AND (storage.foldername(name))[1] = 'screenshots'
);

-- Note: Make sure the bucket 'dtlabs' is created and set to PUBLIC or AUTHENTICATED
-- In Supabase Dashboard: Storage > Create Bucket > Name: dtlabs > Public: Yes/No



