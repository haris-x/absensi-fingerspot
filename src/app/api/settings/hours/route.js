import { NextResponse } from 'next/server';
import { dbQuery } from '@/lib/mysql';

export const dynamic = 'force-dynamic';

// Helper to ensure the web_settings table exists
async function ensureTableExists() {
  await dbQuery(`
    CREATE TABLE IF NOT EXISTS web_settings (
      pembagian1_id INT NULL UNIQUE,
      jam_masuk TIME NOT NULL DEFAULT '08:00:00',
      jam_terlambat TIME NOT NULL DEFAULT '08:00:00',
      jam_pulang TIME NOT NULL DEFAULT '16:00:00',
      FOREIGN KEY (pembagian1_id) REFERENCES pembagian1(pembagian1_id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8;
  `);

  // Ensure default system row exists (pembagian1_id IS NULL)
  const defaultRow = await dbQuery('SELECT * FROM web_settings WHERE pembagian1_id IS NULL');
  if (defaultRow.length === 0) {
    await dbQuery(`
      INSERT INTO web_settings (pembagian1_id, jam_masuk, jam_terlambat, jam_pulang) 
      VALUES (NULL, '08:00:00', '08:00:00', '16:00:00')
    `);
  }
}

// GET: Retrieve all divisions and their custom work hour settings
export async function GET() {
  try {
    await ensureTableExists();

    // 1. Fetch system default settings
    const defaultSettingsRows = await dbQuery(
      'SELECT jam_masuk, jam_terlambat, jam_pulang FROM web_settings WHERE pembagian1_id IS NULL'
    );
    const defaultSettings = defaultSettingsRows[0];

    // 2. Fetch all divisions from pembagian1
    const divisions = await dbQuery(
      'SELECT pembagian1_id as id, pembagian1_nama as name FROM pembagian1 ORDER BY pembagian1_nama ASC'
    );

    // 3. Fetch custom division settings
    const customSettings = await dbQuery(
      'SELECT pembagian1_id as id, jam_masuk, jam_terlambat, jam_pulang FROM web_settings WHERE pembagian1_id IS NOT NULL'
    );

    // Map custom settings by division ID
    const settingsMap = {};
    customSettings.forEach(s => {
      settingsMap[s.id] = {
        jam_masuk: s.jam_masuk,
        jam_terlambat: s.jam_terlambat,
        jam_pulang: s.jam_pulang
      };
    });

    // Combine divisions with settings
    const divisionSettings = divisions.map(div => ({
      id: div.id,
      name: div.name,
      // If no custom setting exists, return null values so the UI knows it uses default
      jam_masuk: settingsMap[div.id]?.jam_masuk || null,
      jam_terlambat: settingsMap[div.id]?.jam_terlambat || null,
      jam_pulang: settingsMap[div.id]?.jam_pulang || null
    }));

    return NextResponse.json({
      status: 'success',
      data: {
        defaultSettings,
        divisionSettings
      }
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}

// POST: Save work hour configurations for default and specific divisions
export async function POST(request) {
  try {
    await ensureTableExists();
    const body = await request.json();
    const { defaultSettings, divisionSettings } = body;

    // 1. Save default system settings
    if (defaultSettings) {
      const { jam_masuk, jam_terlambat, jam_pulang } = defaultSettings;
      await dbQuery(
        `INSERT INTO web_settings (pembagian1_id, jam_masuk, jam_terlambat, jam_pulang) 
         VALUES (NULL, ?, ?, ?) 
         ON DUPLICATE KEY UPDATE 
           jam_masuk = VALUES(jam_masuk), 
           jam_terlambat = VALUES(jam_terlambat), 
           jam_pulang = VALUES(jam_pulang)`,
        [jam_masuk, jam_terlambat, jam_pulang]
      );
    }

    // 2. Save division-specific settings
    if (Array.isArray(divisionSettings)) {
      for (const ds of divisionSettings) {
        const { id, jam_masuk, jam_terlambat, jam_pulang } = ds;

        if (jam_masuk === null || jam_terlambat === null || jam_pulang === null) {
          // If any value is null, delete the custom configuration to fall back to default
          await dbQuery('DELETE FROM web_settings WHERE pembagian1_id = ?', [id]);
        } else {
          // Save or update custom config
          await dbQuery(
            `INSERT INTO web_settings (pembagian1_id, jam_masuk, jam_terlambat, jam_pulang) 
             VALUES (?, ?, ?, ?) 
             ON DUPLICATE KEY UPDATE 
               jam_masuk = VALUES(jam_masuk), 
               jam_terlambat = VALUES(jam_terlambat), 
               jam_pulang = VALUES(jam_pulang)`,
            [id, jam_masuk, jam_terlambat, jam_pulang]
          );
        }
      }
    }

    return NextResponse.json({
      status: 'success',
      message: 'Pengaturan jam kerja berhasil disimpan.'
    });
  } catch (error) {
    return NextResponse.json(
      { status: 'error', message: error.message },
      { status: 500 }
    );
  }
}
