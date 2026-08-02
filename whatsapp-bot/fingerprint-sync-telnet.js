/**
 * fingerprint-sync-telnet.js
 *
 * Modul sinkronisasi langsung ke mesin fingerprint Fingerspot Revo W-230NM
 * via Telnet (port 23), menggantikan PowerShell GUI automation.
 *
 * Format data disamakan PERSIS dengan Fingerspot Downloader (aplikasi bawaan):
 *  - sn: kosong ('')
 *  - att_id: DDMMYYYYHHMMSS + PIN (tanpa SN mesin)
 *  - inoutmode: diambil dari byte asli record (bukan hardcoded)
 *  - pin: 3 digit dengan leading zero
 *
 * Deduplikasi mengikuti perilaku Downloader:
 *  - Cek existing records berdasarkan (pin, scan_date)
 *  - Hanya insert record yang benar-benar baru
 *  - Jika sudah ada, skip (Downloader tidak download data lama)
 *
 * Alur:
 *  1. Connect ke mesin via Telnet (port 23, login guest/guest)
 *  2. Download file /mnt/data/attend.dat via dd + base64 (chunk 1024 byte)
 *  3. Parse record 16-byte (header LOGVER02 32 byte)
 *  4. Pre-check duplikat (pin + scan_date) lalu INSERT IGNORE ke database
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
      sn: process.env.DEVICE_SN || '616230023351388',
    },
    db: {
      // Target: MySQL Lokal (127.0.0.1:3309)
      host: process.env.DB_HOST || '127.0.0.1',
      port: parseInt(process.env.DB_PORT || '3306'),
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'fin_pro',
      ssl: (process.env.DB_SSL === 'true') ? {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: true
      } : undefined
    }
  };
}

/**
 * Format Date epoch menjadi String 'YYYY-MM-DD HH:MM:SS' sesuai jam lokal mesin (tanpa offset UTC)
 */
