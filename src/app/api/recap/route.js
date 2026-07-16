import { NextResponse } from 'next/server';
import { dbQuery } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');

    if (!startDateStr || !endDateStr) {
      return NextResponse.json(
        { status: 'error', message: 'Tanggal mulai (startDate) dan tanggal selesai (endDate) wajib diisi.' },
        { status: 400 }
      );
    }

    // 1. Fetch all active employees (include pembagian1_id)
    const employees = await dbQuery(
      `SELECT p.pegawai_pin as pin, p.pegawai_nama as name, p.pembagian1_id, COALESCE(d.pembagian1_nama, 'General') as department
       FROM pegawai p
       LEFT JOIN pembagian1 d ON p.pembagian1_id = d.pembagian1_id
       WHERE p.pegawai_status = 1
       ORDER BY CAST(p.pegawai_pin AS UNSIGNED) ASC`
    );

    // Fetch division work hour settings
    await dbQuery(`
      CREATE TABLE IF NOT EXISTS web_settings (
        pembagian1_id INT NULL UNIQUE,
        jam_masuk TIME NOT NULL DEFAULT '08:00:00',
        jam_terlambat TIME NOT NULL DEFAULT '08:00:00',
        jam_pulang TIME NOT NULL DEFAULT '16:00:00',
        FOREIGN KEY (pembagian1_id) REFERENCES pembagian1(pembagian1_id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
    `);

    const settingsRows = await dbQuery('SELECT * FROM web_settings');
    const defaultSettings = settingsRows.find(s => s.pembagian1_id === null) || {
      jam_masuk: '08:00:00',
      jam_terlambat: '08:00:00',
      jam_pulang: '16:00:00'
    };

    const divisionSettingsMap = {};
    settingsRows.forEach(s => {
      if (s.pembagian1_id !== null) {
        divisionSettingsMap[s.pembagian1_id] = {
          jam_masuk: s.jam_masuk,
          jam_terlambat: s.jam_terlambat,
          jam_pulang: s.jam_pulang
        };
      }
    });

    // 2. Fetch all scan logs aggregated by day (use DATE_FORMAT to return date as a string)
    const logs = await dbQuery(
      `SELECT pin, DATE_FORMAT(scan_date, '%Y-%m-%d') as scan_day, MIN(scan_date) as first_scan, MAX(scan_date) as last_scan, COUNT(*) as scan_count
       FROM att_log
       WHERE DATE(scan_date) >= ? AND DATE(scan_date) <= ?
       GROUP BY pin, DATE_FORMAT(scan_date, '%Y-%m-%d')`,
      [startDateStr, endDateStr]
    );

    // Fetch registered national holidays in this range from the database
    const holidayRows = await dbQuery(
      `SELECT DATE_FORMAT(libur_tgl, '%Y-%m-%d') as libur_day 
       FROM libur 
       WHERE libur_tgl >= ? AND libur_tgl <= ?`,
      [startDateStr, endDateStr]
    );
    const holidaysSet = new Set(holidayRows.map(row => row.libur_day));

    // Fetch registered leaves in this range from the custom table (ensure table exists first)
    await dbQuery(`
      CREATE TABLE IF NOT EXISTS web_izin (
        pin VARCHAR(32) NOT NULL,
        tanggal DATE NOT NULL,
        tipe VARCHAR(50) NOT NULL,
        keterangan VARCHAR(255),
        PRIMARY KEY (pin, tanggal)
      )
    `);

    const leaveRows = await dbQuery(
      `SELECT pin, DATE_FORMAT(tanggal, '%Y-%m-%d') as leave_day, tipe as leave_type, keterangan as leave_description 
       FROM web_izin 
       WHERE tanggal >= ? AND tanggal <= ?`,
      [startDateStr, endDateStr]
    );

    // Group leaves by employee PIN and day for O(1) lookups
    const leavesByPinAndDay = {};
    leaveRows.forEach(row => {
      const pin = row.pin;
      if (!leavesByPinAndDay[pin]) {
        leavesByPinAndDay[pin] = {};
      }
      leavesByPinAndDay[pin][row.leave_day] = {
        type: row.leave_type,
        description: row.leave_description
      };
    });

    // Group logs by employee PIN for O(1) lookups
    const logsByPin = {};
    logs.forEach(log => {
      const pin = log.pin;
      if (!logsByPin[pin]) {
        logsByPin[pin] = {};
      }
      logsByPin[pin][log.scan_day] = {
        first_scan: log.first_scan,
        last_scan: log.last_scan,
        scan_count: parseInt(log.scan_count)
      };
    });

    // 3. Generate array of dates in the range to calculate absent days
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    const dateList = [];
    
    let current = new Date(start);
    while (current <= end) {
      const year = current.getFullYear();
      const month = String(current.getMonth() + 1).padStart(2, '0');
      const day = String(current.getDate()).padStart(2, '0');
      const dateStr = `${year}-${month}-${day}`;
      
      dateList.push({
        dateStr,
        dayOfWeek: current.getDay() // 0 = Sunday, 1 = Monday, etc.
      });
      
      current.setDate(current.getDate() + 1);
    }

    // 4. Calculate recap for each employee
    const recapData = employees.map(emp => {
      const pin = emp.pin;
      const empLogs = logsByPin[pin] || {};
      const empLeaves = leavesByPinAndDay[pin] || {};
      const isAdmin = emp.department.toLowerCase() === 'admin';
      const isSpecialPin006 = (pin === '006' || parseInt(pin) === 6);
      const isSpecialPin050 = (pin === '050' || parseInt(pin) === 50);

      // Get division settings or fallback to default
      const divSettings = divisionSettingsMap[emp.pembagian1_id] || defaultSettings;
      const schedInStr = divSettings.jam_masuk;      // e.g. '08:00:00'
      const schedOutStr = divSettings.jam_pulang;    // e.g. '16:00:00'

      // Parse schedule times to hours and minutes
      const [schedInH, schedInM] = schedInStr.split(':').map(Number);
      const [schedOutH, schedOutM] = schedOutStr.split(':').map(Number);
      const schedOutTimeInMinutes = schedOutH * 60 + schedOutM;

      let hadirCount = 0;
      let absenCount = 0;
      let setengahHariCount = 0;
      let totalLemburHours = 0;
      const details = [];

      dateList.forEach(day => {
        const log = empLogs[day.dateStr];
        const leave = empLeaves[day.dateStr];
        const isSunday = day.dayOfWeek === 0;
        const isFriday = day.dayOfWeek === 5;
        const isNationalHoliday = holidaysSet.has(day.dateStr);
        const isHoliday = isFriday || isNationalHoliday || (isSunday && isSpecialPin050); // Sunday is a normal work day, Friday is the weekly day off, Sunday is off for PIN 050

        let statusText = 'Hadir';
        let weight = 1.0;
        let lemburHours = 0;
        let checkIn = null;
        let checkOut = null;

        if (log) {
          // Get first and last scan times
          const firstScanDate = new Date(log.first_scan);
          const lastScanDate = new Date(log.last_scan);

          if (log.scan_count > 1) {
            checkIn = firstScanDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            checkOut = lastScanDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

            const durationMs = lastScanDate - firstScanDate;
            const durationHours = durationMs / (1000 * 60 * 60);

            if (durationHours < 2.0) {
              // Double scan in the morning or afternoon -> treat as single scan (forget one checkout/checkin)
              weight = 1.0;
              statusText = 'Hadir';
              lemburHours = 0;

              const scanHour = firstScanDate.getHours();
              if (scanHour < 12) {
                // Double scan in the morning -> assume checked out on time
                checkOut = schedOutStr;
              } else {
                // Double scan in the afternoon -> assume checked in on time
                checkIn = schedInStr;
              }
            } else {
              // Regular scans
              if (durationHours < 6.0 && !isSpecialPin050) {
                weight = 0.5;
                statusText = 'Hadir (Setengah Hari)';
              } else {
                weight = 1.0;
                statusText = 'Hadir';
              }

              // Get local hours and minutes
              const checkoutHours = lastScanDate.getHours();
              const checkoutMinutes = lastScanDate.getMinutes();
              const checkoutTimeInMinutes = checkoutHours * 60 + checkoutMinutes;

              // If check-out is after scheduled time, calculate overtime
              if (checkoutTimeInMinutes > schedOutTimeInMinutes) {
                lemburHours = (checkoutTimeInMinutes - schedOutTimeInMinutes) / 60;
                lemburHours = Math.round(lemburHours * 100) / 100; // Round to 2 decimal places
                totalLemburHours += lemburHours;
              }
            }
          } else {
            // Only 1 scan (forgot check-out or check-in) -> Count as full present day, checkout/checkin at scheduled time
            weight = 1.0;
            statusText = 'Hadir';
            lemburHours = 0;

            const scanHour = firstScanDate.getHours();
            if (scanHour < 12) {
              // Morning scan (check-in) -> assume checked out on time
              checkIn = firstScanDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              checkOut = schedOutStr;
            } else {
              // Afternoon scan (check-out) -> assume checked in on time
              checkIn = schedInStr;
              checkOut = firstScanDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            }
          }
        }

        // Apply manual leave override if registered (takes priority!)
        if (leave) {
          if (leave.type === 'Izin Setengah Hari') {
            weight = 0.5;
            statusText = 'Izin (Setengah Hari)';
            lemburHours = 0; // Overtime is disabled for half-day leave
          } else {
            // Izin Penuh, Sakit, Cuti
            weight = 0.0;
            statusText = leave.type;
            lemburHours = 0;
            if (!log) {
              checkIn = null;
              checkOut = null;
            }
          }
        }

        // Add to details and increment counters
        if (log || leave) {
          hadirCount += weight;
          if (weight === 0.5) {
            setengahHariCount++;
          }

          details.push({
            date: day.dateStr,
            status: statusText,
            check_in: checkIn,
            check_out: checkOut,
            lembur: lemburHours
          });
        } else {
          // No scan, no leave entry
          // If it's NOT a Sunday, Friday or National Holiday, it's counted as Absent (Absen)
          if (!isHoliday) {
            absenCount++;
            details.push({
              date: day.dateStr,
              status: 'Absen',
              check_in: null,
              check_out: null,
              lembur: 0
            });
          } else {
            // Sunday, Friday or National Holiday with no scan is just a rest day (not absent)
            details.push({
              date: day.dateStr,
              status: 'Libur',
              check_in: null,
              check_out: null,
              lembur: 0
            });
          }
        }
      });

      return {
        pin: parseInt(pin),
        pin_raw: pin,
        name: emp.name,
        department: emp.department,
        hadir: hadirCount,
        absen: absenCount,
        setengah_hari: setengahHariCount,
        lembur: Math.round(totalLemburHours * 100) / 100,
        details // detailed logs day-by-day
      };
    });

    return NextResponse.json({
      status: 'success',
      data: recapData
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}
