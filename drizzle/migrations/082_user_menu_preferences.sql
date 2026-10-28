-- Each staff member's own sidebar menu: the order of the items and which ones are hidden.
-- Only differences from the default are stored; admin-locked items are kept in app_settings (sidebar_locked_items).
-- Safe to run as postgres or as dtlabs: the new table is handed to dtlabs at the end.

CREATE TABLE IF NOT EXISTS user_menu_preferences (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  item_order jsonb NOT NULL DEFAULT '[]'::jsonb,
  hidden_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- The app connects as dtlabs, so it must own the table it writes to.
ALTER TABLE user_menu_preferences OWNER TO dtlabs;
