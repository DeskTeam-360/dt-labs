# Migrasi: todo_ → ticket_

Migration ini mengganti tabel `todo_*` menjadi `ticket_*` dan kolom `todo_id` menjadi `ticket_id`.

## Menjalankan migration

```bash
# Gunakan DATABASE_URL dari .env
psql $DATABASE_URL -f drizzle/migrations/0001_rename_todo_tables_to_ticket.sql
```

Atau dengan connection string eksplisit:
```bash
psql "postgresql://user:pass@host:5432/dbname" -f drizzle/migrations/0001_rename_todo_tables_to_ticket.sql
```

## Yang diubah

| Lama | Baru |
|------|------|
| todo_statuses | ticket_statuses |
| todo_assignees | ticket_assignees |
| todo_checklist | ticket_checklist |
| todo_comments | ticket_comments |
| todo_attributs | ticket_attributs |
| todo_time_tracker | ticket_time_tracker |
| screenshots.todo_id | screenshots.ticket_id |

**Penting:** Jalankan migration ini **sebelum** deploy kode yang sudah di-update. Kode (schema Drizzle + API) sudah memakai nama baru.
