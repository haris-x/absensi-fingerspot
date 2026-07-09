import { NextResponse } from 'next/server';
import { dbQuery } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

export async function GET() {
  const startTime = microtime();
  try {
    // Run simple query to check connection
    await dbQuery('SELECT 1');
    
    // Check logs count
    const logRows = await dbQuery('SELECT COUNT(*) as count FROM att_log');
    const logsCount = logRows[0]?.count || 0;

    const endTime = microtime();
    const latency = Math.round((endTime - startTime) * 1000);

    return NextResponse.json({
      status: 'success',
      message: `Koneksi Berhasil! Terhubung ke Database Fingerspot Personnel (MySQL Port 3309). Menemukan total ${logsCount} data scan di database.`,
      latency
    });
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: `Gagal terhubung ke Database Fingerspot Personnel. Pastikan layanan database MySQL 'MYSQL_FINAPP' aktif di PC Anda. Error: ${error.message}`
    });
  }
}

function microtime() {
  return new Date().getTime() / 1000;
}
