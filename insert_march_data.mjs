/**
 * 3/1~3/15 CSV 데이터를 DB에 직접 적재하는 스크립트
 * Node.js ESM 모듈
 */
import { createClient } from "@libsql/client";
import { readFileSync } from 'fs';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// .env 로드
config({ path: resolve('/home/ubuntu/ad-dashboard/.env') });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('DATABASE_URL 환경변수가 없습니다.');
  process.exit(1);
}

console.log('DB 연결 중...');

// CSV 파싱
const CSV_PATH = '/home/ubuntu/upload/ALL_20260301_20260315_daily_report.csv';
console.log(`CSV 읽는 중: ${CSV_PATH}`);

const content = readFileSync(CSV_PATH, 'utf-8').replace(/^\uFEFF/, ''); // BOM 제거
const lines = content.split(/\r?\n/).filter(l => l.trim());
// RFC 4180 CSV 파싱 (따옴표 내 쉼표 처리)
function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

const rawHeaders = parseCsvLine(lines[0]).map(h => h.trim().replace(/^"|"$/g, '').toLowerCase());

console.log(`헤더 컬럼 수: ${rawHeaders.length}`);
console.log(`데이터 행 수: ${lines.length - 1}`);

function getCol(row, name) {
  const idx = rawHeaders.indexOf(name);
  if (idx === -1) return '';
  return (row[idx] ?? '').trim().replace(/^"|"$/g, '');
}

function toNum(s) {
  const n = parseFloat(s.replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

// 행 파싱
const rows = [];
let skipped = 0;
for (let i = 1; i < lines.length; i++) {
  const row = parseCsvLine(lines[i]);
  const dateStr = getCol(row, 'date');
  if (!dateStr) { skipped++; continue; }
  
  let normalizedDate;
  if (dateStr.includes('-') && dateStr.length === 10) {
    normalizedDate = dateStr;
  } else if (dateStr.length === 8 && !dateStr.includes('-')) {
    normalizedDate = `${dateStr.slice(0,4)}-${dateStr.slice(4,6)}-${dateStr.slice(6,8)}`;
  } else {
    skipped++;
    continue;
  }

  const app = getCol(row, 'app').toLowerCase();
  
  rows.push([
    normalizedDate,                                          // date
    parseInt(getCol(row, 'year')) || 2026,                  // year
    parseInt(getCol(row, 'month')) || 3,                    // month
    parseInt(getCol(row, 'day')) || 1,                      // day
    app,                                                     // app
    getCol(row, 'adpf'),                                    // adpf
    getCol(row, 'adnetwork1'),                              // adnetwork1
    getCol(row, 'adnetwork2'),                              // adnetwork2
    getCol(row, 'unit_id'),                                 // unitId
    getCol(row, 'unit_name'),                               // unitName
    getCol(row, 'creative_type'),                           // creativeType
    getCol(row, 'place1'),                                  // place1
    getCol(row, 'place2'),                                  // place2
    getCol(row, 'place3') || '',                            // place3
    toNum(getCol(row, 'requests')),                         // requests
    toNum(getCol(row, 'fills')),                            // fills
    toNum(getCol(row, 'impressions')),                      // impressions
    toNum(getCol(row, 'clicks')),                           // clicks
    String(toNum(getCol(row, 'estimated revenue'))),        // estimatedRevenue
    String(toNum(getCol(row, 'confirmed revenue'))),        // confirmedRevenue
    getCol(row, 'currency'),                                // currency
  ]);
}

console.log(`파싱 완료: ${rows.length}행 (skip: ${skipped}행)`);

// DB 연결 및 삽입
const conn = await createConnection(DATABASE_URL);
console.log('DB 연결 완료');

// 기존 데이터 삭제
console.log('기존 3/1~3/15 데이터 삭제 중...');
const [delResult] = await conn.execute(
  "DELETE FROM ad_stats WHERE date >= '2026-03-01' AND date <= '2026-03-15'"
);
console.log(`삭제 완료: ${delResult.affectedRows}행`);

// 배치 삽입 (500행씩)
const BATCH = 500;
let inserted = 0;
const SQL = `INSERT INTO ad_stats 
  (date, year, month, day, app, adpf, adnetwork1, adnetwork2, unitId, unitName, 
   creativeType, place1, place2, place3, requests, fills, impressions, clicks, 
   estimatedRevenue, confirmedRevenue, currency)
  VALUES ?`;

console.log(`삽입 시작 (${rows.length}행, ${BATCH}행씩 배치)...`);
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  await conn.query(SQL, [batch]);
  inserted += batch.length;
  if (inserted % 10000 === 0 || inserted === rows.length) {
    console.log(`  진행: ${inserted.toLocaleString()} / ${rows.length.toLocaleString()}행`);
  }
}

// 업로드 로그 기록
await conn.execute(
  `INSERT INTO upload_logs (fileName, dateMin, dateMax, totalRows, status) VALUES (?, ?, ?, ?, ?)`,
  ['ALL_20260301_20260315_daily_report.csv', '2026-03-01', '2026-03-15', inserted, 'success']
);



console.log(`\n✅ 완료! ${inserted.toLocaleString()}행 삽입됨`);
