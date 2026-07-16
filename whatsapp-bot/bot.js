const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const mysql = require('mysql2/promise');
const cron = require('node-cron');
const express = require('express');
const fs = require('fs');
const path = require('path');

// 1. Load environment variables from .env.local at the project root
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

// Build config object from environment variables
let config = {
  db: {
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'fin_pro',
    ssl: (process.env.DB_SSL === 'true' || process.env.DB_HOST?.includes('tidbcloud.com')) ? {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true
    } : undefined
  },
  whatsapp: {
    group_jid: process.env.WA_GROUP_JID || '',
    send_time: process.env.WA_SEND_TIME || '07:35',
    reconciliation_enabled: process.env.WA_RECONCILIATION_ENABLED !== 'false'
  },
  ipos: {
    api_url: process.env.IPOS_API_URL || 'http://127.0.0.1:8080/API-IPOS5/reconcile.php',
    api_key: process.env.IPOS_API_KEY || ''
  }
};

// Reload config from env (re-reads .env.local to pick up manual edits)
function reloadConfig() {
  try {
    require('dotenv').config({ path: path.join(__dirname, '..', '.env.local'), override: true });
    config.db.host = process.env.DB_HOST || config.db.host;
    config.db.port = parseInt(process.env.DB_PORT || config.db.port);
    config.db.user = process.env.DB_USER || config.db.user;
    config.db.password = process.env.DB_PASSWORD || config.db.password;
    config.db.database = process.env.DB_NAME || config.db.database;
    config.db.ssl = (process.env.DB_SSL === 'true' || process.env.DB_HOST?.includes('tidbcloud.com')) ? {
      minVersion: 'TLSv1.2',
      rejectUnauthorized: true
    } : undefined;
    config.whatsapp.group_jid = process.env.WA_GROUP_JID || config.whatsapp.group_jid;
    config.whatsapp.send_time = process.env.WA_SEND_TIME || config.whatsapp.send_time;
    config.whatsapp.reconciliation_enabled = process.env.WA_RECONCILIATION_ENABLED !== 'false';
    config.ipos.api_url = process.env.IPOS_API_URL || config.ipos.api_url;
    config.ipos.api_key = process.env.IPOS_API_KEY || config.ipos.api_key;
  } catch (err) {
    console.error('Gagal memuat ulang konfigurasi dari .env.local:', err.message);
  }
}

// Helper to sync fingerprint data directly from device via TCP (replaces PowerShell GUI hack)
const { syncFromDevice, checkDeviceStatus } = require('./fingerprint-sync');
// Helper to migrate local database to TiDB Cloud
const { migrate: uploadToTiDB } = require('./migrate-to-tidb');

let isSyncing = false;
let lastSyncResult = null;

async function triggerFingerprintSync() {
  if (isSyncing) {
    console.log('⚠️ Sinkronisasi sedang berjalan, menunggu selesai...');
    return lastSyncResult;
  }

  isSyncing = true;
  try {
    console.log('🔄 Memulai sinkronisasi data mesin fingerprint via TCP...');
    lastSyncResult = await syncFromDevice();
    console.log(`✅ Sinkronisasi lokal selesai: ${lastSyncResult.message}`);
    
    // Only upload to TiDB Cloud if local sync was successful
    if (lastSyncResult.status === 'success') {
      console.log('🚀 Memulai upload data baru ke TiDB Cloud...');
      await uploadToTiDB();
      console.log('✅ Upload data ke TiDB Cloud selesai.');
    }
    return lastSyncResult;
  } catch (err) {
    console.error(`❌ GAGAL Sinkronisasi Fingerprint: ${err.message}`);
    lastSyncResult = { status: 'error', message: err.message };
    return lastSyncResult;
  } finally {
    isSyncing = false;
  }
}

// 2. Initialize WhatsApp Web Client
const client = new Client({
  authStrategy: new LocalAuth(),
  puppeteer: {
    headless: true,
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    protocolTimeout: 300000
  }
});

let isReady = false;
let latestQr = null;

