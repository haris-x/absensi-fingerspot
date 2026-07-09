# Fingerspot Link (Absensi Monitoring & WhatsApp Bot Notifier)

Sistem pemantauan kehadiran karyawan *real-time* untuk **CV Alief Jaya**. Sistem ini mengintegrasikan data dari mesin sidik jari fisik **Fingerspot (ZKTeco Protocol)**, database lokal MySQL, dasbor web **Next.js**, dan bot **WhatsApp** untuk mengirimkan notifikasi ketidakhadiran harian secara otomatis serta memverifikasi laporan shift kasir dengan database **iPOS 5**.

---

## 🚀 Fitur Utama

1. **Dasbor Pemantauan Web**: Dasbor interaktif berbasis Next.js untuk memantau status kehadiran hari ini (jumlah scan, keterlambatan, ketidakhadiran) dan tren grafik mingguan.
2. **Sinkronisasi Otomatis Mesin Absensi**: Menarik data log sidik jari dari perangkat fisik secara terjadwal (07:30 WIB) atau manual via dashboard/WhatsApp menggunakan otomasi Windows GUI PowerShell.
3. **Laporan Absensi Grup WhatsApp**: Mengirimkan laporan karyawan yang tidak hadir ke grup WhatsApp target secara otomatis setiap pagi (07:35 WIB).
4. **Verifikasi Laporan Shift Kasir (iPOS 5)**: Memantau pesan masuk di WhatsApp. Jika mendeteksi pola `"LAPORAN SHIFT"`, bot akan mem-parsing data dan mencocokkannya secara otomatis dengan database iPOS 5 via API reconcile untuk mencari selisih nominal.
5. **Perintah `!absen`**: Memungkinkan penarikan data instan dan pelaporan kehadiran langsung ke ruang obrolan WhatsApp.

---

## 🛠️ Prasyarat (Requirements)

Sebelum melakukan deployment, pastikan server/PC Windows Anda telah terinstal:
* **Node.js** (v18 atau lebih baru)
* **XAMPP / MySQL Server** (Database `fin_pro`)
* **PM2** (Process Manager untuk menjalankan aplikasi di latar belakang)
* **Fingerspot Personnel** (Aplikasi desktop penarik data absensi bawaan)
* **Git** (Untuk menarik dan memperbarui kode dari repositori)

---

## 📦 Langkah Instalasi

1. **Clone Repositori**:
   ```bash
   git clone https://github.com/haris-x/absensi-fingerspot.git
   cd absensi-fingerspot
   ```

2. **Instal Dependensi**:
   * Instal dependensi untuk dasbor web (Next.js):
     ```bash
     npm install
     ```
   * Instal dependensi untuk WhatsApp Bot:
     ```bash
     cd whatsapp-bot
     npm install
     cd ..
     ```

3. **Konfigurasi Environment**:
   Salin file `.env.example` menjadi `.env.local` pada folder root proyek:
   ```bash
   copy .env.example .env.local
   ```
   Buka `.env.local` dan sesuaikan parameter berikut:
   * **Database**: Host, Port (bawaan Fingerspot biasanya `3309`), User, Password, dan Nama DB (`fin_pro`).
   * **WhatsApp Bot**: Target JID Grup (`WA_GROUP_JID`), Jam Laporan (`WA_SEND_TIME`), dan Port API (`WA_BOT_PORT` bawaan `3002`).
   * **iPOS 5 API**: URL Endpoint rekonsiliasi kasir (`IPOS_API_URL`) dan API Key (`IPOS_API_KEY`).
   * **Mesin Fingerprint**: IP perangkat fisik (`DEVICE_IP`) dan Port koneksi (`DEVICE_PORT` bawaan `4370` atau `5005`).

---

## ⚙️ Cara Menjalankan Aplikasi (Lokal/Development)

* **Menjalankan Dasbor Web (Next.js)**:
  ```bash
  npm run dev
  ```
  Aplikasi akan berjalan di `http://localhost:3001`.

* **Menjalankan WhatsApp Bot**:
  ```bash
  cd whatsapp-bot
  npm start
  ```

---

## 🖥️ Cara Deploy di Server Windows (Production dengan PM2)

Untuk memastikan aplikasi dan bot WhatsApp selalu berjalan 24/7 di latar belakang meskipun terminal ditutup, gunakan **PM2**:

1. **Instal PM2 secara global**:
   ```bash
   npm install -g pm2
   ```

2. **Jalankan Aplikasi menggunakan berkas `ecosystem.config.js`**:
   Di root direktori proyek, jalankan perintah berikut:
   ```bash
   pm2 start ecosystem.config.js
   ```
   Perintah ini akan otomatis menjalankan 2 proses:
   * `absensi-app` (Dasbor Next.js di Port 3001)
   * `whatsapp-bot` (Layanan API & WhatsApp Web di Port 3002)

3. **Menghubungkan WhatsApp Bot**:
   * Saat pertama kali dijalankan via PM2, buka dasbor web di `http://localhost:3001/settings`.
   * Pada panel kanan, Anda akan melihat **QR Code**. Pindai (Scan) QR Code tersebut menggunakan aplikasi WhatsApp di HP Anda melalui menu **Perangkat Tertaut (Linked Devices)**.
   * Setelah terhubung, status akan berubah menjadi **Terhubung (Connected)** dan konfigurasi grup target laporan dapat dipilih langsung dari dasbor web.

4. **Kelola Layanan PM2**:
   * Melihat daftar proses berjalan: `pm2 status`
   * Melihat log aktivitas secara real-time: `pm2 logs`
   * Me-restart bot: `pm2 restart whatsapp-bot`
   * Me-restart dasbor: `pm2 restart absensi-app`

5. **Konfigurasi Auto-Run saat Windows Startup (Opsional)**:
   Agar PM2 berjalan otomatis ketika komputer dinyalakan, pasang PM2 Windows Service:
   ```bash
   npm install -g pm2-windows-service
   pm2-service-install
   # Ikuti panduan CLI untuk memasangnya sebagai Windows Service
   pm2 save
   ```

---

## 📂 Struktur Database Pendukung
Pastikan database MySQL lokal Anda memiliki tabel-tabel bawaan berikut yang dikelola oleh aplikasi *Fingerspot Personnel*:
* `pegawai` (Menyimpan PIN, Nama, Status Karyawan)
* `pembagian1` (Menyimpan data departemen / divisi)
* `att_log` (Menyimpan log riwayat scan mentah)

---

## 📝 Lisensi
Proyek ini dikembangkan khusus untuk sistem internal **CV Alief Jaya**.
