/**
 * fingerprint-sync-telnet.js
 *
 * Modul sinkronisasi langsung ke mesin fingerprint Fingerspot Revo W-230NM
 * via Telnet (port 23), menggantikan PowerShell GUI automation.
 *
 * Alur:
 *  1. Connect ke mesin via Telnet (port 23, login guest/guest)
 *  2. Download file /mnt/data/attend.dat via dd + base64 (chunk 1024 byte)
 *  3. Parse record 16-byte (header LOGVER02 32 byte)
 *  4. INSERT IGNORE ke database Oracle (via Tailscale)
 *
 * Format record attend.dat (16 byte):
 *   byte 0-3:  timestamp Unix UTC (little-endian)
 *   byte 4-7:  PIN (little-endian)
 *   byte 8:    type1
 *   byte 9:    verifymode (0=Password, 1=Fingerprint, 2=Card, 3=Face)
 *   byte 10:   inoutmode (0=In, 1=Out, 4=Overtime In, 5=Overtime Out)
 *   byte 11:   reserved
 *   byte 12-15: work_code
 */

const net = require('net');
const mysql = require('mysql2/promise');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Load environment variables
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') });

const HEADER_SIZE = 40;
const RECORD_SIZE = 16;
const HEADER_MAGIC = 'LOGVER02';
const BS = 1024; // dd block size
const MIN_VALID_TIMESTAMP = 1577836800; // 2020-01-01 00:00:00 UTC (skip record sebelum ini)

function getConfig() {
  return {
    device: {
      ip: process.env.DEVICE_IP || '192.168.0.34',
      port: parseInt(process.env.DEVICE_PORT || '23'),
      telnet_user: process.env.DEVICE_TELNET_USER || 'guest',
      telnet_pass: process.env.DEVICE_TELNET_PASS || 'guest',
    },
    db: {
      // Target: Oracle DB via Tailscale (TIDB_* env)
      host: process.env.TIDB_HOST || process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.TIDB_PORT || process.env.DB_PORT || '3306'),
      user: process.env.TIDB_USER || process.env.DB_USER || 'root',
      password: process.env.TIDB_PASSWORD || process.env.DB_PASSWORD || '',
      database: process.env.TIDB_NAME || process.env.DB_NAME || 'fin_pro',
      ssl: (process.env.TIDB_HOST?.includes('tidbcloud.com') || process.env.TIDB_SSL === 'true') ? {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
      } : undefined
    }
  };
}

/**
 * Format Date ke string 'YYYY-MM-DD HH:MM:SS' (UTC)
 */
