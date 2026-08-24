import db from './db.js';

async function seed(){
  console.log('Cleaning any existing dummy data...');

  try {
    const userCount = await db.get('SELECT COUNT(*) as c FROM users');

    if (userCount.c === 0) {
      console.log('No users found. Cleaning up any orphaned data...');
      await db.run('DELETE FROM products WHERE userId IS NULL OR userId = ""');
      await db.run('DELETE FROM orders WHERE userId IS NULL OR userId = ""');
      await db.run('DELETE FROM dispatches WHERE userId IS NULL OR userId = ""');
      await db.run(`
        DELETE FROM order_items
        WHERE order_id NOT IN (SELECT id FROM orders)
      `);
      console.log('Cleanup completed.');
    } else {
      console.log(`Found ${userCount.c} user(s). Skipping data cleanup to preserve user data.`);
    }

    console.log('Verifying database structure...');
    const tables = db.mode === 'memory'
      ? Object.keys(db.counts()).map(name => ({ name }))
      : await db.all(`
        SELECT table_name AS name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        ORDER BY table_name
      `);

    console.log('Database tables:');
    tables.forEach(table => {
      console.log(`   - ${table.name}`);
    });

    const counts = await Promise.all([
      db.get('SELECT COUNT(*) as c FROM users'),
      db.get('SELECT COUNT(*) as c FROM products'),
      db.get('SELECT COUNT(*) as c FROM orders'),
      db.get('SELECT COUNT(*) as c FROM dispatches')
    ]);

    console.log('\nCurrent data counts:');
    console.log(`   - Users: ${counts[0].c}`);
    console.log(`   - Products: ${counts[1].c}`);
    console.log(`   - Orders: ${counts[2].c}`);
    console.log(`   - Dispatches: ${counts[3].c}`);

    console.log('\nDatabase is ready for use!');
    console.log('Start the server and visit http://localhost:3000 to begin.');
  } catch (error) {
    console.error('Error during database setup:', error);
    throw error;
  }
}

seed().catch(console.error);