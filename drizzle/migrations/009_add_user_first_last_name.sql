-- Optional given / family name on users (message templates: {{ recipient.first_name }}, {{ recipient.last_name }})
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "first_name" varchar(255);
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_name" varchar(255);
