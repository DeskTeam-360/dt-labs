-- In-app ticket notifications (bell), moved from Firestore to Postgres.
CREATE TABLE IF NOT EXISTS ticket_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  ticket_id integer NOT NULL,
  ticket_title varchar(200) NOT NULL DEFAULT '',
  type varchar(32) NOT NULL,
  title varchar(200) NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  read boolean NOT NULL DEFAULT false,
  read_at timestamp with time zone,
  actor_user_id uuid,
  actor_name varchar(200) NOT NULL DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ticket_notifications_user_created_idx
  ON ticket_notifications (user_id, created_at DESC);
