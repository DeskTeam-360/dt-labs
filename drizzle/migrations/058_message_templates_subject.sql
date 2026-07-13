-- Add email subject field to message_templates so admins can customize the subject line
ALTER TABLE message_templates ADD COLUMN IF NOT EXISTS email_subject text;

-- Disable account activation template — no activation flow exists in the app
UPDATE message_templates SET status = 'inactive' WHERE key = 'requester_notification_user_activation';
