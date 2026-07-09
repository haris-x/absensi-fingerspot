import mysql from 'mysql2/promise';

// Create a connection pool using environment variables (.env.local)
const pool = mysql.createPool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '3306'),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'fin_pro',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

/**
 * Helper function to run database queries
 * @param {string} sql SQL query string
 * @param {array} params Query parameter bindings
 */
export async function dbQuery(sql, params = []) {
  try {
    const [results] = await pool.execute(sql, params);
    return results;
  } catch (error) {
    console.error('Database Query Error:', error);
    throw error;
  }
}
