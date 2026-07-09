import { NextResponse } from 'next/server';
import { dbQuery } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

// GET: Fetch all registered holidays
export async function GET() {
  try {
    const holidays = await dbQuery(
      `SELECT DATE_FORMAT(libur_tgl, '%Y-%m-%d') as date, libur_keterangan as description 
       FROM libur 
       ORDER BY libur_tgl DESC`
    );

    return NextResponse.json({
      status: 'success',
      data: holidays
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}

// POST: Add a new holiday
export async function POST(request) {
  try {
    const body = await request.json();
    const { date, description } = body;

    if (!date || !description) {
      return NextResponse.json(
        { status: 'error', message: 'Tanggal dan keterangan libur wajib diisi.' },
        { status: 400 }
      );
    }

    // Insert holiday, update description if already exists
    await dbQuery(
      `INSERT INTO libur (libur_tgl, libur_keterangan, libur_status) 
       VALUES (?, ?, 1) 
       ON DUPLICATE KEY UPDATE libur_keterangan = ?, libur_status = 1`,
      [date, description, description]
    );

    return NextResponse.json({
      status: 'success',
      message: 'Hari libur berhasil ditambahkan!'
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}

// DELETE: Remove a holiday
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json(
        { status: 'error', message: 'Parameter tanggal (date) wajib disertakan.' },
        { status: 400 }
      );
    }

    await dbQuery('DELETE FROM libur WHERE libur_tgl = ?', [date]);

    return NextResponse.json({
      status: 'success',
      message: 'Hari libur berhasil dihapus!'
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}
