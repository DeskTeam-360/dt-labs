-- Seeder: email_skip_list (emails yang tidak perlu ticket/user)
INSERT INTO email_skip_list (email, reason) VALUES
  ('id-newsletter@zohocorp.com', 'Zoho newsletter'),
  ('info@ses.uptimerobot.com', 'UptimeRobot notifications'),
  ('jeff@thequintingroup.com', NULL),
  ('noreply-apps-scripts-notifications@google.com', 'Google Apps Script bot'),
  ('noreply@hilltoptutors.com', NULL),
  ('notifications@mail.postman.com', 'Postman notifications'),
  ('notify-noreply@360monitoring.com', '360 Monitoring'),
  ('support@campaignbutler.vote', NULL),
  ('support@deskteam360.com', 'Internal support'),
  ('support@sociablekit.com', NULL),
  ('wordpress@primehealthplus.org', 'WordPress notifications')
ON CONFLICT (email) DO NOTHING;
