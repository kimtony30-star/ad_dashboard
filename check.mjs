import { createClient } from "@libsql/client";
const client = createClient({ url: "file:./dev.db" });

function fromUnixSec(ts) {
  return new Date(ts * 1000).toISOString().slice(0, 10);
}
function toUnixSec(dateStr) {
  return Math.floor(new Date(dateStr + "T00:00:00Z").getTime() / 1000);
}

// 최근 1주 일별 데이터 확인
const maxTs = 1775865600;
const weekFromTs = toUnixSec(fromUnixSec(maxTs - 6 * 86400));

const r1 = await client.execute(
  `SELECT date, app, SUM(confirmedRevenue) as rev, SUM(impressions) as imp 
   FROM ad_stats 
   WHERE app IN ('ocb','syrup','olock') AND date >= ${weekFromTs} AND date <= ${maxTs}
   GROUP BY date, app
   ORDER BY date
   LIMIT 20`
);
console.log("일별 앱별 데이터:", JSON.stringify(r1.rows, null, 2));