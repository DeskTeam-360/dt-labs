# Supabase migrations (riwayat / referensi)

File `.sql` di folder ini adalah migrasi yang dipakai alur **Supabase CLI** (timestamp di nama file, urutan historis).

**Tidak digabung** ke rantai nomor `drizzle/migrations/001_…` karena banyak skrip khusus Supabase (RLS, realtime, auth). Untuk migrasi schema aplikasi yang disusun manual dan berurutan `001`, `002`, `003`, lihat:

`drizzle/migrations/README.md`

---

# Supabase migrations (history / reference)

These files follow Supabase’s timestamp naming and historical order. They are **not** renumbered into the app’s `drizzle/migrations/` chain. Use `drizzle/migrations/` for the ordered app-schema SQL the README there describes.