function formatDateTimeUTC(date) {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * Telnet session helper: login, run commands, collect output
 */
class TelnetSession {
  constructor(ip, port, user, pass, timeoutMs = 60000) {
    this.ip = ip;
    this.port = port;
    this.user = user;
    this.pass = pass;
    this.timeoutMs = timeoutMs;
    this.socket = null;
    this.buf = '';
  }

  connect() {
    return new Promise((resolve, reject) => {
      const s = new net.Socket();
      s.setTimeout(this.timeoutMs);
      let buf = '';
      let step = 0;
      let resolved = false;

      const send = (str) => s.write(str + '\r\n');

      s.on('data', (d) => {
        let str = d.toString('latin1');
        // Telnet IAC negotiation: respond WONT to all DO/WILL
        if (str.charCodeAt(0) === 255) {
          let resp = Buffer.alloc(0);
          for (let i = 0; i < str.length; i++) {
            if (str.charCodeAt(i) === 255 && i + 2 < str.length) {
              const cmd = str.charCodeAt(i + 1);
              const opt = str.charCodeAt(i + 2);
              if (cmd === 253 || cmd === 251) {
                resp = Buffer.concat([resp, Buffer.from([255, 252, opt])]);
              }
            }
          }
          if (resp.length) s.write(resp);
          str = str.replace(/[\xff\xfd\xfb\xfe\x01\x1f\x03]/g, '');
        }
        buf += str;

        if (step === 0 && buf.includes('login:')) { send(this.user); step = 1; buf = ''; }
        else if (step === 1 && buf.includes('Password:')) { send(this.pass); step = 2; buf = ''; }
        else if (step === 2 && /# $/.test(buf)) {
          step = 3; resolved = true; this.socket = s; this.buf = '';
          resolve();
        }
        else if (step === 2 && /incorrect/i.test(buf)) {
          resolved = true; s.destroy();
          reject(new Error('Login Telnet gagal: user/password salah'));
        }
      });

      s.on('timeout', () => {
        if (!resolved) { s.destroy(); reject(new Error('Timeout koneksi Telnet (login)')); }
      });
      s.on('error', (e) => {
        if (!resolved) { s.destroy(); reject(new Error('Koneksi Telnet error: ' + e.message)); }
      });
      s.connect(this.port, this.ip);
    });
  }

  /**
   * Run a command and wait for prompt (# ) to return
   * @returns {string} command output (without echo and prompt)
   */
  exec(command) {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Telnet session tidak terhubung'));
      let buf = '';
      let step = 0;
      let resolved = false;

      const onData = (d) => {
        let str = d.toString('latin1');
        if (str.charCodeAt(0) === 255) {
          let resp = Buffer.alloc(0);
          for (let i = 0; i < str.length; i++) {
            if (str.charCodeAt(i) === 255 && i + 2 < str.length) {
              const cmd = str.charCodeAt(i + 1);
              const opt = str.charCodeAt(i + 2);
              if (cmd === 253 || cmd === 251) {
                resp = Buffer.concat([resp, Buffer.from([255, 252, opt])]);
              }
            }
          }
          if (resp.length) this.socket.write(resp);
          str = str.replace(/[\xff\xfd\xfb\xfe\x01\x1f\x03]/g, '');
        }
        buf += str;
        if (step === 0 && /# $/.test(buf)) {
          resolved = true;
          this.socket.removeListener('data', onData);
          this.socket.removeListener('timeout', onTimeout);
          this.socket.removeListener('error', onError);
          resolve(buf);
        }
      };
      const onTimeout = () => {
        if (!resolved) {
          this.socket.removeListener('data', onData);
          this.socket.removeListener('error', onError);
          reject(new Error('Timeout eksekusi command Telnet: ' + command.slice(0, 60)));
        }
      };
      const onError = (e) => {
        if (!resolved) {
          this.socket.removeListener('data', onData);
          this.socket.removeListener('timeout', onTimeout);
          reject(new Error('Error Telnet: ' + e.message));
        }
      };

      this.socket.on('data', onData);
      this.socket.once('timeout', onTimeout);
      this.socket.once('error', onError);
      this.socket.write(command + '\r\n');
    });
  }

  /**
   * Download file via dd + base64 chunking
   * @param {string} devicePath - path file di mesin
   * @param {number} fileSize - ukuran file
   * @param {function} onProgress - callback (offset, total)
   * @returns {Buffer} file content
   */
  async downloadFile(devicePath, fileSize, onProgress) {
    const chunks = [];
    let skipBlocks = 0;

    while (skipBlocks * BS < fileSize) {
      const offset = skipBlocks * BS;
      const remaining = fileSize - offset;
      const count = remaining < BS ? remaining : 1;
      const cmd = remaining < BS
        ? `dd if=${devicePath} bs=${remaining} skip=${skipBlocks} count=1 2>/dev/null | base64; echo __C${skipBlocks}__`
        : `dd if=${devicePath} bs=${BS} skip=${skipBlocks} count=1 2>/dev/null | base64; echo __C${skipBlocks}__`;

      const response = await this.exec(cmd);

      // Extract base64: find LAST __C<N>__ marker (first is in command echo)
      const markerRe = /__C\d+__/g;
      const matches = [...response.matchAll(markerRe)];
      if (matches.length === 0) {
        throw new Error(`Marker tidak ditemukan pada block ${skipBlocks}`);
      }
      const lastMatch = matches[matches.length - 1];
      const before = response.slice(0, lastMatch.index);

      // Extract base64 lines (only lines with valid base64 chars)
      let b64 = '';
      for (const line of before.split('\r\n')) {
        const t = line.trim();
        if (/^[A-Za-z0-9+/=]+$/.test(t) && t.length > 0) b64 += t;
      }

      if (b64.length > 0) {
        try {
          const bin = Buffer.from(b64, 'base64');
          chunks.push(bin);
        } catch (e) {
          throw new Error(`Decode base64 gagal pada block ${skipBlocks}: ${e.message}`);
        }
      }

      skipBlocks++;
      if (onProgress && (skipBlocks % 50 === 0 || offset + BS >= fileSize)) {
        onProgress(Math.min(offset + BS, fileSize), fileSize);
      }
    }

    return Buffer.concat(chunks);
  }

  disconnect() {
    if (this.socket) {
      try { this.socket.destroy(); } catch (e) {}
      this.socket = null;
    }
  }
}

/**
 * Parse attend.dat file
 * @param {Buffer} data - raw file content
 * @returns {Array} array of { scan_date, pin, verifymode, inoutmode, reserved, work_code }
 */
