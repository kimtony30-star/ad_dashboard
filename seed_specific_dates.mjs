import { createClient } from "@libsql/client";
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import { resolve } from 'path';

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error('DATABASE_URL not set');

const url = new URL(DB_URL);
const client = createClient({ url: DB_URL });

// 재삽입할 날짜 목록
const TARGET_DATES = new Set(['2026-02-14', '2026-02-27']);

const FILES = [
  '/home/ubuntu/upload/ALL_20260201_20260214_daily_report.csv',
  '/home/ubuntu/upload/ALL_20260215_20260228_daily_report.csv',
];

function parseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  if (isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toNum(v) {
  const n = parseFloat(String(v).replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

const BATCH_SIZE = 500;
let totalInserted = 0;

for (const filePath of FILES) {
  console.log(`\n처리 중: ${filePath}`);
  const rows = [];

  const rl = createInterface({
    input: createReadStream(resolve(filePath)),
    crlfDelay: Infinity,
  });

  let headers = null;
  let lineCount = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    const cols = line.split(',');

    if (!headers) {
      headers = cols.map(h => h.trim().replace(/^\uFEFF/, ''));
      continue;
    }

    lineCount++;
    const get = (name) => {
      const idx = headers.indexOf(name);
      return idx >= 0 ? (cols[idx] || '').trim() : '';
    };

    const dateStr = parseDate(get('Date'));
    if (!dateStr || !TARGET_DATES.has(dateStr)) continue;

    rows.push([
      dateStr,
      parseInt(get('Year')) || null,
      parseInt(get('Month')) || null,
      parseInt(get('Day')) || null,
      get('App') || null,
      get('ADPF') || null,
      get('Adnetwork1') || null,
      get('Adnetwork2') || null,
      get('Unit_ID') || null,
      get('Unit_Name') || null,
      get('Creative_Type') || null,
      get('Place1') || null,
      get('Place2') || null,
      get('Place3') || null,
      toNum(get('Requests')),
      toNum(get('Fills')),
      toNum(get('Impressions')),
      toNum(get('Clicks')),
      toNum(get('Estimated Revenue')),
      toNum(get('Confirmed Revenue')),
      (get('Currency') || '').slice(0, 8) || null,
    ]);
  }

  console.log(`  대상 날짜 행 수: ${rows.length}`);

  // 배치 삽입
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const placeholders = batch.map(() => '(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').join(',');
    const values = batch.flat();
    await conn.execute(
      `INSERT INTO ad_stats (date, year, month, day, app, adpf, adnetwork1, adnetwork2, unitId, unitName, creativeType, place1, place2, place3, requests, fills, impressions, clicks, estimatedRevenue, confirmedRevenue, currency) VALUES ${placeholders}`,
      values
    );
    totalInserted += batch.length;
    process.stdout.write(`\r  삽입: ${totalInserted}행`);
  }
}

console.log(`\n\n완료! 총 ${totalInserted}행 삽입`);

