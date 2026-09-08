import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

const isSSL = Boolean(
  process.env.DB_SSL === 'true' ||
  process.env.POSTGRES_SSL === 'true' ||
  (connectionString && (connectionString.includes('supabase.co') || connectionString.includes('sslmode='))) ||
  process.env.NODE_ENV === 'production'
);

console.log('[db] Initializing PostgreSQL pool...');

const pool = new Pool({
  ...(connectionString
    ? { connectionString }
    : {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: Number(process.env.POSTGRES_PORT) || 5432,
        database: process.env.POSTGRES_DB || 'postgres',
        user: process.env.POSTGRES_USER || 'postgres',
        password: process.env.POSTGRES_PASSWORD || 'postgres'
      }),
  ...(isSSL ? { ssl: { rejectUnauthorized: false } } : {}),
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('connect', () => {
  console.log('[db] Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('[db] Unexpected PostgreSQL pool error:', err);
});

const initializeDatabase = async () => {
  const client = await pool.connect();
  try {
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
    console.log('[db] PostgreSQL database tables initialized successfully');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[db] Error initializing PostgreSQL tables:', error);
    throw error;
  } finally {
    client.release();
  }
};

initializeDatabase().catch((error) => {
  console.error('[db] PostgreSQL initialization failed:', error.message);
  process.exitCode = 1;
});

const cleanupInterval = setInterval(async () => {
  try {
    await pool.query('DELETE FROM sessions WHERE expiresAt < $1 OR isActive = 0', [Date.now()]);
  } catch (error) {
    console.error('[db] Session cleanup error:', error);
  }
}, 60 * 60 * 1000);

if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

const db = {
  mode: 'postgres',
  pool,
  all: async (query, params = []) => (await pool.query(query, params)).rows,
  get: async (query, params = []) => (await pool.query(query, params)).rows[0] || null,
  run: async (query, params = []) => {
    const result = await pool.query(query, params);
    return { changes: result.rowCount, lastID: result.rows[0]?.id };
  },
  exec: async (sql) => pool.query(sql)
};

export default db;