// QR code event
client.on('qr', (qr) => {
  latestQr = qr;
  console.log('\n=============================================================');
  console.log('=== SCAN QR CODE DENGAN BROWSER ANDA ===');
  console.log('=============================================================');

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(qr)}`;
  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Scan WhatsApp QR Code</title>
      <meta http-equiv="refresh" content="15">
      <style>
        body { font-family: sans-serif; text-align: center; margin-top: 50px; background: #F8FAFC; color: #1E293B; }
        .card { background: white; padding: 30px; border-radius: 20px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); display: inline-block; }
        img { border: 1px solid #E2E8F0; border-radius: 10px; margin: 20px 0; }
        h2 { margin: 0 0 10px 0; color: #059669; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>Tautkan Perangkat WhatsApp</h2>
        <p>Buka WhatsApp di HP Anda > Perangkat Tertaut > Tautkan Perangkat</p>
        <img src="${qrUrl}" alt="QR Code" width="300" height="300" />
        <p style="color: #64748B; font-size: 12px; margin-top: 10px;">File ini otomatis memuat ulang setiap 15 detik.</p>
      </div>
    </body>
    </html>
  `;
  const qrHtmlPath = path.join(__dirname, 'qr.html');
  fs.writeFileSync(qrHtmlPath, htmlContent);

  console.log(`👉 Buka file ini di browser Anda untuk men-scan QR code:`);
  console.log(`file:///${qrHtmlPath.replace(/\\/g, '/')}`);
  console.log('=============================================================\n');
});

// Ready event
client.on('ready', async () => {
  isReady = true;
  latestQr = null;
  console.log('✅ WhatsApp Bot berhasil terhubung dan siap!');

  // Delete qr.html on connection success
  const qrHtmlPath = path.join(__dirname, 'qr.html');
  if (fs.existsSync(qrHtmlPath)) {
    try {
      fs.unlinkSync(qrHtmlPath);
    } catch (e) { }
  }

  // Jadwalkan sinkronisasi mesin fingerprint harian setiap pukul 07:30 WIB
  cron.schedule('30 7 * * *', () => {
    console.log('⏰ Menjalankan sinkronisasi mesin fingerprint harian (07:30)...');
    triggerFingerprintSync();
  }, {
    timezone: 'Asia/Jakarta'
  });

  // Retrieve and print all groups
  try {
    const chats = await client.getChats();
    const groups = chats.filter(chat => chat.isGroup);

    console.log('\n=============================================================');
    console.log('=== DAFTAR GRUP WHATSAPP ANDA ===');
    console.log('Silakan cari nama grup target Anda, lalu salin JID-nya');
    console.log('dan tempelkan ke kolom "group_jid" di file whatsapp-bot/config.json');
    console.log('=============================================================');

    if (groups.length === 0) {
      console.log('Nomor WhatsApp ini tidak berada di grup mana pun.');
    } else {
      groups.forEach(g => {
        console.log(`- Nama: "${g.name}" | JID: ${g.id._serialized}`);
      });
    }
    console.log('=============================================================\n');
  } catch (err) {
    console.error('Gagal memuat daftar grup WhatsApp:', err.message);
  }
});

// Disconnected event
client.on('disconnected', (reason) => {
  isReady = false;
  latestQr = null;
  console.log('❌ WhatsApp Bot terputus:', reason);
});