function parseAttendLog(data) {
  // Verify header
  const magic = data.slice(0, 8).toString('latin1');
  if (magic !== HEADER_MAGIC) {
    throw new Error(`Format file tidak valid: header "${magic}" != "${HEADER_MAGIC}"`);
  }

  const totalRecords = Math.floor((data.length - HEADER_SIZE) / RECORD_SIZE);
  const records = [];

  for (let i = 0; i < totalRecords; i++) {
    const off = HEADER_SIZE + i * RECORD_SIZE;
    const ts = data.readUInt32LE(off);
    const pin = data.readUInt32LE(off + 4);

    // Skip invalid records (timestamp before 2020 = garbage)
    if (ts < MIN_VALID_TIMESTAMP) continue;

    const scanDate = new Date(ts * 1000);
    const scanDateStr = formatDateTimeUTC(scanDate);
    const verifymode = data[off + 9] || 0;
    const inoutmode = data[off + 10] || 0;
    const reserved = data[off + 11] || 0;
    const workCode = data.readUInt32LE(off + 12) || 0;

    records.push({
      scan_date: scanDateStr,
      pin: String(pin),
      verifymode,
      inoutmode,
      reserved,
      work_code: workCode,
    });
  }

  return records;
}

/**
 * Insert attendance records to Oracle DB (batch, INSERT IGNORE)
 * Uses connection pool with reconnect on failure
 * @param {Array} records - parsed records
 * @param {Object} dbConfig - database config
 * @returns {Object} { inserted, skipped }
 */
async function insertToDatabase(records, dbConfig) {
  const stats = { inserted: 0, skipped: 0 };

  // Create pool for reliable reconnection
  const pool = mysql.createPool({
    host: dbConfig.host,
    port: dbConfig.port,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.database,
    ssl: dbConfig.ssl,
    waitForConnections: true,
    connectionLimit: 3,
    queueLimit: 0,
    connectTimeout: 20000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
  });

  try {
    // Get count before
    let conn;
    try {
      conn = await pool.getConnection();
      const [beforeRows] = await conn.execute('SELECT COUNT(*) as count FROM att_log');
      const countBefore = beforeRows[0].count;
      console.log(`📊 att_log sebelum sync: ${countBefore} records`);
      conn.release();
    } catch (e) {
      console.warn(`⚠️ Gagal menghitung data sebelumnya: ${e.message}`);
    }

    // Batch insert (500 per batch)
    const BATCH = 500;
    for (let i = 0; i < records.length; i += BATCH) {
      const batch = records.slice(i, i + BATCH);
      const values = batch.map(r => [
        null,           // sn (unknown from device)
        r.scan_date,    // scan_date
        r.pin,          // pin
        r.verifymode,   // verifymode
        r.inoutmode,    // inoutmode
        r.reserved,     // reserved
        r.work_code,    // work_code
        null,           // att_id
      ]);
      const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
      const flat = values.flat();

      let retries = 0;
      const maxRetries = 3;
      while (retries < maxRetries) {
        try {
          const c = await pool.getConnection();
          const [result] = await c.query(
            `INSERT IGNORE INTO att_log (sn, scan_date, pin, verifymode, inoutmode, reserved, work_code, att_id) VALUES ${placeholders}`,
            flat
          );
          stats.inserted += result.affectedRows;
          stats.skipped += (batch.length - result.affectedRows);
          c.release();
          break;
        } catch (err) {
          retries++;
          if (retries >= maxRetries) {
            console.error(`⚠️ Gagal insert batch ${i} setelah ${maxRetries}x: ${err.message}`);
            stats.skipped += batch.length;
          } else {
            console.warn(`⚠️ Retry ${retries}/${maxRetries} batch ${i}: ${err.message}`);
            await new Promise(r => setTimeout(r, 2000));
          }
        }
      }

      // Progress log every 5000 records
      if ((i + BATCH) % 5000 === 0 || i + BATCH >= records.length) {
        console.log(`   inserted: ${stats.inserted}, skipped: ${stats.skipped} (${i + BATCH}/${records.length})`);
      }
    }

    // Get count after
    try {
      conn = await pool.getConnection();
      const [afterRows] = await conn.execute('SELECT COUNT(*) as count FROM att_log');
      const countAfter = afterRows[0].count;
      console.log(`📊 att_log setelah sync: ${countAfter} records`);
      conn.release();
    } catch (e) {
      console.warn(`⚠️ Gagal menghitung data setelahnya: ${e.message}`);
    }

    return stats;
  } finally {
    try { await pool.end(); } catch (e) {}
  }
}

/**
 * Sinkronisasi data attendance via Telnet
 *
 * @returns {Object} { status, message, stats: { deviceLogs, inserted, skipped, errors }, duration, deviceInfo }
 */
