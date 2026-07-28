/**
 * sync-cron.js
 *
 * Script cron di VPS Oracle untuk memicu sinkronisasi fingerprint.
 * Dipanggil oleh cron job (07:30 WIB = 00:30 UTC), skip hari Jumat.
 *
 * Alur (async pattern):
 *  1. VPS POST wa.harisx.my.id/api/sync → start sync di background
 *  2. VPS poll GET wa.harisx.my.id/api/sync setiap 10s sampai sync selesai
 *  3. Log hasil
 *
 * Setup cron di VPS:
 *   # /etc/cron.d/absensi-sync
 *   30 0 * * * oracle /usr/bin/node /path/to/vps/sync-cron.js >> /var/log/absensi-sync.log 2>&1
 */

const SYNC_URL = process.env.SYNC_URL || 'https://wa.harisx.my.id/api/sync';
const API_KEY = process.env.WA_API_KEY || 'aliefjaya_wa101';
const TIMEOUT_MS = parseInt(process.env.SYNC_TIMEOUT || '300000'); // 5 minutes total
const POLL_INTERVAL = 10000; // 10 seconds between polls

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function postSync() {
  const res = await fetch(SYNC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY,
    },
    signal: AbortSignal.timeout(30000),
  });
  return res.json();
}

async function getSyncStatus() {
  const res = await fetch(SYNC_URL, {
    method: 'GET',
    headers: {
      'x-api-key': API_KEY,
    },
    signal: AbortSignal.timeout(15000),
  });
  return res.json();
}

async function main() {
  const now = new Date();
  const startTime = Date.now();

  // Cek hari (WIB = UTC+7). 07:30 WIB = 00:30 UTC
  // Hitung hari di WIB
  const wibDate = new Date(now.getTime() + 7 * 3600 * 1000);
  const wibDay = wibDate.getUTCDay(); // 0=Sun, 5=Fri
  if (wibDay === 5) {
    console.log(`[${now.toISOString()}] Skip: Hari Jum'at (libur perusahaan)`);
    process.exit(0);
  }

  console.log(`[${now.toISOString()}] Memulai sinkronisasi fingerprint via ${SYNC_URL}...`);

  // Step 1: POST to start sync
  try {
    const startResult = await postSync();
    if (startResult.status === 'error') {
      console.error(`[${new Date().toISOString()}] ❌ Gagal memulai sync: ${startResult.message}`);
      process.exit(1);
    }
    console.log(`[${new Date().toISOString()}] 📤 Sync dimulai: ${startResult.message}`);

    // If sync already running, just report and exit
    if (startResult.running && !startResult.lastResult) {
      console.log(`[${new Date().toISOString()}] ℹ️ Sync sedang berjalan dari sebelumnya. Menunggu...`);
    }
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ❌ Error POST sync: ${err.message}`);
    process.exit(1);
  }

  // Step 2: Poll GET until sync completes or timeout
  let lastStatus = null;
  while (Date.now() - startTime < TIMEOUT_MS) {
    await sleep(POLL_INTERVAL);

    try {
      const status = await getSyncStatus();
      lastStatus = status;

      if (!status.running) {
        // Sync finished
        const result = status.lastResult;
        if (result && result.status === 'success') {
          console.log(`[${new Date().toISOString()}] ✅ Sinkronisasi berhasil!`);
          console.log(`  Message: ${result.message}`);
          if (result.stats) {
            console.log(`  Device logs: ${result.stats.deviceLogs}`);
            console.log(`  Inserted: ${result.stats.inserted}`);
            console.log(`  Skipped: ${result.stats.skipped}`);
          }
          if (result.method) {
            console.log(`  Method: ${result.method}`);
          }
          console.log(`  Duration: ${((result.duration || 0) / 1000).toFixed(1)}s`);
          process.exit(0);
        } else if (result && result.status === 'error') {
          console.error(`[${new Date().toISOString()}] ❌ Sinkronisasi gagal: ${result.message}`);
          process.exit(1);
        } else {
          console.log(`[${new Date().toISOString()}] ℹ️ Sync selesai, tidak ada result.`);
          process.exit(0);
        }
      } else {
        console.log(`[${new Date().toISOString()}] ⏳ Sync masih berjalan... (${Math.round((Date.now() - startTime) / 1000)}s)`);
      }
    } catch (err) {
      console.warn(`[${new Date().toISOString()}] ⚠️ Gagal poll status: ${err.message}`);
    }
  }

  // Timeout
  console.error(`[${new Date().toISOString()}] ⏰ Timeout menunggu sync selesai (${TIMEOUT_MS / 1000}s)`);
  if (lastStatus) {
    console.error(`  Last status: running=${lastStatus.running}, lastResult=${JSON.stringify(lastStatus.lastResult)}`);
  }
  process.exit(1);
}

main();
