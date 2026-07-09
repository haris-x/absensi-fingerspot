import { NextResponse } from 'next/server';
import { dbQuery } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const search = searchParams.get('search');
    const limit = parseInt(searchParams.get('limit') || '2000');

    let sql = `
      SELECT al.pin, al.scan_date as date_time, al.verifymode as verified, al.inoutmode as status, 
             p.pegawai_nama as employee_name, COALESCE(d.pembagian1_nama, 'General') as department
      FROM att_log al
      LEFT JOIN pegawai p ON al.pin = p.pegawai_pin
      LEFT JOIN pembagian1 d ON p.pembagian1_id = d.pembagian1_id
      WHERE 1=1
    `;
    const params = [];

    if (startDate) {
      sql += ' AND DATE(al.scan_date) >= ?';
      params.push(startDate);
    }

    if (endDate) {
      sql += ' AND DATE(al.scan_date) <= ?';
      params.push(endDate);
    }

    if (search) {
      sql += ' AND (p.pegawai_nama LIKE ? OR al.pin = ?)';
      params.push(`%${search}%`, search);
    }

    sql += ' ORDER BY al.scan_date DESC LIMIT ?';
    params.push(limit);

    const logs = await dbQuery(sql, params);

    const verificationTypes = {
      0: 'Password',
      1: 'Fingerprint',
      2: 'Card',
      3: 'Face',
      4: 'Password',
      15: 'Manual'
    };

    const formattedLogs = logs.map(log => ({
      pin: parseInt(log.pin),
      pin_raw: log.pin,
      date_time: log.date_time,
      verified: log.verified,
      verified_label: verificationTypes[log.verified] || 'Fingerprint',
      status: log.status, // 0 = In, 1 = Out
      employee_name: log.employee_name || `Karyawan ${log.pin}`,
      department: log.department
    }));

    return NextResponse.json({
      status: 'success',
      data: formattedLogs
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}

// POST: Add a manual scan log
export async function POST(request) {
  try {
    const body = await request.json();
    const { pin, date, time, status } = body; // status: 0 for In, 1 for Out

    if (!pin || !date || !time) {
      return NextResponse.json(
        { status: 'error', message: 'PIN, tanggal, dan jam wajib diisi.' },
        { status: 400 }
      );
    }

    const pinStr = pin.toString().padStart(3, '0');
    const scanDateTime = `${date} ${time}`;

    // Get the machine serial number from existing logs to maintain database consistency
    const mesin = await dbQuery("SELECT sn FROM att_log WHERE sn IS NOT NULL AND sn != '' LIMIT 1");
    const sn = (mesin && mesin.length > 0) ? mesin[0].sn : 'MANUAL';

    // Insert manual log (verifymode = 15)
    await dbQuery(
      `INSERT INTO att_log (sn, scan_date, pin, verifymode, inoutmode, reserved, work_code, att_id)
       VALUES (?, ?, ?, 15, ?, 0, 0, '0')`,
      [sn, scanDateTime, pinStr, parseInt(status || 0)]
    );

    return NextResponse.json({
      status: 'success',
      message: 'Log scan manual berhasil ditambahkan!'
    });
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return NextResponse.json(
        { status: 'error', message: 'Data scan untuk karyawan, tanggal, dan jam tersebut sudah ada (duplikat).' },
        { status: 409 }
      );
    }
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}

// DELETE: Delete a manual scan log
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const pin = searchParams.get('pin');
    const dateTime = searchParams.get('dateTime');

    if (!pin || !dateTime) {
      return NextResponse.json(
        { status: 'error', message: 'Parameter PIN dan tanggal-waktu (dateTime) wajib disertakan.' },
        { status: 400 }
      );
    }

    const pinStr = pin.toString().padStart(3, '0');

    // Only allow deleting manual logs (verifymode = 15) to preserve the integrity of machine-read logs
    const result = await dbQuery(
      "DELETE FROM att_log WHERE pin = ? AND scan_date = ? AND verifymode = 15",
      [pinStr, dateTime]
    );

    if (result.affectedRows === 0) {
      return NextResponse.json(
        { status: 'error', message: 'Log manual tidak ditemukan atau Anda mencoba menghapus data asli mesin.' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      status: 'success',
      message: 'Log scan manual berhasil dihapus!'
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}