function formatDateTimeLocal(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const hh = String(date.getUTCHours()).padStart(2, '0');
  const mm = String(date.getUTCMinutes()).padStart(2, '0');
  const ss = String(date.getUTCSeconds()).padStart(2, '0');
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

/**
 * Buat att_id persis sesuai format Fingerspot Downloader: DDMMYYYYHHMMSS + SN + PIN
 * Contoh: "28072026100625616230023351388006"
 *
 * Format ini sama dengan Downloader baru yang menyertakan SN mesin di att_id.
 */
function generateAttId(scanDateStr, sn, pin) {
  const [datePart, timePart] = scanDateStr.split(' ');
  const [y, m, d] = datePart.split('-');
  const [hh, mm, ss] = (timePart || '00:00:00').split(':');
  return `${d}${m}${y}${hh}${mm}${ss}${sn}${pin}`;
}

/**
 * Parse User.dat untuk membuat mapping userId -> PIN ASCII
 * Setiap record = 672 byte. userId di byte 8 (LE), PIN ASCII di offset 0x280.
 * @param {Buffer} data - raw User.dat content
 * @returns {Map} Map<userId(number), pinAscii(string)>
 */
function parseUserDat(data) {
  const RECORD_SIZE_USER = 672;
  const userMap = new Map();
  const totalRecords = Math.floor(data.length / RECORD_SIZE_USER);

  for (let i = 0; i < totalRecords; i++) {
    const off = i * RECORD_SIZE_USER;
    const userId = data.readUInt32LE(off + 8);
    const pinAscii = data.slice(off + 0x280, off + 0x290).toString('latin1').replace(/\0/g, '').trim();
    if (userId > 0 && pinAscii.length > 0) {
      userMap.set(userId, pinAscii.padStart(3, '0'));
    }
  }

  return userMap;
}

// Path untuk menyimpan state sync terakhir (mtime check)
const SYNC_STATE_PATH = path.join(__dirname, '.sync-state.json');

/**
 * Baca state sync terakhir dari file lokal
 * @returns {Object|null} { last_mtime, last_file_size, last_sync_at, user_mtime, user_map } atau null jika belum ada
 */
function loadSyncState() {
  try {
    if (!fs.existsSync(SYNC_STATE_PATH)) return null;
    const content = fs.readFileSync(SYNC_STATE_PATH, 'utf8');
    return JSON.parse(content);
  } catch (e) {
    console.warn(`⚠️ Gagal membaca sync state: ${e.message}`);
    return null;
  }
}

/**
 * Simpan state sync terakhir ke file lokal (termasuk cache userMap)
 * @param {number} mtime - mtime epoch dari file attend.dat di mesin
 * @param {number} fileSize - ukuran file attend.dat
 * @param {number} userMtime - mtime epoch dari file User.dat di mesin (opsional)
 * @param {Object} userMap - mapping userId -> PIN (opsional, untuk cache)
 */
function saveSyncState(mtime, fileSize, userMtime, userMap) {
  try {
    const state = {
      last_mtime: mtime,
      last_file_size: fileSize,
      last_sync_at: new Date().toISOString(),
    };
    if (userMtime !== undefined) state.user_mtime = userMtime;
    if (userMap !== undefined) state.user_map = userMap;
    fs.writeFileSync(SYNC_STATE_PATH, JSON.stringify(state, null, 2), 'utf8');
  } catch (e) {
    console.warn(`⚠️ Gagal menyimpan sync state: ${e.message}`);
  }
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
   * @param {string} command - command to execute
   * @param {number} timeoutMs - optional timeout override (default: use socket timeout)
   * @returns {string} command output (without echo and prompt)
   */
  exec(command, timeoutMs = null) {
    return new Promise((resolve, reject) => {
      if (!this.socket) return reject(new Error('Telnet session tidak terhubung'));
      let buf = '';
      let step = 0;
      let resolved = false;

      // Override timeout sementara jika diberikan
      const oldTimeout = this.socket.timeout;
      if (timeoutMs && timeoutMs !== oldTimeout) {
        this.socket.setTimeout(timeoutMs);
      }

      const restoreTimeout = () => {
        if (timeoutMs && timeoutMs !== oldTimeout && oldTimeout > 0) {
          this.socket.setTimeout(oldTimeout);
        }
      };

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
          restoreTimeout();
          resolve(buf);
        }
      };
      const onTimeout = () => {
        if (!resolved) {
          this.socket.removeListener('data', onData);
          this.socket.removeListener('error', onError);
          restoreTimeout();
          reject(new Error('Timeout eksekusi command Telnet: ' + command.slice(0, 60)));
        }
      };
      const onError = (e) => {
        if (!resolved) {
          this.socket.removeListener('data', onData);
          this.socket.removeListener('timeout', onTimeout);
          restoreTimeout();
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
    const EXEC_TIMEOUT = 120000; // 120 detik per block (base64 encoding bisa lambat)

    while (skipBlocks * BS < fileSize) {
      const offset = skipBlocks * BS;
      const remaining = fileSize - offset;
      const isLast = remaining < BS;
      // Untuk block terakhir, gunakan bs=1 dengan skip=offset dan count=remaining
      // agar offset selalu konsisten (tidak tergantung perubahan bs)
      const cmd = isLast
        ? `dd if=${devicePath} bs=1 skip=${offset} count=${remaining} 2>/dev/null | base64; echo __C${skipBlocks}__`
        : `dd if=${devicePath} bs=${BS} skip=${skipBlocks} count=1 2>/dev/null | base64; echo __C${skipBlocks}__`;

      // Retry mechanism untuk setiap block
      let retries = 0;
      const maxRetries = 3;
      let response = null;
      while (retries < maxRetries) {
        try {
          response = await this.exec(cmd, EXEC_TIMEOUT);
          break;
        } catch (err) {
          retries++;
          if (retries >= maxRetries) {
            throw new Error(`Gagal download block ${skipBlocks} setelah ${maxRetries}x: ${err.message}`);
          }
          console.warn(`⚠️ Retry ${retries}/${maxRetries} block ${skipBlocks}: ${err.message}`);
          await new Promise(r => setTimeout(r, 1000));
        }
      }

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

  /**
   * Download file range (misal untuk incremental sync)
   * @param {string} devicePath - path file di mesin
   * @param {number} startOffset - byte offset awal
   * @param {number} length - jumlah byte yang mau didownload
   * @param {function} onProgress - callback (downloaded, total)
   * @returns {Buffer} buffer data
   */
  async downloadFileRange(devicePath, startOffset, length, onProgress) {
    const chunks = [];
    let bytesFetched = 0;
    const EXEC_TIMEOUT = 120000; // 120 detik per block

    while (bytesFetched < length) {
      const currentPos = startOffset + bytesFetched;
      const count = Math.min(BS, length - bytesFetched);
      const cmd = `dd if=${devicePath} bs=1 skip=${currentPos} count=${count} 2>/dev/null | base64; echo __CR${bytesFetched}__`;

      // Retry mechanism
      let retries = 0;
      const maxRetries = 3;
      let response = null;
      while (retries < maxRetries) {
        try {
          response = await this.exec(cmd, EXEC_TIMEOUT);
          break;
        } catch (err) {
          retries++;
          if (retries >= maxRetries) {
            throw new Error(`Gagal download range byte ${currentPos} setelah ${maxRetries}x: ${err.message}`);
          }
          console.warn(`⚠️ Retry ${retries}/${maxRetries} range ${currentPos}: ${err.message}`);
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      const markerRe = /__CR\d+__/g;
      const matches = [...response.matchAll(markerRe)];
      if (matches.length === 0) {
        throw new Error(`Marker range tidak ditemukan pada byte pos ${currentPos}`);
      }
      const lastMatch = matches[matches.length - 1];
      const before = response.slice(0, lastMatch.index);

      let b64 = '';
      for (const line of before.split('\r\n')) {
        const t = line.trim();
        if (/^[A-Za-z0-9+/=]+$/.test(t) && t.length > 0) b64 += t;
      }

      if (b64.length > 0) {
        const bin = Buffer.from(b64, 'base64');
        chunks.push(bin);
        bytesFetched += bin.length;
      } else {
        break;
      }

      if (onProgress) {
        onProgress(bytesFetched, length);
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
 * Parse attend.dat file penuh
 * @param {Buffer} data - raw file content
 * @param {string} sn - serial number perangkat
 * @param {Map} userMap - mapping userId -> PIN ASCII dari User.dat
 * @returns {Array} array of { sn, scan_date, pin, verifymode, inoutmode, reserved, work_code, att_id }
 */
function parseAttendLog(data, sn = '616230023351388', userMap = null) {
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
    const userId = data.readUInt32LE(off + 4);

    // Skip invalid records (timestamp before 2020 = garbage)
    if (ts < MIN_VALID_TIMESTAMP) continue;

    const scanDate = new Date(ts * 1000);
    const scanDateStr = formatDateTimeLocal(scanDate);
    // Gunakan userMap untuk dapat PIN ASCII yang benar, fallback ke padStart
    const pinFormatted = userMap && userMap.has(userId)
      ? userMap.get(userId)
      : String(userId).padStart(3, '0');
    const verifymode = data[off + 9] || 1;
    const inoutmode = data[off + 10] || 0;
    const attId = generateAttId(scanDateStr, sn, pinFormatted);

    records.push({
      sn: sn,
      scan_date: scanDateStr,
      pin: pinFormatted,
      verifymode: verifymode,
      inoutmode: inoutmode,
      reserved: 0,
      work_code: 0,
      att_id: attId,
    });
  }

  return records;
}

/**
 * Parse chunk delta dari attend.dat (tanpa header 40 byte)
 * @param {Buffer} data - raw partial buffer (harus kelipatan 16 byte)
 * @param {string} sn - serial number perangkat
 * @param {Map} userMap - mapping userId -> PIN ASCII dari User.dat
 * @returns {Array} array of records
 */
function parsePartialAttendLog(data, sn = '616230023351388', userMap = null) {
  const totalRecords = Math.floor(data.length / RECORD_SIZE);
  const records = [];

  for (let i = 0; i < totalRecords; i++) {
    const off = i * RECORD_SIZE;
    const ts = data.readUInt32LE(off);
    const userId = data.readUInt32LE(off + 4);

    if (ts < MIN_VALID_TIMESTAMP) continue;

    const scanDate = new Date(ts * 1000);
    const scanDateStr = formatDateTimeLocal(scanDate);
    const pinFormatted = userMap && userMap.has(userId)
      ? userMap.get(userId)
      : String(userId).padStart(3, '0');
    const verifymode = data[off + 9] || 1;
    const inoutmode = data[off + 10] || 0;
    const attId = generateAttId(scanDateStr, sn, pinFormatted);

    records.push({
      sn: sn,
      scan_date: scanDateStr,
      pin: pinFormatted,
      verifymode: verifymode,
      inoutmode: inoutmode,
      reserved: 0,
      work_code: 0,
      att_id: attId,
    });
  }

  return records;
}

/**
 * Insert attendance records to database (batch, INSERT IGNORE)
 * Uses connection pool with reconnect on failure
 *
 * Mengikuti perilaku Fingerspot Downloader:
 *   - Ambil MAX(scan_date) dari database
 *   - Hanya insert record dengan scan_date > MAX(scan_date)
 *   - INSERT IGNORE sebagai safety net (primary key mencegah duplikat)
 *
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
    dateStrings: true, // Pastikan DATE/DATETIME dikembalikan sebagai string
  });

  try {
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

    // ========== FILTER: Hanya ambil record lebih baru dari MAX(scan_date) ==========
    // Sama seperti Downloader: hanya download data yang belum ada di database
    let newRecords = records;
    try {
      conn = await pool.getConnection();
      const [maxRows] = await conn.execute('SELECT MAX(scan_date) as max_date FROM att_log');
      conn.release();

      const maxDate = maxRows[0].max_date;
      if (maxDate) {
        console.log(`🔍 MAX(scan_date) di database: ${maxDate}`);
        newRecords = records.filter(r => r.scan_date > maxDate);
        stats.skipped = records.length - newRecords.length;
        console.log(`📊 Record baru (> ${maxDate}): ${newRecords.length} (skip ${stats.skipped} lama)`);
      } else {
        console.log('📊 Database kosong, insert semua record.');
      }
    } catch (e) {
      console.warn(`⚠️ Gagal ambil MAX(scan_date), lanjut dengan INSERT IGNORE: ${e.message}`);
    }

    if (newRecords.length === 0) {
      console.log('✅ Tidak ada record baru untuk diinsert. Sinkronisasi selesai.');
      return stats;
    }

    // Batch insert (500 per batch)
    const BATCH = 500;
    for (let i = 0; i < newRecords.length; i += BATCH) {
      const batch = newRecords.slice(i, i + BATCH);
      const values = batch.map(r => [
        r.sn,           // sn (Serial Number) - kosong untuk samakan dengan Downloader
        r.scan_date,    // scan_date
        r.pin,          // pin
        r.verifymode,   // verifymode
        r.inoutmode,    // inoutmode
        r.reserved,     // reserved
        r.work_code,    // work_code
        r.att_id,       // att_id
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
      if ((i + BATCH) % 5000 === 0 || i + BATCH >= newRecords.length) {
        console.log(`   inserted: ${stats.inserted}, skipped: ${stats.skipped} (${i + BATCH}/${newRecords.length})`);
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
 * @param {boolean} force - jika true, bypass mtime check dan paksa download penuh
 * @returns {Object} { status, message, stats: { deviceLogs, inserted, skipped, errors }, duration, deviceInfo, skipped_by_mtime }
 */
async function syncFromDevice(force = false) {
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

    // ========== 2. CEK UKURAN + MTIME FILE attend.dat ==========
    console.log('📊 Mengecek ukuran dan mtime file attend.dat...');
    const statOutput = await session.exec('stat -c "%s %Y" /mnt/data/attend.dat 2>/dev/null');
    // Output: "<command echo>\r\n<size> <mtime>\r\n[@buildroot /]# "
    const statLines = statOutput.split('\r\n').map(l => l.trim()).filter(l => l.length > 0);
    let fileSize = 0;
    let fileMtime = 0;
    for (const line of statLines) {
      // Skip command echo (contains "stat") and prompt (contains "#")
      if (line.includes('stat') || line.includes('#')) continue;
      // Match: "<size> <mtime>" (two numbers separated by space)
      const m = line.match(/^(\d+)\s+(\d+)$/);
      if (m) {
        fileSize = parseInt(m[1]);
        fileMtime = parseInt(m[2]);
        break;
      }
      // Fallback: single number (size only, mtime not available)
      const singleMatch = line.match(/^(\d+)$/);
      if (singleMatch) {
        fileSize = parseInt(singleMatch[1]);
        break;
      }
    }

    if (fileSize === 0) {
      throw new Error('File attend.dat tidak ditemukan atau kosong di mesin.');
    }
    console.log(`📊 attend.dat: ${fileSize} bytes, mtime: ${fileMtime} (${fileMtime ? new Date(fileMtime * 1000).toISOString() : 'unknown'})`);

    // ========== 2a. DOWNLOAD & PARSE User.dat UNTUK MAPPING userId -> PIN ==========
    // User.dat berisi mapping User ID internal mesin -> PIN ASCII
    // Tanpa ini, record attend.dat dengan userId=54 (DIKY, PIN 053) akan salah jadi PIN 054
    let userMap = null;
    let userMtime = 0;
    const syncState = loadSyncState();

    // Cek mtime User.dat — jika tidak berubah, gunakan cache dari sync state
    try {
      const userStatOut = await session.exec('stat -c %Y /mnt/data/User.dat 2>/dev/null');
      const userStatLines = userStatOut.split('\r\n').map(l => l.trim()).filter(l => l.length > 0);
      for (const line of userStatLines) {
        if (line.includes('stat') || line.includes('#')) continue;
        const m = line.match(/^(\d+)$/);
        if (m) { userMtime = parseInt(m[1]); break; }
      }
    } catch (e) {
      console.warn(`⚠️ Gagal cek mtime User.dat: ${e.message}`);
    }

    // Gunakan cache jika mtime User.dat tidak berubah
    if (syncState && syncState.user_map && syncState.user_mtime && syncState.user_mtime === userMtime) {
      console.log(`📊 User.dat tidak berubah (mtime ${userMtime}). Gunakan cache userMap (${Object.keys(syncState.user_map).length} entries).`);
      userMap = new Map(Object.entries(syncState.user_map).map(([k, v]) => [parseInt(k), v]));
    } else {
      // Download User.dat dan buat mapping
      console.log('📥 Mendownload User.dat untuk mapping userId -> PIN...');
      try {
        let userFileSize = 0;
        const userSizeOut = await session.exec('stat -c %s /mnt/data/User.dat 2>/dev/null');
        const userSizeLines = userSizeOut.split('\r\n').map(l => l.trim()).filter(l => l.length > 0);
        for (const line of userSizeLines) {
          if (line.includes('stat') || line.includes('#')) continue;
          const m = line.match(/^(\d+)$/);
          if (m) { userFileSize = parseInt(m[1]); break; }
        }
        if (userFileSize > 0) {
          const userData = await session.downloadFile('/mnt/data/User.dat', userFileSize);
          userMap = parseUserDat(userData);
          console.log(`✅ User.dat di-parse: ${userMap.size} user mapping.`);
          // Debug: print mapping untuk PIN 053 & 054
          if (userMap.has(53)) console.log(`   userId 53 -> PIN "${userMap.get(53)}"`);
          if (userMap.has(54)) console.log(`   userId 54 -> PIN "${userMap.get(54)}"`);
          if (userMap.has(55)) console.log(`   userId 55 -> PIN "${userMap.get(55)}"`);
        }
      } catch (e) {
        console.warn(`⚠️ Gagal download/parse User.dat: ${e.message}. Akan fallback ke padStart.`);
      }
    }

    // ========== 2b. CEK MTIME & INCREMENTAL SYNC ==========
    // syncState sudah di-load di atas

    // Skip hanya jika mtime sama DAN bukan force (tidak ada perubahan file)
    if (!force && fileMtime > 0 && syncState && syncState.last_mtime === fileMtime) {
      const duration = Date.now() - startTime;
      const lastSync = syncState.last_sync_at ? new Date(syncState.last_sync_at).toISOString() : 'unknown';
      console.log(`⏭️ Skip download: mtime sama (${fileMtime}). Tidak ada data baru sejak sync terakhir (${lastSync}).`);
      return {
        status: 'success',
        message: `Tidak ada data baru di mesin. File attend.dat tidak berubah sejak sync terakhir (${lastSync}).`,
        stats,
        duration,
        deviceInfo: { userCounts: '-', logCounts: '-', logCapacity: '-' },
        skipped_by_mtime: true,
      };
    }

    // ========== INCREMENTAL SYNC (Prioritas Utama) ==========
    // Sama seperti Downloader: hanya download data baru (delta), bukan full download
    // Aktif untuk force maupun non-force (selama sync state ada dan file bertambah)
    let isIncremental = false;
    let records = [];
    const lastSize = syncState ? syncState.last_file_size || 0 : 0;

    if (lastSize >= HEADER_SIZE && fileSize > lastSize) {
      const deltaBytes = fileSize - lastSize;
      if (deltaBytes % RECORD_SIZE === 0) {
        console.log(`⚡ Incremental Sync: Menarik ${deltaBytes} bytes data baru (offset ${lastSize}..${fileSize})...`);
        try {
          const deltaData = await session.downloadFileRange('/mnt/data/attend.dat', lastSize, deltaBytes);
          records = parsePartialAttendLog(deltaData, config.device.sn, userMap);
          isIncremental = true;
          console.log(`⚡ Incremental Sync berhasil! ${records.length} record baru ditemukan.`);
        } catch (incErr) {
          console.warn(`⚠️ Incremental Sync gagal: ${incErr.message}. Fallback ke Full Sync...`);
          records = [];
          isIncremental = false;
        }
      } else {
        console.warn(`⚠️ Delta bytes (${deltaBytes}) bukan kelipatan ${RECORD_SIZE}. Fallback ke Full Sync...`);
      }
    } else if (fileSize === lastSize && force) {
      // Force sync tapi file tidak bertambah - tetap cek apakah ada data yang terlewat
      console.log('📊 Force sync: file size sama, tidak ada data baru di mesin.');
      const duration = Date.now() - startTime;
      return {
        status: 'success',
        message: 'Tidak ada data baru di mesin (file size tidak berubah).',
        stats,
        duration,
        deviceInfo: { userCounts: '-', logCounts: '-', logCapacity: '-' },
        skipped_by_mtime: true,
      };
    }

    // ========== 3. FULL SYNC (Fallback: Incremental gagal atau first run) ==========
    if (!isIncremental) {
      if (!syncState) {
        console.log('📊 Sync state belum ada (first run). Full Sync...');
      } else if (fileSize <= lastSize) {
        console.log('📊 File size tidak bertambah. Full Sync untuk verifikasi...');
      } else {
        console.log('📊 Incremental tidak memungkinkan. Full Sync...');
      }

      console.log('📥 Mendownload attend.dat penuh via dd + base64...');
      const attendData = await session.downloadFile('/mnt/data/attend.dat', fileSize, (offset, total) => {
        const pct = Math.round((offset / total) * 100);
        console.log(`   progress: ${offset}/${total} (${pct}%)`);
      });

      if (attendData.length !== fileSize) {
        console.warn(`⚠️ Ukuran download (${attendData.length}) != expected (${fileSize}), tetap mencoba parse.`);
      }
      console.log(`✅ Download selesai: ${attendData.length} bytes`);

      console.log('📝 Parsing record absensi...');
      records = parseAttendLog(attendData, config.device.sn, userMap);
      console.log(`📝 Total record valid: ${records.length} (dari ${Math.floor((attendData.length - HEADER_SIZE) / RECORD_SIZE)} total)`);
    }

    stats.deviceLogs = records.length;

    if (records.length === 0) {
      const userMapObj = userMap ? Object.fromEntries(userMap) : undefined;
      saveSyncState(fileMtime, fileSize, userMtime, userMapObj);
      const duration = Date.now() - startTime;
      return {
        status: 'success',
        message: 'Sinkronisasi selesai: tidak ada record baru yang valid.',
        stats,
        duration,
        deviceInfo: { userCounts: '-', logCounts: String(stats.deviceLogs), logCapacity: '-' }
      };
    }

    // ========== 4. INSERT KE DATABASE LOKAL ==========
    console.log(`💾 Menginsert ${records.length} record (${isIncremental ? 'Incremental' : 'Full'}) ke MySQL lokal...`);
    const insertStats = await insertToDatabase(records, config.db);
    stats.inserted = insertStats.inserted;
    stats.skipped = insertStats.skipped;

    // ========== 5. SIMPAN SYNC STATE (mtime + size + userMap) ==========
    if (fileMtime > 0) {
      // Konversi userMap ke plain object untuk JSON serialization
      const userMapObj = userMap ? Object.fromEntries(userMap) : undefined;
      saveSyncState(fileMtime, fileSize, userMtime, userMapObj);
      console.log(`💾 Sync state disimpan: mtime=${fileMtime}, size=${fileSize}, userMap=${userMap ? userMap.size + ' entries' : 'none'}`);
    }

    const duration = Date.now() - startTime;
    console.log(`\n✅ Sinkronisasi Telnet (${isIncremental ? 'Incremental' : 'Full'}) selesai dalam ${(duration / 1000).toFixed(1)} detik.`);
    console.log(`   📊 Device logs: ${stats.deviceLogs}, Inserted: ${stats.inserted}, Skipped: ${stats.skipped}`);

    return {
      status: 'success',
      message: `Sinkronisasi Telnet (${isIncremental ? 'Incremental' : 'Full'}) berhasil! ${stats.inserted} data baru, ${stats.skipped} duplikat dilewati.`,
      stats,
      duration,
      deviceInfo: { userCounts: '-', logCounts: String(stats.deviceLogs), logCapacity: '-' },
      isIncremental,
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

module.exports = { syncFromDevice, checkDeviceStatus, parseAttendLog, parsePartialAttendLog, parseUserDat, TelnetSession };
