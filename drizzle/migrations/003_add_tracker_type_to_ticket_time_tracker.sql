-- =============================================================================
-- Migration 003 — tracker_type: timer (start/stop) | manual (durasi dicatat)
-- Migration 003 — tracker_type: timer | manual (logged duration)
-- Run: psql $DATABASE_URL -f drizzle/migrations/003_add_tracker_type_to_ticket_time_tracker.sql
-- =============================================================================

ALTER TABLE ticket_time_tracker
  ADD COLUMN IF NOT EXISTS tracker_type varchar(32) NOT NULL DEFAULT 'timer';
