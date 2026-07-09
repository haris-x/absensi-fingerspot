import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// POST: Trigger fingerprint device sync via WhatsApp bot API
export async function POST() {
  try {
    const botPort = process.env.WA_BOT_PORT || '3002';
    const res = await fetch(`http://127.0.0.1:${botPort}/api/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(60000) // 60 second timeout for sync
    });

    const json = await res.json();
    return NextResponse.json(json);
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        message: `Gagal menghubungi API Bot untuk sinkronisasi: ${error.message}. Pastikan WhatsApp Bot sedang berjalan.`
      },
      { status: 500 }
    );
  }
}

// GET: Check device status via WhatsApp bot API
export async function GET() {
  try {
    const botPort = process.env.WA_BOT_PORT || '3002';
    const res = await fetch(`http://127.0.0.1:${botPort}/api/device-status`, {
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    const json = await res.json();
    return NextResponse.json(json);
  } catch (error) {
    return NextResponse.json(
      {
        status: 'error',
        reachable: false,
        error: `Gagal menghubungi API Bot: ${error.message}`
      },
      { status: 500 }
    );
  }
}
