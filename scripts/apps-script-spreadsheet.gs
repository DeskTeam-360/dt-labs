/**
 * Google Apps Script - Deskteam360 Spreadsheet Connector
 *
 * Fitur:
 * - Log automation email: terima log dari app, tulis ke sheet
 * - Setup template Content Planner & Automation Logs
 * - Dapatkan OpenSheet URL
 *
 * Cara deploy Web App (untuk log):
 * 1. Deploy > New deployment > Web app
 * 2. Execute as: Me | Who has access: Anyone
 * 3. Copy Web App URL
 * 4. Set AUTOMATION_LOG_WEBHOOK_URL di .env
 */

const LOG_SHEET_NAME = 'Automation Logs';
const LOG_SECRET = ''; // optional: set di Script Properties (AUTOMATION_LOG_SECRET) untuk validasi

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('Deskteam360')
    .addItem('📋 Setup Template Content Planner', 'setupContentPlannerTemplate')
    .addItem('📧 Setup Template Automation Logs', 'setupAutomationLogsTemplate')
    .addItem('🔗 Dapatkan OpenSheet URL', 'getOpenSheetUrl')
    .addItem('🌐 Dapatkan Web App URL (untuk Log)', 'getWebAppUrl')
    .addItem('✅ Validasi Sheet', 'validateSheet')
    .addSeparator()
    .addItem('📖 Bantuan', 'showHelp')
    .addToUi();
}

/**
 * Terima POST dari app - append log ke sheet "Automation Logs"
 * Body JSON: { timestamp, event, ticket_id, email, subject, message, ... }
 */
function doPost(e) {
  try {
    const params = JSON.parse(e.postData?.contents || '{}');
    const secret = PropertiesService.getScriptProperties().getProperty('AUTOMATION_LOG_SECRET') || LOG_SECRET;
    if (secret && params.secret !== secret) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Invalid secret' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    appendLog(params);
    return ContentService.createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function appendLog(data) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(LOG_SHEET_NAME);
  if (!sheet) {
    setupAutomationLogsSheet(ss);
    sheet = ss.getSheetByName(LOG_SHEET_NAME);
  }
  const row = [
    data.timestamp || new Date().toISOString(),
    data.event || '',
    data.ticket_id || '',
    data.email || '',
    data.subject || '',
    data.message || '',
    data.detail || ''
  ];
  sheet.appendRow(row);
}

function setupAutomationLogsSheet(ss) {
  const sheet = ss.insertSheet(LOG_SHEET_NAME);
  const headers = ['Timestamp', 'Event', 'Ticket ID', 'Email', 'Subject', 'Message', 'Detail'];
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.getRange(1, 1, 1, headers.length).setBackground('#2b1252');
  sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');
  sheet.autoResizeColumns(1, headers.length);
}

/**
 * Setup sheet "Automation Logs" untuk menerima log dari app
 */
function setupAutomationLogsTemplate() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(LOG_SHEET_NAME);
  if (sheet) {
    SpreadsheetApp.getUi().alert('Sheet "Automation Logs" sudah ada.');
    return;
  }
  setupAutomationLogsSheet(ss);
  SpreadsheetApp.getUi().alert('Sheet "Automation Logs" berhasil dibuat.\n\nLanjutkan: Deploy > New deployment > Web app, lalu set AUTOMATION_LOG_WEBHOOK_URL di .env');
}

/**
 * Tampilkan Web App URL (setelah di-deploy)
 */
function getWebAppUrl() {
  let url = '';
  try {
    url = ScriptApp.getService().getUrl();
  } catch (e) {
    SpreadsheetApp.getUi().alert('Belum di-deploy. Klik Deploy > New deployment > Web app.');
    return;
  }
  if (!url) {
    SpreadsheetApp.getUi().alert('Belum di-deploy. Klik Deploy > New deployment > Web app.');
    return;
  }
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family: monospace; padding: 16px;">' +
    '<p><strong>Web App URL (untuk AUTOMATION_LOG_WEBHOOK_URL):</strong></p>' +
    '<input type="text" id="url" value="' + url + '" style="width:100%; padding:8px;" readonly>' +
    '<p style="margin-top:12px;"><button onclick="copyUrl()">Copy URL</button></p>' +
    '</div>' +
    '<script>function copyUrl(){var i=document.getElementById("url");i.select();document.execCommand("copy");google.script.host.close();}</script>'
  ).setWidth(520).setHeight(120);
  SpreadsheetApp.getUi().showModalDialog(html, 'Web App URL');
}

/**
 * Setup header row untuk Content Planner import.
 * Kolom: Topic, Topic Description, Channel, Topic Type, Hashtags, Insight
 */
