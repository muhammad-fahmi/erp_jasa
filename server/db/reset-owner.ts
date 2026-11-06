import pg from 'pg';
import bcrypt from 'bcrypt';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const pool = new pg.Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5433'),
  user: process.env.DB_USER || 'erp_admin',
  password: process.env.DB_PASSWORD || 'secure_password_123',
  database: process.env.DB_NAME || 'erp_jasa_auth',
});

const hash = await bcrypt.hash('Owner123!', 10);
await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, 'owner@erp.local']);
console.log('updated owner hash cleanly');
await pool.end();