// Message listener (triggers on both incoming and outgoing messages)
client.on('message_create', async (msg) => {
  console.log(`✉️ Pesan dideteksi: "${msg.body}" | dari: ${msg.from} | ke: ${msg.to} | fromMe: ${msg.fromMe}`);

  // 1. Detect Cashier Shift Report
  if (msg.body.includes('LAPORAN SHIFT')) {
    reloadConfig();
    if (config.whatsapp.reconciliation_enabled === false) {
      console.log('ℹ️ Rekonsiliasi otomatis dinonaktifkan di config.json. Mengabaikan.');
      return;
    }
    const targetGroupJid = config.whatsapp.group_jid;
    
    // Restrict to configured group JID or allow private chats for testing
    const isFromTargetGroup = targetGroupJid && msg.from === targetGroupJid;
    const isPrivateChat = !msg.from.endsWith('@g.us');
    
    if (!isFromTargetGroup && !isPrivateChat) {
      // Ignore messages from other groups
      return;
    }

    console.log(`📝 Laporan Kasir dideteksi dari ${msg.from}`);

    try {
      const text = msg.body;
      
      // Parse Shop (first line of the message, stripping formatting like *, _, ~)
      const shop = text.split('\n')[0].replace(/[\r\*_~]/g, '').trim();

      // Parse Date (Tgl : 30 Juni 2026)
      const dateMatch = text.match(/Tgl\s*:\s*([^\n]+)/i);
      const rawDate = dateMatch ? dateMatch[1].trim() : '';

      // Parse Shift (Shift : Siang)
      const shiftMatch = text.match(/Shift\s*:\s*([^\n]+)/i);
      const shift = shiftMatch ? shiftMatch[1].trim() : '';

      // Parse Struk (Struk : 156)
      const strukMatch = text.match(/Struk\s*:\s*(\d+)/i);
      const reportedStruk = strukMatch ? parseInt(strukMatch[1]) : 0;

      // Helper to clean numeric string (6.289.000 or - or empty)
      const parseNumber = (line) => {
        if (!line || line.includes('-') || line.trim() === '') return 0;
        const cleaned = line.replace(/[^\d]/g, '');
        return cleaned ? parseFloat(cleaned) : 0;
      };

      // Parse Sales Tunai
      const tunaiMatch = text.match(/Sales Tunai\s*:\s*([^\n]+)/i);
      const reportedTunai = tunaiMatch ? parseNumber(tunaiMatch[1]) : 0;

      // Parse Sales Debit
      const debitMatch = text.match(/Sales Debit\s*:\s*([^\n]+)/i);
      const reportedDebit = debitMatch ? parseNumber(debitMatch[1]) : 0;

      // Parse Sales QRIS
      const qrisMatch = text.match(/Sales QRIS\s*:\s*([^\n]+)/i);
      const reportedQris = qrisMatch ? parseNumber(qrisMatch[1]) : 0;

      // Parse Total
      const totalMatch = text.match(/Total\s*:\s*([^\n]+)/i);
      const reportedTotal = totalMatch ? parseNumber(totalMatch[1]) : 0;

      // Parse Jumlah Struk (Daily Struk)
      const dailyStrukMatch = text.match(/Jumlah struk\s*:\s*(\d+)/i);
      const reportedDailyStruk = dailyStrukMatch ? parseInt(dailyStrukMatch[1]) : 0;

      // Parse Jumlah Sales (Daily Sales)
      const dailySalesMatch = text.match(/Jumlah sales\s*:\s*([^\n]+)/i);
      const reportedDailySales = dailySalesMatch ? parseNumber(dailySalesMatch[1]) : 0;

      // Parse Cashier Team (Team yang Masuk : Rika, Shoffa)
      const cashiersMatch = text.match(/Team yang Masuk\s*:\s*([^\n\r]+)/i);
      const cashiers = cashiersMatch ? cashiersMatch[1].split(',').map(s => s.trim()) : [];

      // Convert Date: "30 Juni 2026" to YYYY-MM-DD
      const months = {
        'januari': '01', 'februari': '02', 'maret': '03', 'april': '04',
        'mei': '05', 'juni': '06', 'juli': '07', 'agustus': '08',
        'september': '09', 'oktober': '10', 'november': '11', 'desember': '12',
        'jan': '01', 'feb': '02', 'mar': '03', 'apr': '04', 'jun': '06',
        'jul': '07', 'agu': '08', 'sep': '09', 'okt': '10', 'nov': '11', 'des': '12'
      };

      let formattedDate = '';
      if (rawDate) {
        // Clean up rawDate from spaces (e.g. "30juni 2026")
        // Match numbers and month text
        const cleanedDate = rawDate.replace(/\s+/g, ' '); // normalize spaces
        const datePartsMatch = cleanedDate.match(/(\d+)\s*([a-zA-Z]+)\s*(\d+)/);
        if (datePartsMatch) {
          const day = datePartsMatch[1].padStart(2, '0');
          const monthStr = datePartsMatch[2].toLowerCase();
          const year = datePartsMatch[3];
          
          let month = months[monthStr] || '01';
          formattedDate = `${year}-${month}-${day}`;
        } else {
          // Fallback to standard split
          const parts = rawDate.split(/[\s\-\/]+/);
          if (parts.length === 3) {
            const day = parts[0].padStart(2, '0');
            const monthStr = parts[1].toLowerCase();
            const year = parts[2];
            
            let month = months[monthStr] || parts[1].padStart(2, '0');
            formattedDate = `${year}-${month}-${day}`;
          }
        }
      }

      if (!formattedDate || !shift) {
        console.warn('⚠️ Gagal memparsing tanggal atau shift dari laporan.');
        return;
      }

      console.log(`Parsed Data - Shop: ${shop}, Date: ${formattedDate}, Shift: ${shift}, Struk: ${reportedStruk}, Tunai: ${reportedTunai}, QRIS: ${reportedQris}, Cashiers: ${JSON.stringify(cashiers)}`);

      // Call API-IPOS5 reconcile.php endpoint using native fetch
      const apiUrl = config.ipos.api_url;
      const apiResponse = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'X-API-KEY': config.ipos.api_key,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          shop: shop,
          date: formattedDate,
          shift: shift,
          cashiers: cashiers
        })
      });

      const resText = await apiResponse.text();
      let resData;
      try {
        resData = JSON.parse(resText);
      } catch (e) {
        console.error('Failed to parse JSON. Raw response was:', resText);
        throw new Error('Unexpected response format from API: ' + e.message);
      }

      if (apiResponse.ok && resData.status === 'success') {
        const actual = resData.actual;
        
        // Helper to format values
        const formatRupiah = (num) => 'Rp ' + Math.round(num).toLocaleString('id-ID');
        
        const compareVal = (reported, actualVal) => {
          if (reported === actualVal) {
            return `✅ *${formatRupiah(reported)}* (Cocok)`;
          } else {
            const diff = actualVal - reported;
            const diffSign = diff > 0 ? '+' : '';
            return `❌ Laporan *${formatRupiah(reported)}* | DB *${formatRupiah(actualVal)}* (Selisih: ${diffSign}${formatRupiah(diff)})`;
          }
        };

        const compareCount = (reported, actualVal) => {
          if (reported === actualVal) {
            return `✅ *${reported}* (Cocok)`;
          } else {
            const diff = actualVal - reported;
            const diffSign = diff > 0 ? '+' : '';
            return `❌ Laporan *${reported}* | DB *${actualVal}* (Selisih: ${diffSign}${diff})`;
          }
        };

        // QRIS and Debit matching logic
        // Cashiers often write QRIS, which might be in jmlemoney (actual.shift_qris) or jmldebit (actual.shift_debit).
        let qrisStatus = '';
        if (reportedQris === actual.shift_qris) {
          qrisStatus = `✅ *${formatRupiah(reportedQris)}* (Cocok)`;
        } else if (reportedQris === actual.shift_debit) {
          qrisStatus = `⚠️ Laporan *${formatRupiah(reportedQris)}* | DB *${formatRupiah(actual.shift_qris)}* (Nominal QRIS cocok dengan kolom *Debit* di DB: *${formatRupiah(actual.shift_debit)}*)`;
        } else {
          const diff = actual.shift_qris - reportedQris;
          const diffSign = diff > 0 ? '+' : '';
          qrisStatus = `❌ Laporan *${formatRupiah(reportedQris)}* | DB *${formatRupiah(actual.shift_qris)}* (Selisih: ${diffSign}${formatRupiah(diff)})`;
        }

        let debitStatus = '';
        if (reportedDebit === actual.shift_debit) {
          debitStatus = `✅ *${formatRupiah(reportedDebit)}* (Cocok)`;
        } else if (reportedQris === actual.shift_debit && reportedDebit === 0) {
          debitStatus = `ℹ️ *Rp 0* (Nominal DB *${formatRupiah(actual.shift_debit)}* telah dicocokkan ke QRIS)`;
        } else {
          const diff = actual.shift_debit - reportedDebit;
          const diffSign = diff > 0 ? '+' : '';
          debitStatus = `❌ Laporan *${formatRupiah(reportedDebit)}* | DB *${formatRupiah(actual.shift_debit)}* (Selisih: ${diffSign}${formatRupiah(diff)})`;
        }

        // Format Reply Message
        let replyMsg = `🔍 *VERIFIKASI LAPORAN KASIR iPOS 5*\n`;
        replyMsg += `🏪 Cabang: *${shop}*\n`;
        replyMsg += `🗄️ Database: \`${resData.database}\`\n`;
        replyMsg += `📅 Tanggal: *${rawDate}* (${formattedDate})\n`;
        replyMsg += `⏰ Shift: *${shift}*\n\n`;

        replyMsg += `📊 *[PERBANDINGAN SHIFT]*\n`;
        replyMsg += `• Jumlah Struk: ${compareCount(reportedStruk, actual.shift_struk)}\n`;
        replyMsg += `• Sales Tunai: ${compareVal(reportedTunai, actual.shift_tunai)}\n`;
        replyMsg += `• Sales Debit: ${debitStatus}\n`;
        replyMsg += `• Sales QRIS: ${qrisStatus}\n`;
        replyMsg += `• Total Sales Shift: ${compareVal(reportedTotal, actual.shift_total)}\n\n`;

        replyMsg += `📅 *[PERBANDINGAN HARIAN]*\n`;
        replyMsg += `• Jumlah Struk: ${compareCount(reportedDailyStruk, actual.daily_struk)}\n`;
        replyMsg += `• Jumlah Sales Harian: ${compareVal(reportedDailySales, actual.daily_sales)}\n\n`;

        if (reportedTotal === actual.shift_total && reportedDailySales === actual.daily_sales && reportedStruk === actual.shift_struk) {
          replyMsg += `✨ *Laporan KLOP dan Sesuai dengan Database iPOS 5!* 🎉`;
        } else {
          replyMsg += `⚠️ *Perhatian:* Terdapat perbedaan antara laporan kasir dengan database iPOS 5. Silakan periksa kembali transaksi yang di-input.`;
        }

        await msg.reply(replyMsg);
        console.log(`✅ Berhasil membalas verifikasi laporan kasir ke ${msg.from}`);
      } else {
        await msg.reply(`❌ *Gagal melakukan verifikasi laporan:*\n${resData.message || 'Error tidak diketahui'}`);
      }

    } catch (err) {
      console.error('Error saat rekonsiliasi laporan kasir:', err.message);
      await msg.reply(`❌ *Gagal menghubungkan ke database/API:*\n${err.message}`);
    }
  }

  if (msg.body === '!absen') {
    console.log(`💬 Perintah !absen dideteksi dari ${msg.from}`);

    // Sinkronisasi data mesin absensi secara langsung via TCP (tanpa delay!)
    await triggerFingerprintSync();

    let connection;
    try {
      reloadConfig();
      // Connect to MySQL
      connection = await mysql.createConnection({
        host: config.db.host,
        port: config.db.port,
        user: config.db.user,
        password: config.db.password,
        database: config.db.database,
        ssl: config.db.ssl
      });

      // Fetch absent employees
      const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
      const todayFormatted = new Date().toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });

      // Exclude PIN 050 on Sundays
      const localDay = new Date().toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Jakarta' });
      let query = `
        SELECT p.pegawai_pin as pin, p.pegawai_nama as name, COALESCE(d.pembagian1_nama, 'General') as department
        FROM pegawai p
        LEFT JOIN pembagian1 d ON p.pembagian1_id = d.pembagian1_id
        WHERE p.pegawai_status = 1
          AND p.pegawai_pin NOT IN (
            SELECT DISTINCT pin 
            FROM att_log 
            WHERE DATE(scan_date) = ?
          )
      `;
      if (localDay === 'Sun') {
        query += ` AND p.pegawai_pin NOT IN ('050', '50')`;
      }
      query += ` ORDER BY CAST(p.pegawai_pin AS UNSIGNED) ASC`;

      const [rows] = await connection.execute(query, [todayStr]);

      // Format message
      let replyMsg = `📢 *LAPORAN KARYAWAN TIDAK HADIR*\n`;
      replyMsg += `📅 Hari/Tanggal: *${todayFormatted}*\n\n`;

      if (rows.length === 0) {
        replyMsg += `Alhamdulillah, semua karyawan telah melakukan scan absensi hari ini! 🎉`;
      } else {
        replyMsg += `Berikut daftar karyawan yang *belum melakukan scan absensi* hari ini:\n\n`;
        rows.forEach((row, index) => {
          replyMsg += `${index + 1}. *[PIN ${row.pin}]* ${row.name} (${row.department})\n`;
        });
        replyMsg += `\nTotal Tidak Hadir: *${rows.length} orang*.`;
      }

      // Reply to the message
      await msg.reply(replyMsg);
      console.log(`✅ Membalas perintah !absen ke ${msg.from}`);
    } catch (err) {
      console.error('Gagal memproses perintah !absen:', err.message);
    } finally {
      if (connection) {
        await connection.end();
      }
    }
  }
});

