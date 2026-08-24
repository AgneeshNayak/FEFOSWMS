import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const usePostgres = Boolean(
  process.env.DATABASE_URL ||
  process.env.POSTGRES_HOST ||
  process.env.POSTGRES_DB ||
  process.env.DB_CLIENT === 'postgres'
);

const now = () => Date.now();

function createFileDb() {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const dataDir = path.join(__dirname, 'data');
  const dbFile = process.env.LOCAL_DB_FILE || path.join(dataDir, 'warehouse-data.json');
  const initialTables = {
    users: [],
    products: [],
    orders: [],
    order_items: [],
    dispatches: [],
    sessions: [],
    email_logs: []
  };

  console.log(`[db/file] Initializing file-based database. Target path: "${dbFile}"`);

  try {
    fs.mkdirSync(path.dirname(dbFile), { recursive: true });
    if (fs.existsSync(dbFile)) {
      // Test read/write permission
      fs.accessSync(dbFile, fs.constants.R_OK | fs.constants.W_OK);
      console.log(`[db/file] Read/Write access verified for existing database file.`);
    } else {
      console.log(`[db/file] Database file does not exist. It will be initialized.`);
    }
  } catch (error) {
    console.error(`[db/file] Permission check or directory creation failed for "${dbFile}":`, error);
    throw error;
  }

  let tables = initialTables;
  if (fs.existsSync(dbFile)) {
    try {
      console.log(`[db/file] Reading database file from disk...`);
      const rawData = fs.readFileSync(dbFile, 'utf8');
      const parsed = JSON.parse(rawData);
      tables = { ...initialTables, ...parsed };
      console.log(`[db/file] Database loaded successfully. Counts:`, {
        users: tables.users.length,
        products: tables.products.length,
        orders: tables.orders.length,
        dispatches: tables.dispatches.length
      });
    } catch (error) {
      console.error(`[db/file] Critical: Failed to parse/load local database file "${dbFile}":`, error);
      throw new Error(`Could not read local database file ${dbFile}: ${error.message}`);
    }
  } else {
    try {
      console.log(`[db/file] Creating new database file structure...`);
      fs.writeFileSync(dbFile, JSON.stringify(tables, null, 2));
      console.log(`[db/file] Default database file initialized successfully.`);
    } catch (error) {
      console.error(`[db/file] Critical: Failed to write initial database file:`, error);
      throw error;
    }
  }

  let orderItemId = Math.max(0, ...tables.order_items.map(item => Number(item.id) || 0)) + 1;
  let emailLogId = Math.max(0, ...tables.email_logs.map(log => Number(log.id) || 0)) + 1;

  const persist = () => {
    try {
      fs.writeFileSync(dbFile, JSON.stringify(tables, null, 2));
      console.log(`[db/file] Database changes successfully written to disk.`);
    } catch (error) {
      console.error(`[db/file] Critical: Failed to write database changes to "${dbFile}":`, error);
      throw new Error(`Failed to persist database changes: ${error.message}`);
    }
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const tableCounts = () => Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length]));

  console.log(`[db/file] Local file database is ready.`);
  console.log('Set DATABASE_URL or DB_CLIENT=postgres to use PostgreSQL.');

  return {
    mode: 'file',
    counts: tableCounts,

    async all(query, params = []) {
      const sql = query.replace(/\s+/g, ' ').trim().toLowerCase();

      if (sql.includes('from information_schema.tables') || sql.includes('from sqlite_master')) {
        return Object.keys(tables).map(name => ({ name, table_name: name }));
      }

      if (sql.startsWith('select * from products where company')) {
        return clone(tables.products.filter(p => p.company === params[0]).sort((a, b) => (b.createdAt || b.createdat || 0) - (a.createdAt || a.createdat || 0)));
      }

      if (sql.startsWith('select * from orders where company')) {
        return clone(tables.orders.filter(o => o.company === params[0]).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))));
      }

      if (sql.includes('from order_items') && sql.includes('join orders')) {
        const company = params[0];
        const orderIds = new Set(tables.orders.filter(o => o.company === company).map(o => o.id));
        return clone(tables.order_items.filter(item => orderIds.has(item.order_id)));
      }

      if (sql.startsWith('select * from dispatches where company')) {
        return clone(tables.dispatches.filter(d => d.company === params[0]).sort((a, b) => (b.createdAt || b.createdat || 0) - (a.createdAt || a.createdat || 0)));
      }

      if (sql === 'select id from users') {
        return clone(tables.users.map(({ id }) => ({ id })));
      }

      throw new Error(`Unsupported in-memory query: ${query}`);
    },

    async get(query, params = []) {
      const sql = query.replace(/\s+/g, ' ').trim().toLowerCase();

      if (sql.startsWith('select count(*) as c from users')) return { c: tables.users.length };
      if (sql.startsWith('select count(*) as c from products')) return { c: tables.products.length };
      if (sql.startsWith('select count(*) as c from orders')) return { c: tables.orders.length };
      if (sql.startsWith('select count(*) as c from dispatches')) return { c: tables.dispatches.length };

      if (sql.startsWith('select * from users where email')) {
        const user = tables.users.find(u => u.email === params[0]);
        return user ? clone(user) : null;
      }

      if (sql.startsWith('select id, email, name, company from users where id')) {
        const user = tables.users.find(u => u.id === params[0]);
        return user ? clone({ id: user.id, email: user.email, name: user.name, company: user.company }) : null;
      }

      if (sql.startsWith('select id from users where email') && sql.includes('id !=')) {
        const user = tables.users.find(u => u.email === params[0] && u.id !== params[1]);
        return user ? clone({ id: user.id }) : null;
      }

      if (sql.startsWith('select id from users where email')) {
        const user = tables.users.find(u => u.email === params[0]);
        return user ? clone({ id: user.id }) : null;
      }

      if (sql.startsWith('select * from products where id')) {
        const product = tables.products.find(p => p.id === params[0] && p.company === params[1]);
        return product ? clone(product) : null;
      }

      if (sql.startsWith('select id from orders where company')) {
        const rows = tables.orders.filter(o => o.company === params[0]).sort((a, b) => (b.createdAt || b.createdat || 0) - (a.createdAt || a.createdat || 0));
        return rows[0] ? clone({ id: rows[0].id }) : null;
      }

      if (sql.startsWith('select id from dispatches where company')) {
        const rows = tables.dispatches.filter(d => d.company === params[0]).sort((a, b) => (b.createdAt || b.createdat || 0) - (a.createdAt || a.createdat || 0));
        return rows[0] ? clone({ id: rows[0].id }) : null;
      }

      if (sql.startsWith('select count(*) as c from dispatches where status')) {
        return { c: tables.dispatches.filter(d => d.status === params[0] && d.company === params[1]).length };
      }

      return null;
    },

    async run(query, params = []) {
      const sql = query.replace(/\s+/g, ' ').trim().toLowerCase();

      if (sql.startsWith('insert into users')) {
        const [id, name, email, company, password, createdAt] = params;
        tables.users.push({ id, name, email, company, password, createdAt, createdat: createdAt, lastLogin: null, isActive: 1 });
        persist();
        return { changes: 1, lastID: id };
      }

      if (sql.startsWith('update users set lastlogin')) {
        const user = tables.users.find(u => u.id === params[1]);
        if (user) { user.lastLogin = params[0]; persist(); }
        return { changes: user ? 1 : 0 };
      }

      if (sql.startsWith('update users set name')) {
        const user = tables.users.find(u => u.id === params[1]);
        if (user) { user.name = params[0]; persist(); }
        return { changes: user ? 1 : 0 };
      }

      if (sql.startsWith('update users set password')) {
        const user = tables.users.find(u => u.id === params[1]);
        if (user) { user.password = params[0]; persist(); }
        return { changes: user ? 1 : 0 };
      }

      if (sql.startsWith('update users set email')) {
        const user = tables.users.find(u => u.id === params[1]);
        if (user) { user.email = params[0]; persist(); }
        return { changes: user ? 1 : 0 };
      }

      if (sql.startsWith('insert into products')) {
        const [id, name, category, qty, price, expiry, low, createdAt, userId, company] = params;
        const existingIndex = tables.products.findIndex(p => p.id === id && p.company === company);
        if (existingIndex >= 0) {
          tables.products[existingIndex] = { id, name, category, qty, price, expiry, low, createdAt, createdat: createdAt, userId, userid: userId, company };
        } else {
          tables.products.push({ id, name, category, qty, price, expiry, low, createdAt, createdat: createdAt, userId, userid: userId, company });
        }
        persist();
        return { changes: 1, lastID: id };
      }

      if (sql.startsWith('update products set qty = qty')) {
        const product = tables.products.find(p => p.id === params[1] && p.company === params[2]);
        if (product) { product.qty -= params[0]; persist(); }
        return { changes: product ? 1 : 0 };
      }

      if (sql.startsWith('update products set name')) {
        const product = tables.products.find(p => p.id === params[5] && p.company === params[6]);
        if (product) { Object.assign(product, { name: params[0], category: params[1], qty: params[2], price: params[3], expiry: params[4] }); persist(); }
        return { changes: product ? 1 : 0 };
      }

      if (sql.startsWith('delete from products where company')) {
        const before = tables.products.length;
        tables.products = tables.products.filter(p => p.company !== params[0]);
        persist();
        return { changes: before - tables.products.length };
      }

      if (sql.startsWith('delete from products')) {
        const before = tables.products.length;
        if (params.length === 1) {
          tables.products = tables.products.filter(p => p.company !== params[0]);
        } else if (params.length >= 2) {
          tables.products = tables.products.filter(p => !(p.id === params[0] && p.company === params[1]));
        }
        persist();
        return { changes: before - tables.products.length };
      }

      if (sql.startsWith('insert into orders')) {
        const [id, customer, date, status, userId, company] = params;
        persist();
        return { changes: 1, lastID: id };
      }

      if (sql.startsWith('insert into order_items')) {
        const [order_id, product_id, qty] = params;
        tables.order_items.push({ id: orderItemId++, order_id, product_id, qty, createdAt: now(), createdat: now() });
        persist();
        return { changes: 1, lastID: orderItemId - 1 };
      }

      if (sql.startsWith('insert into dispatches')) {
        const [id, order_id, transport, status, createdAt, userId, company] = params;
        tables.dispatches.push({ id, order_id, transport, status, createdAt, createdat: createdAt, userId, userid: userId, company });
        persist();
        return { changes: 1, lastID: id };
      }

      if (sql.startsWith('insert into email_logs')) {
        const [userId, email, alertCount, sentAt] = params;
        tables.email_logs.push({ id: emailLogId++, userId, userid: userId, email, alertCount, alertcount: alertCount, sentAt, sentat: sentAt });
        persist();
        return { changes: 1, lastID: emailLogId - 1 };
      }

      if (sql.startsWith('delete from sessions')) return { changes: 0 };
      if (sql.startsWith('delete from order_items')) return { changes: 0 };
      if (sql.startsWith('delete from products') || sql.startsWith('delete from orders') || sql.startsWith('delete from dispatches')) return { changes: 0 };

      throw new Error(`Unsupported in-memory statement: ${query}`);
    },

    async exec() {
      return { rows: [] };
    }
  };
}