function setupContentPlannerTemplate() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const headers = ['Topic', 'Topic Description', 'Channel', 'Topic Type', 'Hashtags', 'Insight'];
  
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
  sheet.getRange(1, 1, 1, headers.length).setBackground('#667eea');
  sheet.getRange(1, 1, 1, headers.length).setFontColor('#ffffff');
  sheet.autoResizeColumns(1, headers.length);
  
  SpreadsheetApp.getUi().alert('Template Content Planner berhasil dibuat.\n\nKolom: ' + headers.join(', '));
}

/**
 * Generate OpenSheet URL untuk spreadsheet ini.
 * Pastikan sheet di-share "Anyone with the link can view" agar OpenSheet bisa akses.
 */
function getOpenSheetUrl() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getActiveSheet();
  const spreadsheetId = ss.getId();
  const sheetId = sheet.getSheetId();
  
  // OpenSheet format: https://opensheet.elk.sh/{spreadsheetId}/{sheetNumber}
  // Sheet number = 1-based index (gid 0 = sheet 1)
  const sheets = ss.getSheets();
  let sheetNumber = 1;
  for (let i = 0; i < sheets.length; i++) {
    if (sheets[i].getSheetId() === sheetId) {
      sheetNumber = i + 1;
      break;
    }
  }
  
  const openSheetUrl = 'https://opensheet.elk.sh/' + spreadsheetId + '/' + sheetNumber;
  const googleUrl = 'https://docs.google.com/spreadsheets/d/' + spreadsheetId + '/edit#gid=' + sheetId;
  
  const msg = 'OpenSheet URL (untuk Import from Sheet di Deskteam360):\n\n' + openSheetUrl + 
    '\n\nGoogle Sheets URL:\n' + googleUrl +
    '\n\n⚠️ Pastikan sheet di-share "Anyone with the link can view" agar OpenSheet bisa fetch data.';
  
  // Copy URL ke clipboard via dialog (user bisa Ctrl+C)
  const html = HtmlService.createHtmlOutput(
    '<div style="font-family: monospace; padding: 16px;">' +
    '<p><strong>OpenSheet URL:</strong></p>' +
    '<input type="text" id="url" value="' + openSheetUrl + '" style="width:100%; padding:8px;" readonly>' +
    '<p style="margin-top:12px;"><button onclick="copyUrl()">Copy URL</button></p>' +
    '</div>' +
    '<script>function copyUrl(){var i=document.getElementById("url");i.select();document.execCommand("copy");google.script.host.close();}</script>'
  )
    .setWidth(500)
    .setHeight(120);
  SpreadsheetApp.getUi().showModalDialog(html, 'Deskteam360 - OpenSheet URL');
}

/**
 * Validasi struktur sheet untuk Content Planner.
 */
function validateSheet() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
  const data = sheet.getDataRange().getValues();
  
  if (!data || data.length === 0) {
    SpreadsheetApp.getUi().alert('Sheet kosong. Gunakan "Setup Template Content Planner" terlebih dahulu.');
    return;
  }
  
  const headers = data[0].map(function(h) { return String(h || '').trim(); });
  const recommended = ['Topic', 'Topic Description', 'Channel', 'Topic Type', 'Hashtags', 'Insight'];
  
  let missing = [];
  for (let i = 0; i < recommended.length; i++) {
    if (headers.indexOf(recommended[i]) === -1) {
      missing.push(recommended[i]);
    }
  }
  
  const rowCount = data.length - 1;
  let msg = 'Validasi Sheet\n\n';
  msg += 'Jumlah baris data: ' + rowCount + '\n';
  msg += 'Kolom yang ada: ' + headers.filter(function(h) { return h; }).join(', ') + '\n\n';
  
  if (missing.length === 0) {
    msg += '✅ Semua kolom recommended ada. Siap untuk import ke Content Planner.';
  } else {
    msg += '⚠️ Kolom yang disarankan tapi belum ada: ' + missing.join(', ') + '\n\n';
    msg += 'Anda tetap bisa import - cukup map kolom yang ada saat import di app.';
  }
  
  SpreadsheetApp.getUi().alert(msg);
}

function showHelp() {
  const msg = 'Deskteam360 Spreadsheet Connector\n\n' +
    'LOG AUTOMATION EMAIL:\n' +
    '1. Setup Template Automation Logs - buat sheet untuk log\n' +
    '2. Deploy > New deployment > Web app (Anyone)\n' +
    '3. Dapatkan Web App URL - copy ke .env AUTOMATION_LOG_WEBHOOK_URL\n' +
    '4. (Opsional) Script Properties: AUTOMATION_LOG_SECRET untuk keamanan\n\n' +
    'CONTENT PLANNER:\n' +
    '- Setup Template Content Planner\n' +
    '- Dapatkan OpenSheet URL untuk Import from Sheet\n' +
    '- Share sheet "Anyone with the link can view"';
  SpreadsheetApp.getUi().alert(msg);
}
