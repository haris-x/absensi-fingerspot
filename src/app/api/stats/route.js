import { NextResponse } from 'next/server';
import { dbQuery } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Get current date in Asia/Jakarta timezone (YYYY-MM-DD)
    const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

    // 1. Logs Today
    const logsTodayRows = await dbQuery(
      'SELECT COUNT(*) as count FROM att_log WHERE DATE(scan_date) = ?',
      [todayStr]
    );
    const logs_today = logsTodayRows[0]?.count || 0;

    // 2. Total Employees
    const totalEmployeesRows = await dbQuery('SELECT COUNT(*) as count FROM pegawai');
    const total_employees = totalEmployeesRows[0]?.count || 0;

    // 3. Present Today (Unique PINs who scanned today)
    const presentTodayRows = await dbQuery(
      'SELECT COUNT(DISTINCT pin) as count FROM att_log WHERE DATE(scan_date) = ?',
      [todayStr]
    );
    const present_today = presentTodayRows[0]?.count || 0;

    // Ensure settings table exists and default exists
    await dbQuery(`
      CREATE TABLE IF NOT EXISTS web_settings (
        pembagian1_id INT NULL UNIQUE,
        jam_masuk TIME NOT NULL DEFAULT '08:00:00',
        jam_terlambat TIME NOT NULL DEFAULT '08:00:00',
        jam_pulang TIME NOT NULL DEFAULT '16:00:00',
        FOREIGN KEY (pembagian1_id) REFERENCES pembagian1(pembagian1_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
    `);
    const defaultRow = await dbQuery('SELECT * FROM web_settings WHERE pembagian1_id IS NULL');
    if (defaultRow.length === 0) {
      await dbQuery(`
        INSERT INTO web_settings (pembagian1_id, jam_masuk, jam_terlambat, jam_pulang) 
        VALUES (NULL, '08:00:00', '08:00:00', '16:00:00')
      `);
    }

    // 4. Late Today (First scan is after the division's late threshold or default late threshold)
    const lateTodayRows = await dbQuery(
      `SELECT COUNT(*) as count FROM (
        SELECT al.pin, MIN(TIME(al.scan_date)) as first_scan, p.pembagian1_id
        FROM att_log al
        JOIN pegawai p ON al.pin = p.pegawai_pin
        WHERE DATE(al.scan_date) = ?
        GROUP BY al.pin, p.pembagian1_id
      ) AS first_scans
      LEFT JOIN web_settings s ON first_scans.pembagian1_id = s.pembagian1_id
      LEFT JOIN web_settings s_def ON s_def.pembagian1_id IS NULL
      WHERE first_scans.first_scan > COALESCE(s.jam_terlambat, s_def.jam_terlambat, '08:00:00')`,
      [todayStr]
    );
    const late_today = lateTodayRows[0]?.count || 0;

    // 5. Attendance Trend (Last 7 days)
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 6);
    const startDateStr = startDate.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });

    const trendRows = await dbQuery(
      `SELECT DATE_FORMAT(scan_date, '%Y-%m-%d') as date, COUNT(*) as count 
       FROM att_log 
       WHERE DATE(scan_date) >= ? 
       GROUP BY DATE_FORMAT(scan_date, '%Y-%m-%d')
       ORDER BY date ASC`,
      [startDateStr]
    );

    // Map query results to calendar days
    const trendMap = {};
    trendRows.forEach(row => {
      trendMap[row.date] = row.count;
    });

    const chart_data = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
      const label = d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
      
      chart_data.push({
        label,
        date: dateStr,
        count: trendMap[dateStr] || 0
      });
    }

    // 6. Recent Logs (Last 5 scans)
    const recentLogs = await dbQuery(
      `SELECT al.pin, al.scan_date as date_time, al.verifymode as verified, al.inoutmode as status, p.pegawai_nama as employee_name
       FROM att_log al
       LEFT JOIN pegawai p ON al.pin = p.pegawai_pin
       ORDER BY al.scan_date DESC
       LIMIT 5`
    );

    // Map verified code to names
    const verificationTypes = {
      0: 'Password',
      1: 'Fingerprint',
      2: 'Card',
      3: 'Face',
      4: 'Password'
    };

    const formattedRecentLogs = recentLogs.map(log => ({
      pin: parseInt(log.pin),
      date_time: log.date_time,
      verified: log.verified,
      verified_label: verificationTypes[log.verified] || 'Fingerprint',
      status: log.status, // 0 = In, 1 = Out
      employee_name: log.employee_name || `Karyawan ${log.pin}`
    }));

    // 7. Absent Employees Today (Not checked-in/out today)
    const localDay = new Date().toLocaleDateString('en-US', { weekday: 'short', timeZone: 'Asia/Jakarta' });
    let absentQuery = `
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
      absentQuery += ` AND p.pegawai_pin NOT IN ('050', '50')`;
    }
    absentQuery += ` ORDER BY CAST(p.pegawai_pin AS UNSIGNED) ASC`;

    const absentEmployees = await dbQuery(absentQuery, [todayStr]);

    const formattedAbsentEmployees = absentEmployees.map(emp => ({
      pin: parseInt(emp.pin),
      pin_raw: emp.pin,
      name: emp.name || `Karyawan ${emp.pin}`,
      department: emp.department
    }));

    return NextResponse.json({
      status: 'success',
      data: {
        logs_today,
        total_employees,
        present_today,
        late_today,
        chart_data,
        recent_logs: formattedRecentLogs,
        absent_employees: formattedAbsentEmployees
      }
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}
