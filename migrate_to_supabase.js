import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabaseConnectionString = process.env.DATABASE_URL || 'postgresql://postgres:bV*t$z&4c48rF3k@db.fjawqkaodrjtjjvdigwf.supabase.co:5432/postgres';

const pool = new pg.Pool({
  connectionString: supabaseConnectionString,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 10000
});

async function migrate() {
  console.log('🚀 Starting migration to Supabase PostgreSQL...');
  const client = await pool.connect();

  try {
    console.log('📦 Initializing database schema on Supabase...');
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS users(
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        company TEXT NOT NULL,
        password TEXT NOT NULL,
        createdAt BIGINT NOT NULL,
        lastLogin BIGINT,
        isActive INTEGER DEFAULT 1
      );
      CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

      CREATE TABLE IF NOT EXISTS products(
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        category TEXT,
        qty INTEGER DEFAULT 0,
        price REAL DEFAULT 0,
        expiry TEXT,
        low INTEGER DEFAULT 0,
        createdAt BIGINT,
        userId TEXT NOT NULL,
        company TEXT NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_products_user ON products(userId);
      CREATE INDEX IF NOT EXISTS idx_products_company ON products(company);
      CREATE INDEX IF NOT EXISTS idx_products_expiry ON products(expiry);

      CREATE TABLE IF NOT EXISTS orders(
        id TEXT PRIMARY KEY,
        customer TEXT NOT NULL,
        date TEXT,
        status TEXT,
        userId TEXT NOT NULL,
        company TEXT NOT NULL,
        createdAt BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000),
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(userId);
      CREATE INDEX IF NOT EXISTS idx_orders_company ON orders(company);
      CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(date);

      CREATE TABLE IF NOT EXISTS order_items(
        id SERIAL PRIMARY KEY,
        order_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        qty INTEGER,
        createdAt BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000)
      );
      CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

      CREATE TABLE IF NOT EXISTS dispatches(
        id TEXT PRIMARY KEY,
        order_id TEXT NOT NULL,
        transport TEXT,
        status TEXT,
        createdAt BIGINT,
        userId TEXT NOT NULL,
        company TEXT NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_dispatches_user ON dispatches(userId);
      CREATE INDEX IF NOT EXISTS idx_dispatches_company ON dispatches(company);
      CREATE INDEX IF NOT EXISTS idx_dispatches_order ON dispatches(order_id);

      CREATE TABLE IF NOT EXISTS sessions(
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        token TEXT NOT NULL,
        expiresAt BIGINT NOT NULL,
        createdAt BIGINT DEFAULT (EXTRACT(EPOCH FROM NOW()) * 1000),
        isActive INTEGER DEFAULT 1,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(token);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(userId);
      CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expiresAt);

      CREATE TABLE IF NOT EXISTS email_logs(
        id SERIAL PRIMARY KEY,
        userId TEXT NOT NULL,
        email TEXT NOT NULL,
        alertCount INTEGER,
        sentAt BIGINT NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_email_logs_user ON email_logs(userId);
      CREATE INDEX IF NOT EXISTS idx_email_logs_sent ON email_logs(sentAt);
    `);
    await client.query('COMMIT');
    console.log('✅ Schema initialization complete.');

    // Load data from local JSON database file
    const jsonPath = path.join(__dirname, 'data', 'warehouse-data.json');
    if (fs.existsSync(jsonPath)) {
      console.log(`\n📂 Found local database file at "${jsonPath}". Migrating data...`);
      const rawData = fs.readFileSync(jsonPath, 'utf8');
      const data = JSON.parse(rawData);

      // Migrate Users
      if (Array.isArray(data.users) && data.users.length > 0) {
        console.log(`  👤 Migrating ${data.users.length} users...`);
        for (const u of data.users) {
          const createdAt = u.createdAt || u.createdat || Date.now();
          await client.query(
            `INSERT INTO users (id, name, email, company, password, createdAt, lastLogin, isActive)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name,
               email = EXCLUDED.email,
               company = EXCLUDED.company,
               password = EXCLUDED.password,
               lastLogin = EXCLUDED.lastLogin,
               isActive = EXCLUDED.isActive`,
            [u.id, u.name, u.email, u.company, u.password, createdAt, u.lastLogin || null, u.isActive ?? 1]
          );
        }
        console.log(`  ✅ Users migrated successfully.`);
      }

      // Migrate Products
      if (Array.isArray(data.products) && data.products.length > 0) {
        console.log(`  📦 Migrating ${data.products.length} products...`);
        for (const p of data.products) {
          const createdAt = p.createdAt || p.createdat || Date.now();
          const userId = p.userId || p.userid;
          await client.query(
            `INSERT INTO products (id, name, category, qty, price, expiry, low, createdAt, userId, company)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name,
               category = EXCLUDED.category,
               qty = EXCLUDED.qty,
               price = EXCLUDED.price,
               expiry = EXCLUDED.expiry,
               low = EXCLUDED.low,
               userId = EXCLUDED.userId,
               company = EXCLUDED.company`,
            [p.id, p.name, p.category || '', p.qty || 0, p.price || 0, p.expiry || null, p.low || 0, createdAt, userId, p.company]
          );
        }
        console.log(`  ✅ Products migrated successfully.`);
      }

      // Migrate Orders
      if (Array.isArray(data.orders) && data.orders.length > 0) {
        console.log(`  📋 Migrating ${data.orders.length} orders...`);
        for (const o of data.orders) {
          const createdAt = o.createdAt || o.createdat || Date.now();
          const userId = o.userId || o.userid;
          await client.query(
            `INSERT INTO orders (id, customer, date, status, userId, company, createdAt)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO NOTHING`,
            [o.id, o.customer, o.date, o.status, userId, o.company, createdAt]
          );
        }
        console.log(`  ✅ Orders migrated successfully.`);
      }

      // Migrate Order Items
      if (Array.isArray(data.order_items) && data.order_items.length > 0) {
        console.log(`  🛒 Migrating ${data.order_items.length} order items...`);
        for (const item of data.order_items) {
          const createdAt = item.createdAt || item.createdat || Date.now();
          await client.query(
            `INSERT INTO order_items (order_id, product_id, qty, createdAt)
             VALUES ($1, $2, $3, $4)`,
            [item.order_id, item.product_id, item.qty, createdAt]
          );
        }
        console.log(`  ✅ Order items migrated successfully.`);
      }

      // Migrate Dispatches
      if (Array.isArray(data.dispatches) && data.dispatches.length > 0) {
        console.log(`  🚚 Migrating ${data.dispatches.length} dispatches...`);
        for (const d of data.dispatches) {
          const createdAt = d.createdAt || d.createdat || Date.now();
          const userId = d.userId || d.userid;
          await client.query(
            `INSERT INTO dispatches (id, order_id, transport, status, createdAt, userId, company)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO NOTHING`,
            [d.id, d.order_id, d.transport, d.status, createdAt, userId, d.company]
          );
        }
        console.log(`  ✅ Dispatches migrated successfully.`);
      }

      // Migrate Sessions
      if (Array.isArray(data.sessions) && data.sessions.length > 0) {
        console.log(`  🔑 Migrating ${data.sessions.length} sessions...`);
        for (const s of data.sessions) {
          const createdAt = s.createdAt || s.createdat || Date.now();
          const userId = s.userId || s.userid;
          await client.query(
            `INSERT INTO sessions (id, userId, token, expiresAt, createdAt, isActive)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT (id) DO NOTHING`,
            [s.id, userId, s.token, s.expiresAt, createdAt, s.isActive ?? 1]
          );
        }
        console.log(`  ✅ Sessions migrated successfully.`);
      }

      // Migrate Email Logs
      if (Array.isArray(data.email_logs) && data.email_logs.length > 0) {
        console.log(`  ✉️ Migrating ${data.email_logs.length} email logs...`);
        for (const el of data.email_logs) {
          const userId = el.userId || el.userid;
          const sentAt = el.sentAt || el.sentat || Date.now();
          await client.query(
            `INSERT INTO email_logs (userId, email, alertCount, sentAt)
             VALUES ($1, $2, $3, $4)`,
            [userId, el.email, el.alertCount || el.alertcount || 0, sentAt]
          );
        }
        console.log(`  ✅ Email logs migrated successfully.`);
      }
    } else {
      console.log('ℹ️ No local JSON data file found, tables initialized empty.');
    }

    // Verify row counts on Supabase
    const userCount = await client.query('SELECT COUNT(*) FROM users');
    const productCount = await client.query('SELECT COUNT(*) FROM products');
    const orderCount = await client.query('SELECT COUNT(*) FROM orders');
    const dispatchCount = await client.query('SELECT COUNT(*) FROM dispatches');

    console.log('\n📊 Current Supabase Database Record Counts:');
    console.log(`   - Users: ${userCount.rows[0].count}`);
    console.log(`   - Products: ${productCount.rows[0].count}`);
    console.log(`   - Orders: ${orderCount.rows[0].count}`);
    console.log(`   - Dispatches: ${dispatchCount.rows[0].count}`);

    console.log('\n🎉 Migration to Supabase PostgreSQL completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Migration failed:', err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
