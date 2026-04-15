/**
 * seed_feb15.mjs
 * 2/15~2/28 CSV 파일을 DB에 적재
 */
import { createClient } from "@libsql/client";
import { readFileSync } from "fs";
import { config } from "dotenv";
config();

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) throw new Error("DATABASE_URL not set");

const CSV_FILE = "/home/ubuntu/upload/ALL_20260215_20260228_daily_report.csv";
const BATCH_SIZE = 1000;

function parseDate(s) {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}
function toFloat(v) {
  const n = parseFloat(String(v).replace(/,/g, ""));
  return isNaN(n) ? 0 : n;
}
function toInt(v) {
  const n = parseInt(String(v).replace(/,/g, ""), 10);
  return isNaN(n) ? 0 : n;
}
function truncate(v, len) {
  if (v == null) return null;
  return String(v).slice(0, len) || null;
}

async function main() {
  const conn = await createConnection(DB_URL);
  console.log("DB 연결 성공");

  // 기존 2/15~2/28 데이터 삭제
  await conn.execute(
    "DELETE FROM ad_stats WHERE date >= ? AND date <= ?",
    ["2026-02-15", "2026-02-28"]
  );
  console.log("기존 2/15~2/28 데이터 삭제 완료");

  const raw = readFileSync(CSV_FILE, "utf-8");
  const lines = raw.split(/\r?\n/).filter(l => l.trim());
  const header = lines[0].split(",");
  const dataLines = lines.slice(1);
  console.log(`파싱할 행 수: ${dataLines.length.toLocaleString()}`);

  let totalInserted = 0;
  let batch = [];

  const flush = async () => {
    if (batch.length === 0) return;
    const placeholders = batch.map(() =>
      "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)"
    ).join(",");
    const sql = `INSERT INTO ad_stats (
      date,year,month,day,app,adpf,adnetwork1,adnetwork2,
      unitId,unitName,creativeType,place1,place2,
      requests,fills,impressions,clicks,
      estimatedRevenue,confirmedRevenue,currency
    ) VALUES ${placeholders}`;
    const flat = batch.flat();
    await conn.execute(sql, flat);
    totalInserted += batch.length;
    batch = [];
  };

  for (let i = 0; i < dataLines.length; i++) {
    const cols = dataLines[i].split(",");
    if (cols.length < 10) continue;
    // CSV 컬럼 순서:
    // 0:Date,1:Year,2:Month,3:Day,4:ADPF,5:App,6:Adnetwork1,7:Adnetwork2,
    // 8:Unit_ID,9:Unit_Name,10:Os,11:Device,12:Creative_Type,13:Size,14:Integration,
    // 15:Category,16:Place0,17:Place1,18:Place2,19:Media,20:Unit_Price,
    // 21:Requests,22:Fills,23:Impressions,24:Clicks,
    // 25:P Request,26:P Fill,27:P Impressions,28:P Clicks,
    // 29:Origin Revenue,30:Currency,31:Estimated Revenue,32:Confirmed Revenue,33:Memo
    const row = [
      parseDate(cols[0]),   // date
      toInt(cols[1]),       // year
      toInt(cols[2]),       // month
      toInt(cols[3]),       // day
      truncate(cols[5], 64),  // app
      truncate(cols[4], 32),  // adpf
      truncate(cols[6], 64),  // adnetwork1
      truncate(cols[7], 64),  // adnetwork2
      truncate(cols[8], 128), // unitId
      truncate(cols[9], 255), // unitName
      truncate(cols[12], 32), // creativeType
      truncate(cols[17], 128),// place1
      truncate(cols[18], 128),// place2
      toInt(cols[21]),        // requests
      toInt(cols[22]),        // fills
      toInt(cols[23]),        // impressions
      toInt(cols[24]),        // clicks
      toFloat(cols[31]),      // estimatedRevenue
      toFloat(cols[32]),      // confirmedRevenue
      truncate(cols[30], 8),  // currency
    ];
    batch.push(row);
    if (batch.length >= BATCH_SIZE) {
      await flush();
      if (totalInserted % 10000 === 0) {
        console.log(`  ${totalInserted.toLocaleString()}행 삽입 완료...`);
      }
    }
  }
  await flush();

  console.log(`\n완료! 총 ${totalInserted.toLocaleString()}행 삽입`);
  
}

main().catch(e => { console.error(e); process.exit(1); });
