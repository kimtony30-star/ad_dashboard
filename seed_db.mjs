/**
 * seed_db.mjs
 * CSV 파일을 DB에 배치 삽입하는 시딩 스크립트
 *
 * CSV 컬럼 구조 (34개):
 * Date, Year, Month, Day, ADPF, App, Adnetwork1, Adnetwork2,
 * Unit_ID, Unit_Name, Os, Device, Creative_Type, Size, Integration,
 * Category, Place0, Place1, Place2, Media, Unit_Price,
 * Requests, Fills, Impressions, Clicks,
 * P Request, P Fill, P Impressions, P Clicks,
 * Origin Revenue, Currency, Estimated Revenue, Confirmed Revenue, Memo
 */
import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { config } from "dotenv";

config();

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("ERROR: DATABASE_URL not found in .env");
  process.exit(1);
}

// 처리할 CSV 파일 목록 (인수로 받거나 기본값 사용)
const csvFiles = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : ["/home/ubuntu/upload/ALL_20260101_20260115_daily_report.csv"];

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsv(content) {
  const cleanContent = content.replace(/^\uFEFF/, "");
  const lines = cleanContent.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const rawHeaders = parseCsvLine(lines[0]);
  const headers = rawHeaders.map((h) => h.toLowerCase().replace(/ /g, "_"));
  const idx = (name) => headers.indexOf(name);

  const toNum = (s) => {
    if (!s || s === "" || s === "null") return 0;
    const n = parseFloat(String(s).replace(/,/g, ""));
    return isNaN(n) ? 0 : n;
  };

  const toStr = (s, maxLen = 128) => {
    if (!s || s === "" || s === "null") return null;
    return String(s).slice(0, maxLen);
  };

  const I = {
    date: idx("date"),
    year: idx("year"),
    month: idx("month"),
    day: idx("day"),
    adpf: idx("adpf"),
    app: idx("app"),
    adnetwork1: idx("adnetwork1"),
    adnetwork2: idx("adnetwork2"),
    unit_id: idx("unit_id"),
    unit_name: idx("unit_name"),
    creative_type: idx("creative_type"),
    place1: idx("place1"),
    place2: idx("place2"),
    place3: idx("place2"),
    requests: idx("requests"),
    fills: idx("fills"),
    impressions: idx("impressions"),
    clicks: idx("clicks"),
    currency: idx("currency"),
    estimated_revenue: idx("estimated_revenue"),
    confirmed_revenue: idx("confirmed_revenue"),
  };

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const row = parseCsvLine(lines[i]);
    const dateStr = row[I.date] ?? "";
    if (!dateStr) continue;

    let parsedDate;
    if (dateStr.includes("-")) {
      parsedDate = new Date(dateStr);
    } else if (dateStr.length === 8) {
      parsedDate = new Date(`${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}`);
    } else continue;

    if (isNaN(parsedDate.getTime())) continue;

    // SQLite에 Date 형식을 저장할 경우, ISO 문자열이 아닌 timestamp(숫자)이거나 Date 인스턴스를 받게 설계된 경우 문자열보다 integer 호환을 위해 getTime()을 쓰기도 함. 
    // 여기서는 drizzle이 SQLite integer({mode: timestamp})를 쓸 때 Date 객체를 어떻게 받을지가 중요.
    // drizzle-orm 의 seed용 생쿼리이므로 Date 대신 ms timestamp (integer) 로 적재
    const ts = parsedDate.getTime();

    rows.push([
      ts,
      parseInt(row[I.year]) || parsedDate.getFullYear(),
      parseInt(row[I.month]) || parsedDate.getMonth() + 1,
      parseInt(row[I.day]) || parsedDate.getDate(),
      toStr((row[I.app] ?? "").toLowerCase(), 64),
      toStr(row[I.adpf], 64),
      toStr(row[I.adnetwork1], 128),
      toStr(row[I.adnetwork2], 128),
      toStr(row[I.unit_id], 256),
      toStr(row[I.unit_name], 256),
      toStr(row[I.creative_type], 64),
      toStr(row[I.place1], 128),
      toStr(row[I.place2], 128),
      null,
      toNum(row[I.requests]),
      toNum(row[I.fills]),
      toNum(row[I.impressions]),
      toNum(row[I.clicks]),
      toNum(row[I.estimated_revenue]),
      toNum(row[I.confirmed_revenue]),
      toStr(row[I.currency], 8),
    ]);
  }
  return rows;
}

async function main() {
  console.log("Connecting to LibSQL...");
  const client = createClient({ url: DB_URL });

  let totalInserted = 0;

  for (const csvPath of csvFiles) {
    console.log(`\nLoading: ${csvPath}`);
    const content = readFileSync(csvPath, "utf-8");
    const rows = parseCsv(content);
    console.log(`  Parsed: ${rows.length} rows`);

    const CHUNK = 500;
    const startTime = Date.now();
    let fileInserted = 0;

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const placeholders = chunk.map(() => `(${new Array(21).fill('?').join(',')})`).join(',');
      const args = chunk.flat();
      
      const insertSql = `INSERT INTO ad_stats 
        (date, year, month, day, app, adpf, adnetwork1, adnetwork2,
        unitId, unitName, creativeType, place1, place2, place3,
        requests, fills, impressions, clicks,
        estimatedRevenue, confirmedRevenue, currency)
        VALUES ${placeholders}`;
        
      await client.execute({ sql: insertSql, args });
      fileInserted += chunk.length;
      totalInserted += chunk.length;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const pct = ((fileInserted / rows.length) * 100).toFixed(1);
      process.stdout.write(`\r  [${elapsed}s] ${fileInserted}/${rows.length} (${pct}%)`);
    }
    console.log(`\n  Done: ${fileInserted} rows inserted`);
  }

  console.log(`\n=== Total inserted: ${totalInserted} rows ===`);
}

main().catch((err) => {
  console.error("\nError:", err.message);
  process.exit(1);
});
