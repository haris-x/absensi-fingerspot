const mysql = require('mysql2/promise');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables from .env.local
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

// Configuration for Source (Local MySQL)
const sourceConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'fin_pro'
};

// Configuration for Target (TiDB Cloud)
// We will look for TIDB_* env variables first. Fallback to DB_* if not provided, 
// but we expect the user to provide TIDB_* in .env.local for migration.
const targetConfig = {
  host: process.env.TIDB_HOST || '',
  port: parseInt(process.env.TIDB_PORT || '4000'),
  user: process.env.TIDB_USER || '',
  password: process.env.TIDB_PASSWORD || '',
  database: process.env.TIDB_NAME || 'fin_pro',
  ssl: {
    minVersion: 'TLSv1.2',
    rejectUnauthorized: true
  }
};

async function migrate() {
  if (!targetConfig.host || !targetConfig.user || !targetConfig.password) {
    console.error('❌ ERROR: Konfigurasi TiDB Cloud belum lengkap.');
    console.error('Silakan tambahkan variabel berikut di file .env.local Anda:');
    console.error('TIDB_HOST=your-tidb-host.shared.aws.tidbcloud.com');
    console.error('TIDB_PORT=4000');
    console.error('TIDB_USER=your-tidb-username');
    console.error('TIDB_PASSWORD=your-tidb-password');
    console.error('TIDB_NAME=fin_pro');
    process.exit(1);
  }

  let sourceConn, targetConn;

  try {
    console.log('🔌 Menghubungkan ke database MySQL Lokal...');
    sourceConn = await mysql.createConnection(sourceConfig);
    console.log('✅ Terhubung ke database MySQL Lokal.');

    console.log('🔌 Menghubungkan ke TiDB Cloud...');
    targetConn = await mysql.createConnection(targetConfig);
    console.log('✅ Terhubung ke TiDB Cloud.');

    // 1. Migrate pembagian1 table structure and data
    console.log('\n=========================================');
    console.log('📦 Memulai Migrasi Tabel: pembagian1');
    console.log('=========================================');
    await targetConn.execute(`
      CREATE TABLE IF NOT EXISTS pembagian1 (
        pembagian1_id int(11) NOT NULL AUTO_INCREMENT,
        pembagian1_nama varchar(50) DEFAULT NULL,
        PRIMARY KEY (pembagian1_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
    `);
    
    const [pembagianRows] = await sourceConn.execute('SELECT * FROM pembagian1');
    console.log(`Menyalin ${pembagianRows.length} baris data pembagian1...`);
    for (const row of pembagianRows) {
      await targetConn.execute(
        'INSERT INTO pembagian1 (pembagian1_id, pembagian1_nama) VALUES (?, ?) ON DUPLICATE KEY UPDATE pembagian1_nama = ?',
        [row.pembagian1_id, row.pembagian1_nama, row.pembagian1_nama]
      );
    }
    console.log('✅ Tabel pembagian1 selesai dimigrasi.');

    // 2. Migrate pegawai table structure and data
    console.log('\n=========================================');
    console.log('📦 Memulai Migrasi Tabel: pegawai');
    console.log('=========================================');
    await targetConn.execute(`
      CREATE TABLE IF NOT EXISTS pegawai (
        pegawai_id int(11) NOT NULL AUTO_INCREMENT,
        pegawai_pin varchar(20) NOT NULL,
        pegawai_nama varchar(50) DEFAULT NULL,
        pegawai_alias varchar(50) DEFAULT NULL,
        pembagian1_id int(11) DEFAULT NULL,
        pegawai_status int(11) DEFAULT 1,
        PRIMARY KEY (pegawai_id),
        UNIQUE KEY pegawai_pin (pegawai_pin)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
    `);

    // Ensure pegawai_alias exists if table was already created
    try {
      await targetConn.execute('ALTER TABLE pegawai ADD COLUMN pegawai_alias varchar(50) DEFAULT NULL');
      console.log('✅ Kolom pegawai_alias berhasil ditambahkan ke tabel pegawai.');
    } catch (err) {
      if (err.code === 'ER_DUP_FIELDNAME' || err.message.includes('Duplicate column') || err.message.includes('already exists')) {
        console.log('ℹ️ Kolom pegawai_alias sudah ada di tabel pegawai.');
      } else {
        throw err;
      }
    }

    const [pegawaiRows] = await sourceConn.execute('SELECT * FROM pegawai');
    console.log(`Menyalin ${pegawaiRows.length} baris data pegawai...`);
    for (const row of pegawaiRows) {
      await targetConn.execute(
        `INSERT INTO pegawai (pegawai_id, pegawai_pin, pegawai_nama, pegawai_alias, pembagian1_id, pegawai_status) 
         VALUES (?, ?, ?, ?, ?, ?) 
         ON DUPLICATE KEY UPDATE 
          pegawai_nama = ?, pegawai_alias = ?, pembagian1_id = ?, pegawai_status = ?`,
        [
          row.pegawai_id, row.pegawai_pin, row.pegawai_nama, row.pegawai_alias, row.pembagian1_id, row.pegawai_status,
          row.pegawai_nama, row.pegawai_alias, row.pembagian1_id, row.pegawai_status
        ]
      );
    }
    console.log('✅ Tabel pegawai selesai dimigrasi.');

    // 3. Migrate att_log table structure and data (batching)
    console.log('\n=========================================');
    console.log('📦 Memulai Migrasi Tabel: att_log');
    console.log('=========================================');
    await targetConn.execute(`
      CREATE TABLE IF NOT EXISTS att_log (
        att_log_id int(11) NOT NULL AUTO_INCREMENT,
        sn varchar(20) DEFAULT NULL,
        scan_date datetime NOT NULL,
        pin varchar(20) NOT NULL,
        verifymode int(11) DEFAULT 0,
        inoutmode int(11) DEFAULT 0,
        reserved int(11) DEFAULT 0,
        work_code int(11) DEFAULT 0,
        att_id varchar(20) DEFAULT NULL,
        PRIMARY KEY (att_log_id),
        UNIQUE KEY unique_scan (pin, scan_date)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
    `);

    // Get total count from local
    const [countRows] = await sourceConn.execute('SELECT COUNT(*) as count FROM att_log');
    const totalLogs = countRows[0].count;
    console.log(`Total data att_log lokal: ${totalLogs} baris`);

    const batchSize = 1000;
    let offset = 0;
    let totalInserted = 0;
    let totalSkipped = 0;

    while (offset < totalLogs) {
      console.log(`Memproses baris ${offset} sampai ${offset + batchSize}...`);
      const [logsBatch] = await sourceConn.execute(
        'SELECT * FROM att_log ORDER BY scan_date ASC LIMIT ? OFFSET ?',
        [batchSize, offset]
      );

      if (logsBatch.length === 0) break;

      const values = logsBatch.map(log => [
        log.sn, log.scan_date, log.pin, log.verifymode, log.inoutmode, log.reserved, log.work_code, log.att_id
      ]);

      try {
        const [result] = await targetConn.query(
          `INSERT IGNORE INTO att_log (sn, scan_date, pin, verifymode, inoutmode, reserved, work_code, att_id) VALUES ?`,
          [values]
        );
        totalInserted += result.affectedRows;
        totalSkipped += (logsBatch.length - result.affectedRows);
      } catch (err) {
        console.error(`⚠️ Gagal menyisipkan batch pada offset ${offset}: ${err.message}`);
      }

      offset += batchSize;
    }

    // 4. Migrate libur table structure and data
    console.log('\n=========================================');
    console.log('📦 Memulai Migrasi Tabel: libur');
    console.log('=========================================');
    await targetConn.execute(`
      CREATE TABLE IF NOT EXISTS libur (
        libur_tgl date NOT NULL,
        libur_keterangan varchar(255) DEFAULT NULL,
        libur_status tinyint(4) DEFAULT NULL,
        PRIMARY KEY (libur_tgl)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
    `);

    const [liburRows] = await sourceConn.execute('SELECT * FROM libur');
    console.log(`Menyalin ${liburRows.length} baris data libur...`);
    let liburCount = 0;
    for (const row of liburRows) {
      await targetConn.execute(
        `INSERT INTO libur (libur_tgl, libur_keterangan, libur_status) 
         VALUES (?, ?, ?) 
         ON DUPLICATE KEY UPDATE libur_keterangan = ?, libur_status = ?`,
        [
          row.libur_tgl, row.libur_keterangan, row.libur_status,
          row.libur_keterangan, row.libur_status
        ]
      );
      liburCount++;
    }
    console.log('✅ Tabel libur selesai dimigrasi.');

    console.log('\n=========================================');
    console.log('✅ PROSES MIGRASI SELESAI');
    console.log('=========================================');
    console.log(`- pembagian1 : ${pembagianRows.length} data disalin/diperbarui`);
    console.log(`- pegawai    : ${pegawaiRows.length} data disalin/diperbarui`);
    console.log(`- att_log    : ${totalInserted} baris baru dimasukkan, ${totalSkipped} baris duplikat dilewati`);
    console.log(`- libur      : ${liburCount} data disalin/diperbarui`);

  } catch (error) {
    console.error('❌ TERJADI KESALAHAN SAAT MIGRASI:', error);
  } finally {
    if (sourceConn) await sourceConn.end();
    if (targetConn) await targetConn.end();
  }
}

if (require.main === module) {
  migrate();
}

module.exports = { migrate };
