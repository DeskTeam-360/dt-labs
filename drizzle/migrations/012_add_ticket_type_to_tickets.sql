-- Classification: support (default) | spam | trash — separate from ticket_types.type_id
ALTER TABLE tickets
  ADD COLUMN IF NOT EXISTS ticket_type varchar(32) NOT NULL DEFAULT 'support';

COMMENT ON COLUMN tickets.ticket_type IS 'support | spam | trash; not the same as type_id (ticket_types)';
