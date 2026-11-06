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

const password = 'Owner123!';
const hash = await bcrypt.hash(password, 10);

const roles = ['owner@erp.local', 'supervisor@erp.local', 'front@erp.local', 'tech@erp.local', 'qc@erp.local', 'finance@erp.local', 'parts@erp.local'];

for (const email of roles) {
  await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hash, email]);
  console.log(`Updated ${email}`);
}

console.log('All seed users now have password: Owner123!');
await pool.end();
