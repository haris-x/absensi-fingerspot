import { NextResponse } from 'next/server';
import { dbQuery } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

// GET: Fetch all employees
export async function GET() {
  try {
    const employees = await dbQuery(
      `SELECT p.pegawai_pin as pin, p.pegawai_nama as name, p.pegawai_alias as alias, p.pegawai_status as status, COALESCE(d.pembagian1_nama, 'General') as department
       FROM pegawai p
       LEFT JOIN pembagian1 d ON p.pembagian1_id = d.pembagian1_id
       ORDER BY CAST(p.pegawai_pin AS UNSIGNED) ASC`
    );

    const formattedEmployees = employees.map(emp => ({
      pin: parseInt(emp.pin),
      pin_raw: emp.pin,
      name: emp.name || `Karyawan ${emp.pin}`,
      alias: emp.alias || '',
      department: emp.department,
      status: parseInt(emp.status)
    }));

    return NextResponse.json({
      status: 'success',
      data: formattedEmployees
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}

// POST: Update employee name
export async function POST(request) {
  try {
    const body = await request.json();
    const { pin, name, status } = body;

    if (!pin || !name) {
      return NextResponse.json(
        { status: 'error', message: 'PIN dan nama wajib diisi.' },
        { status: 400 }
      );
    }

    // Convert numeric pin back to raw padded string format
    const pinStr = pin.toString().padStart(3, '0');
    
    let result;
    if (status !== undefined) {
      result = await dbQuery(
        'UPDATE pegawai SET pegawai_nama = ?, pegawai_status = ? WHERE pegawai_pin = ?',
        [name, status, pinStr]
      );
      if (result.affectedRows === 0) {
        result = await dbQuery(
          'UPDATE pegawai SET pegawai_nama = ?, pegawai_status = ? WHERE pegawai_pin = ?',
          [name, status, pin.toString()]
        );
      }
    } else {
      result = await dbQuery(
        'UPDATE pegawai SET pegawai_nama = ? WHERE pegawai_pin = ?',
        [name, pinStr]
      );
      if (result.affectedRows === 0) {
        result = await dbQuery(
          'UPDATE pegawai SET pegawai_nama = ? WHERE pegawai_pin = ?',
          [name, pin.toString()]
        );
      }
    }

    return NextResponse.json({
      status: 'success',
      message: 'Nama karyawan berhasil diperbarui!'
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}
