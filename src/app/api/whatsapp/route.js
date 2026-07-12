import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const dynamic = 'force-dynamic';

function updateEnvValue(content, key, value) {
  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    return content.replace(regex, `${key}=${value}`);
  } else {
    const separator = content.endsWith('\n') ? '' : '\n';
    return `${content}${separator}${key}=${value}`;
  }
}

// GET: Check WhatsApp Bot status or retrieve groups list
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get('action');
  
  const botPort = process.env.WA_BOT_PORT || '3002';
  const botBaseUrl = process.env.WA_BOT_URL || `http://127.0.0.1:${botPort}`;
  
  if (action === 'groups') {
    try {
      const res = await fetch(`${botBaseUrl}/api/groups`, {
        headers: {
          'x-api-key': process.env.WA_API_KEY || 'madrasah_wa101'
        },
        cache: 'no-store',
        signal: AbortSignal.timeout(15000) // 15 second timeout for group fetch
      });
      
      if (!res.ok) {
        return NextResponse.json({
          status: 'error',
          message: `WhatsApp Bot API returned error status: ${res.status}`
        }, { status: res.status });
      }
      
      const json = await res.json();
      return NextResponse.json(json);
    } catch (error) {
      return NextResponse.json({
        status: 'error',
        message: `Gagal mengambil daftar grup dari bot: ${error.message}`
      }, { status: 500 });
    }
  }

  // Default: Get WhatsApp Bot Status
  try {
    const res = await fetch(`${botBaseUrl}/api/status`, {
      headers: {
        'x-api-key': process.env.WA_API_KEY || 'madrasah_wa101'
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(10000) // 10 second timeout
    });

    if (!res.ok) {
      return NextResponse.json({
        status: 'error',
        connected: false,
        message: `WhatsApp Bot API returned error status: ${res.status}`
      });
    }

    const json = await res.json();
    return NextResponse.json(json);
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      connected: false,
      message: `Gagal menghubungi API Bot: ${error.message}. Pastikan bot berjalan.`
    });
  }
}

// POST: Trigger manual absensi report send or save config
export async function POST(req) {
  try {
    let body = {};
    try {
      body = await req.json();
    } catch (e) {
      // Body can be empty for default send-absent trigger
    }

    const botPort = process.env.WA_BOT_PORT || '3002';
    const botBaseUrl = process.env.WA_BOT_URL || `http://127.0.0.1:${botPort}`;

    if (body.action === 'save-config') {
      const { groupJid, sendTime, reconciliationEnabled } = body;
      
      const envPath = path.join(process.cwd(), '.env.local');
      if (!fs.existsSync(envPath)) {
        return NextResponse.json({
          status: 'error',
          message: '.env.local tidak ditemukan di root proyek.'
        }, { status: 400 });
      }

      let envContent = fs.readFileSync(envPath, 'utf8');

      if (groupJid !== undefined) {
        envContent = updateEnvValue(envContent, 'WA_GROUP_JID', groupJid);
      }
      if (sendTime !== undefined) {
        envContent = updateEnvValue(envContent, 'WA_SEND_TIME', sendTime);
      }
      if (reconciliationEnabled !== undefined) {
        envContent = updateEnvValue(envContent, 'WA_RECONCILIATION_ENABLED', String(reconciliationEnabled));
      }

      fs.writeFileSync(envPath, envContent, 'utf8');

      // Restart WhatsApp Bot PM2 process in the background
      try {
        await execAsync('pm2 restart whatsapp-bot');
      } catch (err) {
        console.error('Failed to restart whatsapp-bot PM2 process:', err);
        return NextResponse.json({
          status: 'success',
          message: 'Konfigurasi berhasil disimpan, tetapi gagal me-restart PM2 bot secara otomatis: ' + err.message
        });
      }

      return NextResponse.json({
        status: 'success',
        message: 'Konfigurasi berhasil disimpan dan WhatsApp Bot telah di-restart untuk menerapkan perubahan.'
      });
    }

    // Default: Trigger manual absensi report send
    const res = await fetch(`${botBaseUrl}/api/send-absent`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'x-api-key': process.env.WA_API_KEY || 'madrasah_wa101'
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(120000) // 120 second timeout
    });

    const json = await res.json();
    return NextResponse.json(json);
  } catch (error) {
    return NextResponse.json({
      status: 'error',
      message: `Gagal menghubungi API Bot: ${error.message}`
    }, { status: 500 });
  }
}
