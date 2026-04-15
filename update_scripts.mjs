import fs from 'fs';
import path from 'path';

const dir = './';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.mjs') && f !== 'seed_db.mjs');

for (const file of files) {
  let content = fs.readFileSync(file, 'utf-8');
  if (!content.includes('mysql2/promise')) continue;

  // Replace imports
  content = content.replace(/import\s+{\s*createConnection\s*}\s+from\s+["']mysql2\/promise["'];/g, 'import { createClient } from "@libsql/client";');

  // Replace new Date(...) -> .getTime()
  content = content.replace(/const\s+fmt\s*=\s*\(d\)\s*=>\s*d\.toISOString\(\)\.slice\(0,\s*10\);/g, 'const ts = parsedDate.getTime();');
  content = content.replace(/fmt\(parsedDate\),/g, 'ts,');

  // Replace connection creation
  content = content.replace(/const\s+conn\s*=\s*await\s+createConnection\(\{[\s\S]*?\}\);/g, 'const client = createClient({ url: DB_URL });');
  content = content.replace(/await\s+conn\.end\(\);/g, '');

  content = content.replace(/const\s+insertSql\s*=\s*`INSERT\s+INTO\s+ad_stats\s+[\s\S]*?VALUES\s*\?`;/g, '');

  // Replace query execution
  content = content.replace(/await\s+conn\.query\(insertSql,\s*\[chunk\]\);/g, `const placeholders = chunk.map(() => \`(\${new Array(21).fill('?').join(',')})\`).join(',');
      const args = chunk.flat();
      const insertSql = \`INSERT INTO ad_stats 
        (date, year, month, day, app, adpf, adnetwork1, adnetwork2,
         unitId, unitName, creativeType, place1, place2, place3,
         requests, fills, impressions, clicks,
         estimatedRevenue, confirmedRevenue, currency)
        VALUES \${placeholders}\`;
      await client.execute({ sql: insertSql, args });`);

  fs.writeFileSync(file, content, 'utf-8');
  console.log(`Updated ${file}`);
}
