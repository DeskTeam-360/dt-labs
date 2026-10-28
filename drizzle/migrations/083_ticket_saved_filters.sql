-- "My Filters" on the tickets page, saved per person so they follow them to every device. One of them can be the default view.
-- Safe to run as postgres or as dtlabs: the new table is handed to dtlabs at the end.

CREATE TABLE IF NOT EXISTS ticket_saved_filters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name varchar(100) NOT NULL,
  query text NOT NULL DEFAULT '',
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ticket_saved_filters_user_idx ON ticket_saved_filters (user_id, created_at);
-- At most one default view per person.
CREATE UNIQUE INDEX IF NOT EXISTS ticket_saved_filters_one_default_idx ON ticket_saved_filters (user_id) WHERE is_default;

-- The app connects as dtlabs, so it must own the table it writes to.
ALTER TABLE ticket_saved_filters OWNER TO dtlabs;
