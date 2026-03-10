-- Migration: Add short_note column to tickets table (nullable)
-- Run with: psql $DATABASE_URL -f drizzle/migrations/0002_add_short_note_to_tickets.sql

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS short_note TEXT;
