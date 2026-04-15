/**
 * reseed_all.mjs
 * 3개 CSV 파일을 DB에 완전 재적재 (기존 데이터 전체 삭제 후 삽입)
 */
import fs from "fs";
import path from "path";
import { createClient } from "@libsql/client";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const dotenv = require("dotenv");
dotenv.config();

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not found");
  process.exit(1);
}

// DATABASE_URL 파싱
const url = new URL(DATABASE_URL);
const connConfig = {
  host: url.hostname,
  port: parseInt(url.port) || 4000,
  user: url.username,
  password: decodeURIComponent(url.password),
  database: url.pathname.slice(1),
  ssl: { rejectUnauthorized: false },
  multipleStatements: false,
};

const FILES = [
  "/home/ubuntu/upload/ALL_20260101_20260115_daily_report.csv",
  "/home/ubuntu/upload/ALL_20260116_20260131_daily_report.csv",
  "/home/ubuntu/upload/ALL_20260201_20260214_daily_report.csv",
];

function parseDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  if (str.includes("-")) return str.slice(0, 10);
  if (str.length === 8) return `${str.slice(0,4)}-${str.slice(4,6)}-${str.slice(6,8)}`;
  return null;
}

function toNum(s) {
  const n = parseFloat(String(s || "0").replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}

function parseCsv(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, "").toLowerCase().replace(/ /g, "_"));
  const idx = (name) => headers.indexOf(name);

  const getCol = (row, name) => {
    const i = idx(name);
    if (i === -1) return "";
    return (row[i] ?? "").trim().replace(/^"|"$/g, "");
  };

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(",");
    const dateStr = getCol(row, "date");
    const parsedDate = parseDate(dateStr);
    if (!parsedDate) continue;

    rows.push([
      parsedDate,
      parseInt(getCol(row, "year")) || parseInt(parsedDate.slice(0,4)),
      parseInt(getCol(row, "month")) || parseInt(parsedDate.slice(5,7)),
      parseInt(getCol(row, "day")) || parseInt(parsedDate.slice(8,10)),
      (getCol(row, "app") || "").toLowerCase(),
      getCol(row, "adpf"),
      getCol(row, "adnetwork1"),
      getCol(row, "adnetwork2"),
      getCol(row, "unit_id"),
      getCol(row, "unit_name"),
      getCol(row, "creative_type"),
      getCol(row, "place1"),
      getCol(row, "place2"),
      getCol(row, "place3"),
      toNum(getCol(row, "requests")),
      toNum(getCol(row, "fills")),
      toNum(getCol(row, "impressions")),
      toNum(getCol(row, "clicks")),
      toNum(getCol(row, "estimated_revenue")),
      toNum(getCol(row, "confirmed_revenue")),
      (getCol(row, "currency") || "").slice(0, 8),
    ]);
  }
  return rows;
}

async function main() {
  const conn = await createConnection(connConfig);
  console.log("DB 연결 성공");

  // 전체 데이터 삭제
  console.log("기존 데이터 전체 삭제 중...");
  await conn.execute("DELETE FROM ad_stats");
  console.log("삭제 완료");

  const BATCH = 1000;
  let totalInserted = 0;

  for (const filePath of FILES) {
    const fileName = path.basename(filePath);
    console.log(`\n[${fileName}] 파싱 중...`);
    const rows = parseCsv(filePath);
    console.log(`  파싱 완료: ${rows.length.toLocaleString()}행`);

    let inserted = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const batch = rows.slice(i, i + BATCH);
      const placeholders = batch.map(() => "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)").join(",");
      const values = batch.flat();
      await conn.execute(
        `INSERT INTO ad_stats (date,year,month,day,app,adpf,adnetwork1,adnetwork2,unitId,unitName,creativeType,place1,place2,place3,requests,fills,impressions,clicks,estimatedRevenue,confirmedRevenue,currency) VALUES ${placeholders}`,
        values
      );
      inserted += batch.length;
      if (inserted % 10000 === 0 || inserted === rows.length) {
        process.stdout.write(`\r  삽입: ${inserted.toLocaleString()}/${rows.length.toLocaleString()}행`);
      }
    }
    console.log(`\n  [${fileName}] 완료: ${inserted.toLocaleString()}행 삽입`);
    totalInserted += inserted;

    // upload_logs 기록
    const dates = rows.map(r => r[0]);
    const minDate = dates.reduce((a, b) => (a < b ? a : b));
    const maxDate = dates.reduce((a, b) => (a > b ? a : b));
    await conn.execute(
      "INSERT INTO upload_logs (fileName, dateMin, dateMax, totalRows, status) VALUES (?,?,?,?,'success')",
      [fileName, minDate, maxDate, inserted]
    );
  }

  console.log(`\n=== 전체 완료: ${totalInserted.toLocaleString()}행 삽입 ===`);

  // 검증
  const [result] = await conn.execute(
    "SELECT COUNT(*) as cnt, SUM(confirmedRevenue) as rev, SUM(impressions) as imp FROM ad_stats WHERE app IN ('ocb','syrup','olock')"
  );
  const r = result[0];
  console.log(`\n=== DB 검증 (OCB+Syrup+Olock) ===`);
  console.log(`  행 수: ${Number(r.cnt).toLocaleString()}`);
  console.log(`  Revenue: ₩${Number(r.rev).toLocaleString()}`);
  console.log(`  Impressions: ${Number(r.imp).toLocaleString()}`);

  
}

main().catch(e => { console.error(e); process.exit(1); });
