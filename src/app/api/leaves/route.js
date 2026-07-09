import { NextResponse } from 'next/server';
import { dbQuery } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

// Helper to initialize table
async function initTable() {
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS web_izin (
      pin VARCHAR(32) NOT NULL,
      tanggal DATE NOT NULL,
      tipe VARCHAR(50) NOT NULL,
      keterangan VARCHAR(255),
      PRIMARY KEY (pin, tanggal)
    )
  `);
}

// GET: Fetch all manual leaves
export async function GET() {
  try {
    await initTable();
    const leaves = await dbQuery(
      `SELECT wi.pin, DATE_FORMAT(wi.tanggal, '%Y-%m-%d') as date, wi.tipe as type, wi.keterangan as description, 
              p.pegawai_nama as employee_name, COALESCE(d.pembagian1_nama, 'General') as department
       FROM web_izin wi
       LEFT JOIN pegawai p ON wi.pin = p.pegawai_pin
       LEFT JOIN pembagian1 d ON p.pembagian1_id = d.pembagian1_id
       ORDER BY wi.tanggal DESC`
    );

    return NextResponse.json({
      status: 'success',
      data: leaves
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}

// POST: Add or update a leave
export async function POST(request) {
  try {
    await initTable();
    const body = await request.json();
    const { pin, date, type, description } = body;

    if (!pin || !date || !type) {
      return NextResponse.json(
        { status: 'error', message: 'PIN, tanggal, dan tipe izin wajib diisi.' },
        { status: 400 }
      );
    }

    // Insert or update on duplicate key
    const pinStr = pin.toString().padStart(3, '0');
    await dbQuery(
      `INSERT INTO web_izin (pin, tanggal, tipe, keterangan) 
       VALUES (?, ?, ?, ?) 
       ON DUPLICATE KEY UPDATE tipe = ?, keterangan = ?`,
      [pinStr, date, type, description || '', type, description || '']
    );

    return NextResponse.json({
      status: 'success',
      message: 'Izin karyawan berhasil dicatat!'
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}

// DELETE: Remove a leave
export async function DELETE(request) {
  try {
    await initTable();
    const { searchParams } = new URL(request.url);
    const pin = searchParams.get('pin');
    const date = searchParams.get('date');

    if (!pin || !date) {
      return NextResponse.json(
        { status: 'error', message: 'Parameter PIN dan tanggal (date) wajib disertakan.' },
        { status: 400 }
      );
    }

    const pinStr = pin.toString().padStart(3, '0');
    await dbQuery('DELETE FROM web_izin WHERE pin = ? AND tanggal = ?', [pinStr, date]);

    return NextResponse.json({
      status: 'success',
      message: 'Izin karyawan berhasil dihapus!'
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}
