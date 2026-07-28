/**
 * sync-fallback.js
 *
 * Wrapper sinkronisasi fingerprint dengan auto-fallback:
 *  1. Coba metode Telnet (fingerprint-sync-telnet.js) — langsung ke Oracle DB
 *  2. Jika Telnet gagal, fallback ke metode PowerShell (fingerprint-sync.js)
 *     yang menarik data ke MySQL lokal lalu upload ke Oracle via migrate-to-tidb.js
 *
 * File restore_and_click.ps1 tetap dipertahankan sebagai fallback darurat.
 */

const telnetSync = require('./fingerprint-sync-telnet');
const psSync = require('./fingerprint-sync');
const { migrate: uploadToTiDB } = require('./migrate-to-tidb');

/**
 * Sinkronisasi data attendance dengan auto-fallback
 *
 * @returns {Object} { status, message, stats, duration, deviceInfo, method }
 */
async function syncFromDevice() {
  const startTime = Date.now();
  let lastError = null;

  // ========== 1. COBA METODE TELNET ==========
  console.log('\n🔄 [Sync] Mencoba metode Telnet (langsung ke Oracle DB)...');
  try {
    const result = await telnetSync.syncFromDevice();

    if (result.status === 'success') {
      console.log('✅ [Sync] Metode Telnet berhasil!');
      return {
        ...result,
        method: 'telnet',
        duration: Date.now() - startTime,
      };
    }

    // Telnet returned error (not exception)
    lastError = result.message;
    console.warn(`⚠️ [Sync] Metode Telnet gagal: ${result.message}`);
  } catch (err) {
    lastError = err.message;
    console.warn(`⚠️ [Sync] Metode Telnet error: ${err.message}`);
  }

  // ========== 2. FALLBACK KE METODE POWERSHELL ==========
  console.log('\n🔄 [Sync] Fallback ke metode PowerShell (Fingerspot Personnel)...');
  try {
    const result = await psSync.syncFromDevice();

    if (result.status === 'success') {
      console.log('✅ [Sync] Metode PowerShell berhasil!');

      // PowerShell hanya insert ke MySQL lokal, perlu upload ke Oracle DB
      console.log('🚀 [Sync] Mengupload data dari MySQL lokal ke Oracle DB...');
      try {
        await uploadToTiDB();
        console.log('✅ [Sync] Upload ke Oracle DB selesai.');
      } catch (uploadErr) {
        console.error(`⚠️ [Sync] Gagal upload ke Oracle DB: ${uploadErr.message}`);
        console.warn('⚠️ [Sync] Data tersimpan di MySQL lokal, upload ke Oracle akan dicoba di sync berikutnya.');
      }

      return {
        ...result,
        method: 'powershell',
        duration: Date.now() - startTime,
      };
    }

    lastError = result.message;
    console.warn(`⚠️ [Sync] Metode PowerShell gagal: ${result.message}`);
  } catch (err) {
    lastError = err.message;
    console.warn(`⚠️ [Sync] Metode PowerShell error: ${err.message}`);
  }

  // ========== 3. KEDUA METODE GAGAL ==========
  console.error('❌ [Sync] Kedua metode sinkronisasi gagal!');
  return {
    status: 'error',
    message: `Sinkronisasi gagal. Telnet: ${lastError}`,
    stats: { deviceLogs: 0, inserted: 0, skipped: 0, errors: 1 },
    duration: Date.now() - startTime,
    deviceInfo: null,
    method: 'none',
  };
}

/**
 * Cek status koneksi ke mesin fingerprint
 * Prioritas: Telnet (metode utama), fallback PowerShell/ZKLib
 *
 * @returns {Object} { reachable, ip, port, info, error }
 */
async function checkDeviceStatus() {
  // Coba Telnet dulu
  try {
    const result = await telnetSync.checkDeviceStatus();
    if (result.reachable) {
      return { ...result, method: 'telnet' };
    }
  } catch (e) {
    // Telnet gagal, coba PowerShell/ZKLib
  }

  // Fallback ke ZKLib (dari fingerprint-sync.js)
  try {
    const result = await psSync.checkDeviceStatus();
    return { ...result, method: 'zklib' };
  } catch (e) {
    return {
      reachable: false,
      ip: process.env.DEVICE_IP || '192.168.0.34',
      port: parseInt(process.env.DEVICE_PORT || '23'),
      info: null,
      error: e.message,
      method: 'none',
    };
  }
}

module.exports = { syncFromDevice, checkDeviceStatus };
