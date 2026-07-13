# Cron Jobs — DeskTeam360

Semua cron job dijalankan di server Lightsail (`ubuntu@3.23.67.169`) menggunakan `crontab`.
Auth menggunakan `Authorization: Bearer <secret>` yang dibaca dari `.env`.

## Daftar Cron Jobs

| Endpoint | Jadwal | Fungsi |
|---|---|---|
| `POST /api/email/sync-inbox` | Setiap 2 menit | Sinkronisasi inbox email (Gmail/IMAP), buat ticket dari email masuk |
| `POST /api/cron/process-recurring-tickets` | Setiap 1 menit | Buat ticket otomatis dari aturan recurring yang sudah jatuh tempo |
| `POST /api/cron/company-daily-active` | Setiap hari 00:05 UTC | Snapshot harian jumlah tiket aktif per perusahaan |
| `POST /api/cron/customer-weekly-recap` | Setiap Minggu 01:00 UTC | Materialize data rekap mingguan per tim (proses berat, jadwal off-peak) |

## Secret / Auth

Semua endpoint cron menggunakan satu secret yang sama:

```
env var: SYNC_INBOX_CRON_SECRET  (juga dipakai oleh COMPANY_DAILY_ACTIVE_CRON_SECRET)
header:  Authorization: Bearer <value>
```

Secret disimpan di `/var/www/dt-labs/.env` di server.

## Crontab di Server

Untuk melihat/edit cron yang aktif:

```bash
ssh -i "~/LightsailDefaultKey-us-east-2.pem" ubuntu@3.23.67.169
crontab -l        # lihat
crontab -e        # edit
```

Isi crontab saat ini:

```cron
# Email inbox sync — every 2 minutes
*/2 * * * * curl -s -X POST https://ticket.deskteam360.com/api/email/sync-inbox \
  -H "Authorization: Bearer <SYNC_INBOX_CRON_SECRET>" > /var/log/dt-labs-sync-inbox.log 2>&1

# Process recurring tickets — every minute
* * * * * curl -s -X POST https://ticket.deskteam360.com/api/cron/process-recurring-tickets \
  -H "Authorization: Bearer <SYNC_INBOX_CRON_SECRET>" > /var/log/dt-labs-recurring.log 2>&1

# Company daily active snapshot — every day at 00:05 UTC
5 0 * * * curl -s -X POST https://ticket.deskteam360.com/api/cron/company-daily-active \
  -H "Authorization: Bearer <SYNC_INBOX_CRON_SECRET>" > /var/log/dt-labs-company-daily.log 2>&1

# Customer weekly recap — every Sunday at 01:00 UTC
0 1 * * 0 curl -s -X POST https://ticket.deskteam360.com/api/cron/customer-weekly-recap \
  -H "Authorization: Bearer <SYNC_INBOX_CRON_SECRET>" > /var/log/dt-labs-weekly-recap.log 2>&1
```

## Log Files

Output tiap cron disimpan di server:

```
/var/log/dt-labs-sync-inbox.log       — hasil sync email terakhir
/var/log/dt-labs-recurring.log        — hasil proses recurring ticket terakhir
/var/log/dt-labs-company-daily.log    — hasil snapshot harian terakhir
/var/log/dt-labs-weekly-recap.log     — hasil rekap mingguan terakhir
```

Cek log terakhir:

```bash
tail -f /var/log/dt-labs-recurring.log
tail -f /var/log/dt-labs-sync-inbox.log
```

## Menambah Cron Baru

1. Buat endpoint di `app/api/cron/<nama>/route.ts`
2. Tambahkan auth check menggunakan `SYNC_INBOX_CRON_SECRET` (atau buat secret baru di `.env`)
3. Pasang di server via `crontab -e`
4. Update tabel di dokumen ini
