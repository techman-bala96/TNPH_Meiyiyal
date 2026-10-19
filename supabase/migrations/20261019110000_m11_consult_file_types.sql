-- Consult attachments: photos, PDFs and Word documents only. The 20 MB cap stays.
-- Before this the bucket took any type (an .exe or .html would upload and be offered for download).
UPDATE storage.buckets SET allowed_mime_types = ARRAY[
  'image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif',
  'application/pdf',
  'application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document'
] WHERE id = 'consult-files';
