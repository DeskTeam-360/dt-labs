# Google Apps Script - Spreadsheet Connector

Script untuk di-connect ke Google Spreadsheet agar bisa di-import ke Content Planner di Deskteam360, serta menerima log automation email ke sheet.

## Cara Install

1. Buka Google Spreadsheet (buat baru atau buka yang ada)
2. Klik **Extensions** → **Apps Script**
3. Hapus semua kode default di `Code.gs`
4. Copy-paste isi file `apps-script-spreadsheet.gs` ke editor
5. Simpan (Ctrl+S) dan beri nama project misalnya "Deskteam360 Connector"
6. Refresh spreadsheet — menu **Deskteam360** akan muncul di toolbar

## Menu & Fitur

| Menu | Fungsi |
|------|--------|
| **Setup Template Content Planner** | Buat header row: Topic, Topic Description, Channel, Topic Type, Hashtags, Insight |
| **Setup Template Automation Logs** | Buat sheet "Automation Logs" untuk menerima log event email/automation |
| **Dapatkan OpenSheet URL** | Generate URL untuk paste di Import from Sheet (Content Planner) |
| **Dapatkan Web App URL** | Copy URL webhook untuk log automation (set di .env) |
| **Validasi Sheet** | Cek struktur kolom |
| **Bantuan** | Panduan singkat |

## Automation Logs (log email & automation ke Spreadsheet)

1. Jalankan **Setup Template Automation Logs** untuk membuat sheet
2. **Deploy** → **New deployment** → pilih **Web app**
   - Execute as: Me
   - Who has access: Anyone
3. Jalankan **Dapatkan Web App URL** → copy URL
4. Di `.env` project Next.js tambahkan:
   ```
   AUTOMATION_LOG_WEBHOOK_URL=<paste Web App URL>
   AUTOMATION_LOG_SECRET=<opsional, untuk keamanan>
   ```
5. Event yang akan tercatat:
   - `email_ticket_created` — ticket baru dari email
   - `email_reply_added` — reply ditambah ke ticket
   - `automation_matched` — rule automation cocok
   - `automation_error` — error saat jalankan automation

## Import ke Content Planner

1. Di spreadsheet: Share sheet **"Anyone with the link can view"** (harus public agar OpenSheet bisa fetch)
2. Jalankan menu **Dapatkan OpenSheet URL** → copy URL
3. Di app: Company → Content Planner → **Import from Sheet**
4. Paste URL (OpenSheet atau Google Sheets link)
5. Pilih tab/sheet number (1 = sheet pertama)
6. Map kolom ke field Content Planner
7. Klik Import

## File

- `apps-script-spreadsheet.gs` — Source code Apps Script