// 3. Function to query and send absent report
async function sendAbsentReport() {
  reloadConfig();
  const groupJid = config.whatsapp.group_jid;
  if (!groupJid) {
    console.warn('⚠️ Gagal mengirim laporan: group_jid di config.json masih kosong.');
    return { status: 'error', message: 'Group JID belum diisi di config.json.' };
  }

  let connection;
  try {
    // Connect to MySQL
    connection = await mysql.createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
      ssl: config.db.ssl
    });

    // Fetch absent employees
    const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
    const todayFormatted = new Date().toLocaleDateString('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });

    // Exclude PIN 050 on Sundays
    const localDay = new Date().toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Jakarta' });
    let query = `
      SELECT p.pegawai_pin as pin, p.pegawai_nama as name, COALESCE(d.pembagian1_nama, 'General') as department
      FROM pegawai p
      LEFT JOIN pembagian1 d ON p.pembagian1_id = d.pembagian1_id
      WHERE p.pegawai_status = 1
        AND p.pegawai_pin NOT IN (
          SELECT DISTINCT pin 
          FROM att_log 
          WHERE DATE(scan_date) = ?
        )
    `;
    if (localDay === 'Sun') {
      query += ` AND p.pegawai_pin NOT IN ('050', '50')`;
    }
    query += ` ORDER BY CAST(p.pegawai_pin AS UNSIGNED) ASC`;

    const [rows] = await connection.execute(query, [todayStr]);

    // Format message
    let message = `📢 *LAPORAN KARYAWAN TIDAK HADIR*\n`;
    message += `📅 Hari/Tanggal: *${todayFormatted}*\n\n`;

    if (rows.length === 0) {
      message += `Alhamdulillah, semua karyawan telah melakukan scan absensi hari ini! 🎉`;
    } else {
      message += `Berikut daftar karyawan yang *belum melakukan scan absensi* hari ini:\n\n`;
      rows.forEach((row, index) => {
        message += `${index + 1}. *[PIN ${row.pin}]* ${row.name} (${row.department})\n`;
      });
      message += `\nTotal Tidak Hadir: *${rows.length} orang*.`;
    }

    // Send via WhatsApp
    await client.sendMessage(groupJid, message);
    console.log(`✅ Laporan absensi berhasil dikirim ke grup WhatsApp (${groupJid})`);
    return {
      status: 'success',
      message: 'Laporan absensi berhasil dikirim ke WhatsApp!',
      count: rows.length
    };

  } catch (err) {
    console.error('Gagal membuat laporan absensi:', err.message);
    throw err;
  } finally {
    if (connection) {
      await connection.end();
    }
  }
}