async function syncFromDevice() {
  const config = getConfig();
  const startTime = Date.now();

  const stats = {
    deviceLogs: 0,
    inserted: 0,
    skipped: 0,
    errors: 0,
  };

  let session = null;

  try {
    // ========== 1. CONNECT VIA TELNET ==========
    console.log(`🔌 Menghubungkan ke mesin via Telnet ${config.device.ip}:${config.device.port}...`);
    session = new TelnetSession(
      config.device.ip,
      config.device.port,
      config.device.telnet_user,
      config.device.telnet_pass,
      30000
    );
    await session.connect();
    console.log('✅ Terhubung ke mesin via Telnet.');

    // ========== 2. CEK UKURAN FILE attend.dat ==========
    console.log('📊 Mengecek ukuran file attend.dat...');
    const statOutput = await session.exec('stat -c %s /mnt/data/attend.dat 2>/dev/null');
    // Output: "<command echo>\r\n<size>\r\n[@buildroot /]# "
    // Extract number from the line after command echo (skip first line containing "stat")
    const statLines = statOutput.split('\r\n').map(l => l.trim()).filter(l => l.length > 0);
    let fileSize = 0;
    for (const line of statLines) {
      // Skip command echo (contains "stat") and prompt (contains "#")
      if (line.includes('stat') || line.includes('#')) continue;
      const m = line.match(/^(\d+)$/);
      if (m) { fileSize = parseInt(m[1]); break; }
    }

    if (fileSize === 0) {
      throw new Error('File attend.dat tidak ditemukan atau kosong di mesin.');
    }
    console.log(`📊 Ukuran attend.dat: ${fileSize} bytes (${Math.ceil(fileSize / BS)} blocks)`);

    // ========== 3. DOWNLOAD attend.dat ==========
    console.log('📥 Mendownload attend.dat via dd + base64...');
    const attendData = await session.downloadFile('/mnt/data/attend.dat', fileSize, (offset, total) => {
      const pct = Math.round((offset / total) * 100);
      console.log(`   progress: ${offset}/${total} (${pct}%)`);
    });

    if (attendData.length !== fileSize) {
      console.warn(`⚠️ Ukuran download (${attendData.length}) != expected (${fileSize}), tetap mencoba parse.`);
    }
    console.log(`✅ Download selesai: ${attendData.length} bytes`);

    // ========== 4. PARSE RECORD ==========
    console.log('📝 Parsing record absensi...');
    const records = parseAttendLog(attendData);
    stats.deviceLogs = records.length;
    console.log(`📝 Total record valid: ${records.length} (dari ${Math.floor((attendData.length - HEADER_SIZE) / RECORD_SIZE)} total)`);

    if (records.length === 0) {
      throw new Error('Tidak ada record valid yang bisa di-parse dari attend.dat');
    }

    // ========== 5. INSERT KE ORACLE DB ==========
    console.log(`💾 Menginsert ${records.length} record ke Oracle DB (${config.db.host}:${config.db.port})...`);
    const insertStats = await insertToDatabase(records, config.db);
    stats.inserted = insertStats.inserted;
    stats.skipped = insertStats.skipped;

    const duration = Date.now() - startTime;
    console.log(`\n✅ Sinkronisasi Telnet selesai dalam ${(duration / 1000).toFixed(1)} detik.`);
    console.log(`   📊 Device logs: ${stats.deviceLogs}, Inserted: ${stats.inserted}, Skipped: ${stats.skipped}`);

    return {
      status: 'success',
      message: `Sinkronisasi Telnet berhasil! ${stats.inserted} data baru, ${stats.skipped} duplikat dilewati.`,
      stats,
      duration,
      deviceInfo: { userCounts: '-', logCounts: String(stats.deviceLogs), logCapacity: '-' }
    };

  } catch (err) {
    const duration = Date.now() - startTime;
    console.error('❌ Gagal sinkronisasi Telnet:', err.message);

    return {
      status: 'error',
      message: `Gagal sinkronisasi Telnet: ${err.message}`,
      stats,
      duration,
      deviceInfo: null
    };
  } finally {
    if (session) {
      session.disconnect();
    }
  }
}

/**
 * Cek status koneksi ke mesin fingerprint via Telnet
 *
 * @returns {Object} { reachable, ip, port, info, error }
 */
async function checkDeviceStatus() {
  const config = getConfig();
  let session = null;

  try {
    session = new TelnetSession(
      config.device.ip,
      config.device.port,
      config.device.telnet_user,
      config.device.telnet_pass,
      10000
    );
    await session.connect();

    // Try to get device info
    let info = {};
    try {
      const unameOut = await session.exec('uname -a');
      info.uname = unameOut.split('\r\n')[1] || unameOut;
    } catch (e) {}

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
    if (session) {
      session.disconnect();
    }
  }
}

module.exports = { syncFromDevice, checkDeviceStatus, parseAttendLog, TelnetSession };
