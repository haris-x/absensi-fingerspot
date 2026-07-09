/**
 * fingerprint-sync.js
 *
 * Modul sinkronisasi langsung ke mesin fingerprint Fingerspot Revo W-230NM
 * via protokol ZKTeco TCP (port 4370), menggantikan PowerShell GUI automation.
 *
 * Alur:
 *  1. Connect ke mesin via TCP
 *  2. Ambil semua data attendance dari mesin
 *  3. Insert data baru ke database MySQL (skip duplikat)
 *  4. Disconnect dari mesin
 */

const ZKLib = require('node-zklib');
const mysql = require('mysql2/promise');
const path = require('path');
const { exec } = require('child_process');

// Pastikan env sudah loaded (dipanggil dari bot.js yang sudah load dotenv)
function getConfig() {
  return {
    device: {
      ip: process.env.DEVICE_IP || '192.168.0.34',
      port: parseInt(process.env.DEVICE_PORT || '4370'),
    },
    db: {
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'fin_pro',
    }
  };
}

/**
 * Format Date ke string 'YYYY-MM-DD HH:MM:SS'
 */
function formatDateTime(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

/**
 * Helper to run the PowerShell GUI automation script
 */
function runPowerShellScript() {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'restore_and_click.ps1');
    const cmd = `powershell.exe -ExecutionPolicy Bypass -File "${scriptPath}"`;
    console.log(`🤖 Menjalankan skrip PowerShell: ${cmd}`);
    
    exec(cmd, { cwd: __dirname }, (error, stdout, stderr) => {
      if (error) {
        console.error(`❌ Exec error: ${error.message}`);
        return reject(error);
      }
      const output = stdout.trim();
      console.log(`🤖 Output skrip: ${output}`);
      if (stderr) {
        console.warn(`⚠️ Stderr skrip: ${stderr}`);
      }
      resolve(output);
    });
  });
}

/**
 * Sinkronisasi data attendance menggunakan restore_and_click.ps1
 *
 * @returns {Object} { status, message, stats: { total, inserted, skipped, errors } }
 */
async function syncFromDevice() {
  const config = getConfig();
  const startTime = Date.now();

  let connection = null;

  const stats = {
    deviceLogs: 0,
    inserted: 0,
    skipped: 0,
    errors: 0,
  };

  try {
    // ========== 1. HITUNG DATA SEBELUMNYA ==========
    console.log('📊 Menghitung total data absensi sebelum sinkronisasi...');
    connection = await mysql.createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
    });

    const [rowsBefore] = await connection.execute('SELECT COUNT(*) as count FROM att_log');
    const countBefore = rowsBefore[0].count;
    await connection.end();
    connection = null;

    // ========== 2. JALANKAN POWERSELL SCRIPT ==========
    console.log('🔌 Menjalankan skrip restore_and_click.ps1...');
    const result = await runPowerShellScript();

    if (!result.includes('SUCCESS')) {
      let friendlyError = 'Gagal sinkronisasi data.';
      if (result.includes('BUTTON_NOT_FOUND')) {
        friendlyError = 'Tombol "Download" tidak ditemukan di jendela Fingerspot Personnel Downloader.';
      } else if (result.includes('WINDOW_ELEMENT_FAILED')) {
        friendlyError = 'Gagal mendeteksi elemen jendela Fingerspot Personnel Downloader.';
      } else if (result.includes('HANDLE_NOT_FOUND')) {
        friendlyError = 'Aplikasi Fingerspot Personnel Downloader tidak sedang berjalan atau tidak ditemukan.';
      } else if (result.includes('ERROR:')) {
        friendlyError = `Terjadi kesalahan pada skrip otomasi: ${result}`;
      } else {
        friendlyError = `Gagal menjalankan otomasi penarikan data (output: ${result})`;
      }
      throw new Error(friendlyError);
    }

    // ========== 3. HITUNG DATA SETELAHNYA ==========
    console.log('📊 Menghitung total data absensi setelah sinkronisasi...');
    connection = await mysql.createConnection({
      host: config.db.host,
      port: config.db.port,
      user: config.db.user,
      password: config.db.password,
      database: config.db.database,
    });

    const [rowsAfter] = await connection.execute('SELECT COUNT(*) as count FROM att_log');
    const countAfter = rowsAfter[0].count;

    const inserted = countAfter - countBefore;
    stats.inserted = inserted;
    stats.deviceLogs = inserted; // Set total to inserted as placeholder

    const duration = Date.now() - startTime;
    console.log(`\n✅ Sinkronisasi restoreandclick selesai dalam ${(duration / 1000).toFixed(1)} detik.`);
    console.log(`   📊 Baru: ${stats.inserted}`);

    return {
      status: 'success',
      message: `Sinkronisasi berhasil! ${stats.inserted} data baru ditambahkan ke database.`,
      stats,
      duration,
      deviceInfo: { userCounts: '-', logCounts: '-', logCapacity: '-' }
    };

  } catch (err) {
    const duration = Date.now() - startTime;
    console.error('❌ Gagal sinkronisasi:', err.message);

    return {
      status: 'error',
      message: `Gagal sinkronisasi: ${err.message}`,
      stats,
      duration,
      deviceInfo: null
    };
  } finally {
    if (connection) {
      try {
        await connection.end();
      } catch (err) {}
    }
  }
}

/**
 * Cek status koneksi ke mesin fingerprint (ping test)
 *
 * @returns {Object} { reachable, info, error }
 */
async function checkDeviceStatus() {
  const config = getConfig();
  let zkInstance = null;

  try {
    zkInstance = new ZKLib(config.device.ip, config.device.port, 5000, 4000);
    await zkInstance.createSocket();

    const info = await zkInstance.getInfo();

    return {
      reachable: true,
      ip: config.device.ip,
      port: config.device.port,
      info,
      error: null
    };
  } catch (err) {
    return {
      reachable: false,
      ip: config.device.ip,
      port: config.device.port,
      info: null,
      error: err.message
    };
  } finally {
    if (zkInstance) {
      try {
        await zkInstance.disconnect();
      } catch (err) {}
    }
  }
}

module.exports = { syncFromDevice, checkDeviceStatus };
