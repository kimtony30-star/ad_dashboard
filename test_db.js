import { drizzle } from 'drizzle-orm/mysql2';
try {
  const db = drizzle('file:./dev.db');
  db.select().from('users').then(console.log).catch(e => { console.error('QUERY ERROR:', e); });
} catch(e) {
  console.error('INIT ERROR:', e);
}
