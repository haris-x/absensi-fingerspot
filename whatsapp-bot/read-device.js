/**
 * read-device.js
 * 
 * Skrip utilitas untuk mengetes koneksi dan membaca data langsung dari mesin
 * sidik jari baru melalui protokol ZKTeco TCP/UDP.
 * 
 * Cara menjalankan:
 * 1. Buka terminal
 * 2. Masuk ke folder: cd c:\xampp\htdocs\Absensi\whatsapp-bot
 * 3. Jalankan: node read-device.js [IP_DEVICE] [PORT]
 *    Contoh: node read-device.js 192.168.0.100 4370
 */

const ZKLib = require('node-zklib');

// Ambil argumen dari command line jika ada
const targetIp = process.argv[2] || '192.168.0.34'; // Ganti dengan IP mesin baru Anda
const targetPort = parseInt(process.argv[3] || '4370'); // Port default biasanya 4370 atau 5005

console.log(`====================================================`);
console.log(`🤖 MEMULAI PENGUJIAN & PEMBACAAN DEVICE BARU`);
console.log(`👉 Target IP   : ${targetIp}`);
console.log(`👉 Target Port : ${targetPort}`);
console.log(`====================================================\n`);

async function run() {
  let zkInstance = null;

  try {
    console.log(`🔌 Mencoba terhubung via TCP ke ${targetIp}:${targetPort}...`);
    zkInstance = new ZKLib(targetIp, targetPort, 10000, 4000);
    
    // 1. Inisialisasi socket dan koneksi
    await zkInstance.createSocket();
    console.log(`✅ Socket berhasil dibuat.`);
    
    // 2. Hubungkan ke mesin
    console.log(`🔄 Menghubungkan ke mesin...`);
    const connResult = await zkInstance.connect();
    console.log(`✅ Berhasil terhubung ke mesin absensi!`);

    // 3. Ambil Informasi Perangkat
    console.log(`\n====================================================`);
    console.log(`📊 INFORMASI PERANGKAT`);
    console.log(`====================================================`);
    try {
      const info = await zkInstance.getInfo();
      console.log(`• Kapasitas User : ${info.userCounts} / ${info.userCapacity}`);
      console.log(`• Kapasitas Log  : ${info.logCounts} / ${info.logCapacity}`);
      console.log(`• Kapasitas Jari : ${info.fpCounts} / ${info.fpCapacity}`);
    } catch (e) {
      console.log(`⚠️ Gagal mengambil info kapasitas secara detail: ${e.message}`);
    }

    // 4. Ambil Daftar User (Karyawan)
    console.log(`\n====================================================`);
    console.log(`👥 MENAMPILKAN BEBERAPA USER TERDAFTAR`);
    console.log(`====================================================`);
    try {
      const users = await zkInstance.getUsers();
      console.log(`Total user terdaftar di mesin: ${users.data.length} orang.`);
      
      // Tampilkan 10 user pertama sebagai contoh
      const sampleUsers = users.data.slice(0, 10);
      sampleUsers.forEach(u => {
        console.log(`- [PIN: ${u.userId}] Nama: ${u.name} | Role: ${u.role === 14 ? 'Admin' : 'User'}`);
      });
      if (users.data.length > 10) console.log(`...dan ${users.data.length - 10} user lainnya.`);
    } catch (e) {
      console.log(`⚠️ Gagal membaca data user dari mesin: ${e.message}`);
    }

    // 5. Ambil Log Absensi
    console.log(`\n====================================================`);
    console.log(`📝 MENAMPILKAN LOG ABSENSI TERAKHIR`);
    console.log(`====================================================`);
    try {
      const logs = await zkInstance.getAttendances();
      console.log(`Total log scan terdaftar di mesin: ${logs.data.length} scan.`);
      
      // Tampilkan 10 log terakhir
      const sampleLogs = logs.data.slice(-10);
      sampleLogs.forEach((l, idx) => {
        console.log(`${idx + 1}. [PIN: ${l.deviceUserId}] Waktu: ${l.recordTime}`);
      });
    } catch (e) {
      console.log(`⚠️ Gagal membaca data log absensi dari mesin: ${e.message}`);
    }

  } catch (err) {
    console.error(`\n❌ KONEKSI GAGAL!`);
    console.error(`Pesan Error: ${err.message}`);
    console.log(`\n💡 Solusi Pemecahan Masalah:`);
    console.log(`1. Pastikan IP komputer Anda berada dalam satu subnet yang sama dengan mesin.`);
    console.log(`   (Misalnya komputer Anda IP-nya 192.168.0.249, maka mesin harus ber-IP 192.168.0.xxx)`);
    console.log(`2. Cek apakah ada 'Comm Key' (Sandi Koneksi) yang aktif pada mesin. Jika ada, kosongkan atau ubah menjadi 0.`);
    console.log(`3. Coba ubah target Port ke 5005 atau 4370.`);
  } finally {
    if (zkInstance) {
      try {
        console.log(`\n🔌 Memutuskan koneksi dengan mesin...`);
        await zkInstance.disconnect();
        console.log(`✅ Selesai.`);
      } catch (err) {}
    }
  }
}

run();