// 4. Initialize Express API Server
const app = express();
app.use(express.json());

// Enable CORS for Next.js dashboard requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, x-api-key');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  next();
});

// API Key verification middleware
app.use((req, res, next) => {
  // Allow preflight OPTIONS requests without auth
  if (req.method === 'OPTIONS') {
    return next();
  }
  
  const apiKey = process.env.WA_API_KEY || 'madrasah_wa101';
  const clientKey = req.headers['x-api-key'] || req.headers['authorization'];
  
  if (clientKey !== apiKey) {
    console.warn(`🔒 Request blocked: Unauthorized access attempt to ${req.path} from ${req.ip}`);
    return res.status(401).json({
      status: 'error',
      message: 'Unauthorized: Invalid or missing API Key.'
    });
  }
  next();
});


// Trigger endpoint
app.post('/api/send-absent', async (req, res) => {
  if (!isReady) {
    return res.status(400).json({
      status: 'error',
      message: 'WhatsApp Bot belum siap atau belum di-scan. Silakan hubungkan WhatsApp Anda terlebih dahulu.'
    });
  }

  try {
    // Sinkronisasi data mesin absensi secara langsung via TCP (tanpa delay!)
    await triggerFingerprintSync();

    const result = await sendAbsentReport();
    res.json(result);
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Gagal mengirim pesan: ' + err.message
    });
  }
});

