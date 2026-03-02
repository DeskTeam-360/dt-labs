-- Allow authenticated users to upload and read content-planner images (path: content-planner/{companyId}/{plannerId}/*)
CREATE POLICY "Authenticated users can upload content-planner images"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'dtlabs'
  AND (storage.foldername(name))[1] = 'content-planner'
);

CREATE POLICY "Authenticated and public can read content-planner images"
ON storage.objects FOR SELECT
TO public
USING (
  bucket_id = 'dtlabs'
  AND (storage.foldername(name))[1] = 'content-planner'
);