function createPostgresDb() {
  const { Pool } = pg;
  const pool = new Pool({
    ...(process.env.DATABASE_URL
      ? { connectionString: process.env.DATABASE_URL }
      : {
          host: process.env.POSTGRES_HOST || 'localhost',
          port: process.env.POSTGRES_PORT || 5432,
          database: process.env.POSTGRES_DB || 'warehouse',
          user: process.env.POSTGRES_USER || 'postgres',
          password: process.env.POSTGRES_PASSWORD || 'postgres'
        }),
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000
  });

  pool.on('connect', () => console.log('Connected to PostgreSQL database'));
  pool.on('error', (err) => console.error('Unexpected PostgreSQL error:', err));

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
      console.log('PostgreSQL database tables created successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Error creating tables:', error);
      throw error;
    } finally {
      client.release();
    }
  };

  initializeDatabase().catch((error) => {
    console.error('PostgreSQL initialization failed:', error.message);
    process.exitCode = 1;
  });

  setInterval(async () => {
    try {
      await pool.query('DELETE FROM sessions WHERE expiresAt < $1 OR isActive = 0', [Date.now()]);
    } catch (error) {
      console.error('Session cleanup error:', error);
    }
  }, 60 * 60 * 1000);

  return {
    mode: 'postgres',
    all: async (query, params = []) => (await pool.query(query, params)).rows,
    get: async (query, params = []) => (await pool.query(query, params)).rows[0] || null,
    run: async (query, params = []) => {
      const result = await pool.query(query, params);
      return { changes: result.rowCount, lastID: result.rows[0]?.id };
    },
    exec: async (sql) => pool.query(sql)
  };
}

const db = usePostgres ? createPostgresDb() : createFileDb();

export default db;