// Send custom message to a specific number
app.post('/api/send-message', async (req, res) => {
  if (!isReady) {
    return res.status(400).json({
      status: 'error',
      message: 'WhatsApp Bot belum siap atau belum di-scan. Silakan hubungkan WhatsApp Anda terlebih dahulu.'
    });
  }

  const { to, message } = req.body;
  if (!to || !message) {
    return res.status(400).json({
      status: 'error',
      message: 'Parameter "to" (nomor tujuan) dan "message" wajib diisi.'
    });
  }

  try {
    // Format recipient JID: remove non-digits, replace leading 0 with 62, append @c.us
    let chatId = to.toString().replace(/\D/g, '');
    if (chatId.startsWith('0')) {
      chatId = '62' + chatId.slice(1);
    }
    if (!chatId.endsWith('@c.us') && !chatId.endsWith('@g.us')) {
      chatId += '@c.us';
    }

    console.log(`📩 Mengirim pesan ke ${chatId}...`);
    const msg = await client.sendMessage(chatId, message);
    res.json({
      status: 'success',
      message: 'Pesan berhasil dikirim.',
      msg_id: msg.id.id
    });
  } catch (err) {
    console.error('Gagal mengirim pesan via API:', err.message);
    res.status(500).json({
      status: 'error',
      message: 'Gagal mengirim pesan: ' + err.message
    });
  }
});

