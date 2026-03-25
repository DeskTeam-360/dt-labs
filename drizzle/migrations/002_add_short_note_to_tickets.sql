-- =============================================================================
-- Migration 002 — Kolom catatan singkat pada tickets (nullable)
-- Migration 002 — Short note column on tickets (nullable)
-- Run: psql $DATABASE_URL -f drizzle/migrations/002_add_short_note_to_tickets.sql
-- =============================================================================

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS short_note TEXT;
