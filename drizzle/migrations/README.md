# Migrasi SQL aplikasi (urut & terpusat)

Semua skrip migrasi **manual** untuk schema yang dipakai aplikasi Next.js + Drizzle ada di folder ini. Nama file memakai **tiga digit urut** (`001_`, `002_`, …) supaya mudah dibaca dan dijalankan berurutan.

| No | File | Ringkasan |
|----|------|-----------|
| 001 | `001_rename_todo_tables_to_ticket.sql` | Rename tabel/kolom `todo_*` → `ticket_*` + FK + fungsi helper |
| 002 | `002_add_short_note_to_tickets.sql` | Kolom `tickets.short_note` (TEXT, nullable) |
| 003 | `003_add_tracker_type_to_ticket_time_tracker.sql` | Kolom `tracker_type` (`timer` / `manual`) |
| 025 | `025_slack_ticket_notification_rules.sql` | Tabel aturan notifikasi Slack webhook |

**Catatan:** Project ini tidak memakai RLS. Jalankan migration SQL langsung ke PostgreSQL dari folder ini.

## Menjalankan (PostgreSQL)

Ganti `DATABASE_URL` dengan connection string Anda.

```bash
psql "$DATABASE_URL" -f drizzle/migrations/001_rename_todo_tables_to_ticket.sql
psql "$DATABASE_URL" -f drizzle/migrations/002_add_short_note_to_tickets.sql
psql "$DATABASE_URL" -f drizzle/migrations/003_add_tracker_type_to_ticket_time_tracker.sql
```

Windows (PowerShell), contoh:

```powershell
psql $env:DATABASE_URL -f drizzle/migrations/001_rename_todo_tables_to_ticket.sql
```

Migrasi **001** hanya perlu sekali pada database yang masih memakai nama `todo_*`. Jika schema sudah `ticket_*`, lewati 001.

# Application SQL migrations (ordered, single place)

Manual migration scripts for the app database live here. Filenames use a **three-digit prefix** (`001_`, `002_`, …) for a clear execution order.

See the table above for the index. **001** is for legacy DBs still on `todo_*` naming; skip if you already use `ticket_*`.