// Health check and connection status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'success',
    connected: isReady,
    group_configured: !!config.whatsapp.group_jid,
    group_jid: config.whatsapp.group_jid || null,
    send_time: config.whatsapp.send_time || '07:35',
    reconciliation_enabled: config.whatsapp.reconciliation_enabled,
    qrCodeUrl: (!isReady && latestQr) ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(latestQr)}` : null
  });
});

// POST: Save config from cloud dashboard to local .env.local
app.post('/api/config', async (req, res) => {
  try {
    const { groupJid, sendTime, reconciliationEnabled } = req.body;
    const envPath = path.join(__dirname, '..', '.env.local');
    if (!fs.existsSync(envPath)) {
      return res.status(400).json({
        status: 'error',
        message: '.env.local tidak ditemukan di komputer lokal.'
      });
    }

    let envContent = fs.readFileSync(envPath, 'utf8');

    function updateEnvValue(content, key, value) {
      const regex = new RegExp(`^${key}=.*$`, 'm');
      if (regex.test(content)) {
        return content.replace(regex, `${key}=${value}`);
      } else {
        const separator = content.endsWith('\n') ? '' : '\n';
        return `${content}${separator}${key}=${value}`;
      }
    }

    if (groupJid !== undefined) {
      envContent = updateEnvValue(envContent, 'WA_GROUP_JID', groupJid);
    }
    if (sendTime !== undefined) {
      envContent = updateEnvValue(envContent, 'WA_SEND_TIME', sendTime);
    }
    if (reconciliationEnabled !== undefined) {
      envContent = updateEnvValue(envContent, 'WA_RECONCILIATION_ENABLED', String(reconciliationEnabled));
    }

    fs.writeFileSync(envPath, envContent, 'utf8');

    // Reload the config in memory
    reloadConfig();

    // Trigger PM2 restart in background
    const { exec } = require('child_process');
    setTimeout(() => {
      exec('pm2 restart whatsapp-bot-madrasah || pm2 restart whatsapp-bot', (err) => {
        if (err) console.error('Gagal me-restart PM2 bot lokal:', err.message);
      });
    }, 1000);

    res.json({
      status: 'success',
      message: 'Konfigurasi bot lokal berhasil diperbarui dan bot sedang memuat ulang.'
    });
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Gagal memperbarui konfigurasi bot lokal: ' + err.message
    });
  }
});

// Get list of all WhatsApp groups the bot is in
app.get('/api/groups', async (req, res) => {
  if (!isReady) {
    return res.status(400).json({
      status: 'error',
      message: 'WhatsApp Bot belum siap atau belum di-scan. Silakan hubungkan WhatsApp Anda terlebih dahulu.'
    });
  }

  try {
    const chats = await client.getChats();
    const groups = chats
      .filter(chat => chat.isGroup)
      .map(g => ({
        id: g.id._serialized,
        name: g.name
      }));
    res.json({
      status: 'success',
      groups
    });
  } catch (err) {
    console.error('Gagal mengambil daftar grup WhatsApp:', err.message);
    res.status(500).json({
      status: 'error',
      message: 'Gagal mengambil daftar grup: ' + err.message
    });
  }
});

// Sync fingerprint device data to database (called from dashboard)
app.post('/api/sync', async (req, res) => {
  try {
    const result = await triggerFingerprintSync();
    res.json(result);
  } catch (err) {
    res.status(500).json({
      status: 'error',
      message: 'Gagal sinkronisasi: ' + err.message
    });
  }
});

// Check fingerprint device connectivity status
app.get('/api/device-status', async (req, res) => {
  try {
    const result = await checkDeviceStatus();
    res.json({
      status: 'success',
      ...result
    });
  } catch (err) {
    res.json({
      status: 'error',
      reachable: false,
      error: err.message
    });
  }
});

const PORT = parseInt(process.env.WA_BOT_PORT || '3002');
app.listen(PORT, () => {
  console.log(`🚀 API Server Bot berjalan di port ${PORT}`);
});

// 5. Schedule Automated Daily Report
const [hour, minute] = config.whatsapp.send_time.split(':');
const cronExpr = `${minute || '0'} ${hour || '9'} * * *`;

console.log(`⏰ Laporan otomatis dijadwalkan setiap hari pukul ${config.whatsapp.send_time} (${cronExpr})`);

cron.schedule(cronExpr, async () => {
  console.log('⏰ Menjalankan pengiriman laporan terjadwal...');
  
  // Skip report sending on Fridays (Weekly Day Off)
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0 = Sunday, 5 = Friday
  if (dayOfWeek === 5) {
    console.log('⏰ Hari Jum\'at (Hari Libur Perusahaan), melewati pengiriman laporan otomatis.');
    return;
  }

  if (isReady) {
    try {
      // Auto sync locally and to TiDB Cloud before generating report
      console.log('🔄 Menjalankan sinkronisasi sebelum laporan harian...');
      await triggerFingerprintSync();

      await sendAbsentReport();
    } catch (err) {
      console.error('Gagal mengirim laporan terjadwal:', err.message);
    }
  } else {
    console.warn('⚠️ Laporan terjadwal dilewati: WhatsApp Bot belum terhubung.');
  }
}, {
  timezone: 'Asia/Jakarta'
});

// Start WhatsApp Client
client.initialize();
